/**
 * Raster 縮圖管線：PNG／JPEG／GIF 的 dependency-free、deterministic 串流解碼，以及手工 PNG 編碼。
 *
 * 設計約束：
 * - 只用 Node builtin（node:fs、node:zlib），不新增任何 npm 相依。
 * - 輸出確定性：同一輸入 bytes 產生完全相同的輸出 PNG bytes（無時間戳、無亂數、無 locale 相依）。
 * - 逐列（或逐 MCU）串流解碼：任何時刻只保留「單列 + 縮圖」等級的記憶體，不把整個檔案讀進單一 buffer，
 *   因此 400 MiB 的檔案也只需 O(單列 + 縮圖) 記憶體。
 * - 一律不 throw：截斷、CRC 不符、維度不一致、I/O 失敗與未支援變體全部回 undefined。
 *
 * 支援範圍：
 * - PNG：bit depth 8 的灰階／灰階+alpha／RGB／RGBA，以及 palette（1／2／4／8 bit，含 tRNS）；
 *   非交錯與 Adam7 交錯、filter type 0-4、輔助 chunk。
 * - JPEG：8-bit baseline（SOF0／SOF1）與 progressive（SOF2）、restart marker（DRI／RST）；
 *   灰階與 YCbCr（4:4:4／4:2:2／4:2:0）。縮圖直接使用每個 8x8 block 的 DC 係數
 *   （DC*Q/8 + 128 即該 block 的平均值），不做 IDCT、不保留 AC，因此 JPEG 的取樣解析度是原圖的 1/8
 *   （例如 32x24 的 JPEG 產生 4x3 的縮圖），再縮放到 maxEdge 之內。
 * - GIF：第一格畫面，支援 interlace、global／local color table 與透明索引（透明 → alpha 0）。
 * - 輸出：非交錯、bit depth 8、RGB 或 RGBA 的 PNG（filter 一律 0，zlib 由 node:zlib 產生）。
 *
 * 已知限制（這些情形明確回 undefined，屬 fail-closed，不是靜默降級）：
 * - PNG bit depth 16（灰階／RGB／RGBA 的 16-bit）與 bit depth 1／2／4 的灰階：未支援。
 * - PNG 宣告邊長 > 65536：未支援（防禦性上限；JPEG／GIF 的格式上限本身就是 65535）。
 * - PNG 的 tRNS 只支援 palette（color type 3）：灰階／RGB 的 tRNS 一律視為不透明。
 * - JPEG：12-bit、arithmetic coding（SOF9-SOF11）、lossless（SOF3）、4 分量（CMYK／YCCK）、
 *   非 interleaved 的彩色 scan、第一個 DC scan 之前出現的 AC／refinement scan、以及 progressive 的
 *   DC refinement scan（只取第一個完整 DC scan，最多少 1 bit 的 DC 精確度）。
 *   3 分量的色彩轉換一律假設 YCbCr；RGB-coded JPEG（Adobe APP14 transform=0 或 R／G／B 分量 id）
 *   會被判為不支援，避免產生顏色錯誤的縮圖。
 * - GIF：只解第一格；動畫的 disposal 與後續 frame 不處理。縮圖的取樣空間是 frame 自己的像素網格
 *   （left／top 只用來驗證 frame 落在 logical screen 內，不做畫布合成）。
 * - 只驗證實際消耗到的 PNG chunk CRC；影像解碼完成後不再讀取剩餘 chunk（串流與記憶體要求）。
 *
 * 整合註記：readRasterDimensions 只從 head 前綴解析，JPEG 需要 head 足以走到 SOFn（建議呼叫端傳入
 * 至少 4 KiB 的檔頭），資料不足一律回 undefined。
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { deflateSync } from "node:zlib";

export type RasterFormat = "png" | "jpeg" | "gif";

export type RasterDimensions = Readonly<{ width: number; height: number }>;

export type RasterThumbnail = Readonly<{ bytes: Uint8Array; width: number; height: number }>;

export type RasterThumbnailRequest = Readonly<{
  path: string;
  format: RasterFormat;
  width: number;
  height: number;
  maxEdge?: number;
}>;

export type RasterDimensionRequest = Readonly<{ head: Uint8Array; format: RasterFormat }>;

const DEFAULT_MAX_EDGE = 320;
/** 宣告邊長上限：避免依攻擊者控制的 IHDR／LSD 尺寸配置過大的列緩衝區。 */
const MAX_SOURCE_EDGE = 65536;
const READ_CHUNK = 1 << 16;
const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const CRC32_INITIAL = 0xffffffff;
const EMPTY_BYTES = new Uint8Array(0);

/** 內部錯誤訊號；只在 decodeRasterThumbnail 的 catch 邊界轉成 undefined。 */
class RasterFailure extends Error {
  constructor() {
    super("raster decode failed");
    this.name = "RasterFailure";
  }
}

function failRaster(): never {
  throw new RasterFailure();
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** byte 遮罩；bitCount 可能到 24，位移 31 以上在 JS 會繞回，故先夾住。 */
function lowBitsMask(count: number): number {
  return count >= 31 ? 0x7fffffff : (1 << count) - 1;
}

// ---------------------------------------------------------------------------
// CRC32（PNG chunk）
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC_TABLE[(value ^ bytes[index]!) & 0xff]! ^ (value >>> 8);
  }
  return value >>> 0;
}

function crc32Finish(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Of(typeBytes: Uint8Array, data: Uint8Array): number {
  return crc32Finish(crc32Update(crc32Update(CRC32_INITIAL, typeBytes), data));
}

function asciiBytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

// ---------------------------------------------------------------------------
// 檔案游標：固定大小的內部緩衝區，永不整檔讀入
// ---------------------------------------------------------------------------

class FileCursor {
  private readonly buffer: Buffer;
  private start = 0;
  private end = 0;
  private position = 0;
  private readonly size: number;
  private readonly descriptor: number;

  private constructor(descriptor: number, size: number) {
    this.descriptor = descriptor;
    this.size = size;
    this.buffer = Buffer.allocUnsafe(READ_CHUNK);
  }

  static open(path: string): FileCursor {
    const descriptor = openSync(path, "r");
    try {
      const stats = fstatSync(descriptor);
      if (!stats.isFile()) failRaster();
      return new FileCursor(descriptor, stats.size);
    } catch (error) {
      closeSync(descriptor);
      throw error;
    }
  }

  close(): void {
    closeSync(this.descriptor);
  }

  private refill(): boolean {
    if (this.start < this.end) return true;
    if (this.position >= this.size) return false;
    const wanted = Math.min(this.buffer.length, this.size - this.position);
    const read = readSync(this.descriptor, this.buffer, 0, wanted, this.position);
    if (read <= 0) {
      this.position = this.size;
      return false;
    }
    this.position += read;
    this.start = 0;
    this.end = read;
    return true;
  }

  /** 取出最多 count bytes 的視圖；呼叫者必須在下一次 take 之前用完（其後緩衝區可能被覆寫）。 */
  take(count: number): Uint8Array | undefined {
    if (count <= 0) return EMPTY_BYTES;
    if (!this.refill()) return undefined;
    const available = Math.min(count, this.end - this.start);
    const view = this.buffer.subarray(this.start, this.start + available);
    this.start += available;
    return view;
  }

  readByte(): number {
    if (!this.refill()) return -1;
    return this.buffer[this.start++]!;
  }

  /** 填滿 target 的前 length bytes；EOF 時回 false。 */
  readInto(target: Uint8Array, length: number): boolean {
    let offset = 0;
    while (offset < length) {
      const view = this.take(length - offset);
      if (view === undefined) return false;
      target.set(view, offset);
      offset += view.length;
    }
    return true;
  }

  /** 跳過 length bytes；有給 crc 時一併累計。EOF 時回 undefined。 */
  skip(length: number, crc?: number): number | undefined {
    let remaining = length;
    let value = crc ?? CRC32_INITIAL;
    while (remaining > 0) {
      const view = this.take(remaining);
      if (view === undefined) return undefined;
      if (crc !== undefined) value = crc32Update(value, view);
      remaining -= view.length;
    }
    return crc === undefined ? 0 : value;
  }
}

// ---------------------------------------------------------------------------
// Huffman：canonical code 以 MSB-first 插入二元樹；解碼時逐位元走樹
// ---------------------------------------------------------------------------

/**
 * 樹節點池。0 是「不存在」的 sentinel，因此 root 由 1 起算（index 0 永遠不使用）。
 * 重用同一個池可避免每個 deflate block 重新配置（大檔案的 block 數量可觀）。
 */
class HuffmanPool {
  left: Int32Array;
  right: Int32Array;
  symbol: Int32Array;
  count = 1;
  empty = false;

  constructor(capacity: number) {
    this.left = new Int32Array(capacity);
    this.right = new Int32Array(capacity);
    this.symbol = new Int32Array(capacity);
    this.symbol.fill(-1);
  }

  reset(): void {
    this.left.fill(0);
    this.right.fill(0);
    this.symbol.fill(-1);
    this.count = 1;
    this.empty = false;
  }

  newNode(): number {
    const index = this.count;
    if (index >= this.left.length) {
      const capacity = this.left.length * 2;
      const left = new Int32Array(capacity);
      left.set(this.left);
      this.left = left;
      const right = new Int32Array(capacity);
      right.set(this.right);
      this.right = right;
      const symbol = new Int32Array(capacity);
      symbol.fill(-1);
      symbol.set(this.symbol);
      this.symbol = symbol;
    }
    this.count = index + 1;
    return index;
  }
}

/**
 * 由 code length 表建立 canonical Huffman 樹。
 * `values` 是「第 n 個表項對應的符號值」；省略時符號值就是索引（deflate）。
 * JPEG 的 DHT 必須提供 values，因為 AC 表的符號值不是連續的。
 * over-subscribed（碼字總長超過可用碼空間）回 false；incomplete 表保留空洞，
 * 解碼走到空洞即視為非法碼。
 */
function buildHuffman(
  pool: HuffmanPool,
  lengths: Uint8Array,
  count: number,
  maxBits: number,
  values?: Uint8Array,
): boolean {
  pool.reset();
  const root = pool.newNode();
  const counts = new Int32Array(maxBits + 1);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const length = lengths[index]!;
    if (length > maxBits) return false;
    if (length > 0) {
      counts[length] = counts[length]! + 1;
      total += 1;
    }
  }
  if (total === 0) {
    pool.empty = true;
    return true;
  }
  let left = 1;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    left = (left << 1) - counts[bits]!;
    if (left < 0) return false;
  }
  const nextCode = new Int32Array(maxBits + 1);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + counts[bits - 1]!) << 1;
    nextCode[bits] = code;
  }
  for (let symbol = 0; symbol < count; symbol += 1) {
    const length = lengths[symbol]!;
    if (length === 0) continue;
    const value = nextCode[length]!;
    nextCode[length] = value + 1;
    let node = root;
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      const step = (value >>> bit) & 1;
      let child = step === 0 ? pool.left[node]! : pool.right[node]!;
      if (child === 0) {
        child = pool.newNode();
        if (step === 0) pool.left[node] = child;
        else pool.right[node] = child;
      }
      node = child;
    }
    pool.symbol[node] = values === undefined ? symbol : values[symbol]!;
  }
  return true;
}

// ---------------------------------------------------------------------------
// DEFLATE（inflate）：pull 式狀態機，可暫停於任何完整符號邊界，輸出直接寫進目標列
// ---------------------------------------------------------------------------

const LENGTH_BASE = Uint16Array.of(
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
);
const LENGTH_EXTRA = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0);
const DISTANCE_BASE = Uint16Array.of(
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
);
const DISTANCE_EXTRA = Uint8Array.of(
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
);
const CODE_LENGTH_ORDER = Uint8Array.of(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15);

const LENGTH_SYMBOLS = 288;
const DISTANCE_SYMBOLS = 30;
const CODE_LENGTH_SYMBOLS = 19;
const HISTORY_BITS = 15;
const HISTORY_MASK = (1 << HISTORY_BITS) - 1;

/** inflate 的階段：header → body（literal／length）→ extra → distance → extra → copy。 */
const PHASE_HEADER = 0;
const PHASE_BODY = 1;
const PHASE_LENGTH_EXTRA = 2;
const PHASE_DISTANCE = 3;
const PHASE_DISTANCE_EXTRA = 4;
const PHASE_COPY = 5;
const PHASE_STORED = 6;

/** dynamic header 的階段：1 = 讀 HLIT/HDIST/HCLEN，2 = 讀 code-length code 長度，3 = 讀 code 長度。 */
const DYNAMIC_COUNTS = 1;
const DYNAMIC_CODE_LENGTHS = 2;
const DYNAMIC_LENGTHS = 3;

/**
 * 位元緩衝區的使用上限是 24 bits：每次加入一個 byte 前要求 bitCount <= 24，位移量才不會超過 31。
 * 因應這個上限，任何 ensureBits 呼叫都不得超過 24 bits（本檔最大的是 stored block 的 16 bits）。
 * 輸入耗盡後以 0 補位，再用「已丟棄位元數 > 實際載入位元數」判定截斷，
 * 因此合法檔案尾端不足 24 bits 的殘餘不會被誤判為截斷。
 */
class Inflate {
  private readonly literalPool = new HuffmanPool(1024);
  private readonly distancePool = new HuffmanPool(128);
  private readonly codeLengthPool = new HuffmanPool(64);
  private readonly literalLengths = new Uint8Array(LENGTH_SYMBOLS);
  private readonly distanceLengths = new Uint8Array(32);
  private readonly codeLengthLengths = new Uint8Array(CODE_LENGTH_SYMBOLS);
  private readonly history = new Uint8Array(1 << HISTORY_BITS);
  private input: Uint8Array = EMPTY_BYTES;
  private inputPosition = 0;
  private inputEnded = false;
  private bitBuffer = 0;
  private bitCount = 0;
  private loadedBits = 0;
  private droppedBits = 0;
  private historyPosition = 0;
  private totalOutput = 0;
  private phase = PHASE_HEADER;
  private headerStage = 0;
  private finalBlock = false;
  private blockOpen = false;
  private headerType = 0;
  private storedLength = 0;
  private storedRemaining = 0;
  private matchRemaining = 0;
  private matchDistance = 0;
  private pendingLength = 0;
  private extraBits = 0;
  private extraValue = 0;
  private extraOffset = 0;
  private dynamicStage = 0;
  private dynamicIndex = 0;
  private dynamicLiteralCount = 0;
  private dynamicDistanceCount = 0;
  private dynamicCodeLengthCount = 0;
  ended = false;

  /** 回傳實際寫入 target 的 byte 數；回傳值小於 length 代表壓縮串流已結束或檔案截斷。 */
  fill(target: Uint8Array, length: number, pull: () => Uint8Array | undefined): number {
    let written = 0;
    while (written < length && !this.ended) {
      if (this.phase === PHASE_STORED) {
        if (this.storedRemaining > 0) {
          written += this.copyStored(target, written, length - written, pull);
          if (this.storedRemaining > 0) break;
        }
        this.closeBlock();
        continue;
      }
      if (this.matchRemaining > 0) {
        written += this.copyMatch(target, written, length - written);
        continue;
      }
      if (this.phase === PHASE_HEADER) {
        if (!this.readBlockHeader(pull)) break;
        continue;
      }
      if (this.phase === PHASE_BODY) {
        this.ensureBits(15, pull);
        const symbol = this.decodeTree(this.literalPool);
        if (symbol < 0) failRaster();
        if (symbol < 256) {
          target[written] = symbol;
          written += 1;
          this.pushByte(symbol);
          continue;
        }
        if (symbol === 256) {
          this.closeBlock();
          continue;
        }
        if (symbol > 285) failRaster();
        this.pendingLength = LENGTH_BASE[symbol - 257]!;
        this.extraBits = LENGTH_EXTRA[symbol - 257]!;
        this.extraValue = 0;
        this.extraOffset = 0;
        this.phase = this.extraBits > 0 ? PHASE_LENGTH_EXTRA : PHASE_DISTANCE;
        continue;
      }
      if (this.phase === PHASE_LENGTH_EXTRA) {
        if (!this.readExtraBits(pull)) break;
        this.pendingLength += this.extraValue;
        this.phase = PHASE_DISTANCE;
        continue;
      }
      if (this.phase === PHASE_DISTANCE) {
        if (this.distancePool.empty) failRaster();
        this.ensureBits(15, pull);
        const symbol = this.decodeTree(this.distancePool);
        if (symbol < 0 || symbol >= DISTANCE_SYMBOLS) failRaster();
        this.matchDistance = DISTANCE_BASE[symbol]!;
        this.extraBits = DISTANCE_EXTRA[symbol]!;
        this.extraValue = 0;
        this.extraOffset = 0;
        this.phase = this.extraBits > 0 ? PHASE_DISTANCE_EXTRA : PHASE_COPY;
        continue;
      }
      if (this.phase === PHASE_DISTANCE_EXTRA) {
        if (!this.readExtraBits(pull)) break;
        this.matchDistance += this.extraValue;
        this.phase = PHASE_COPY;
        continue;
      }
      // PHASE_COPY：距離必須落在已輸出範圍內，且不得超過 32 KiB 視窗。
      if (this.matchDistance < 1 || this.matchDistance > HISTORY_MASK + 1 || this.matchDistance > this.totalOutput) {
        failRaster();
      }
      this.matchRemaining = this.pendingLength;
      this.phase = PHASE_BODY;
    }
    return written;
  }

  private closeBlock(): void {
    this.blockOpen = false;
    this.headerStage = 0;
    this.phase = PHASE_HEADER;
    if (this.finalBlock) this.ended = true;
  }

  private readBlockHeader(pull: () => Uint8Array | undefined): boolean {
    if (this.blockOpen) return true;
    if (this.headerStage === 0) {
      if (!this.ensureBits(3, pull)) return false;
      this.finalBlock = (this.bitBuffer & 1) === 1;
      this.dropBits(1);
      this.headerType = this.bitBuffer & 3;
      this.dropBits(2);
      this.headerStage = 1;
      if (this.headerType === 0) {
        // stored block：先補齊到 byte 邊界，再讀 LEN／NLEN。
        const skip = (8 - (this.droppedBits % 8)) % 8;
        if (skip > 0) this.dropBits(skip);
      } else if (this.headerType === 1) {
        this.setFixedTables();
        this.finishHeader(PHASE_BODY);
        return true;
      } else if (this.headerType === 2) {
        this.dynamicStage = DYNAMIC_COUNTS;
        this.dynamicIndex = 0;
        this.codeLengthLengths.fill(0);
        this.literalLengths.fill(0);
        this.distanceLengths.fill(0);
      } else {
        failRaster();
      }
    }
    if (this.headerType === 0) {
      if (this.headerStage === 1) {
        if (!this.ensureBits(16, pull)) return false;
        this.storedLength = this.bitBuffer & 0xffff;
        this.dropBits(16);
        this.headerStage = 2;
      }
      if (!this.ensureBits(16, pull)) return false;
      const complement = this.bitBuffer & 0xffff;
      this.dropBits(16);
      if ((this.storedLength ^ 0xffff) !== complement) failRaster();
      this.storedRemaining = this.storedLength;
      this.finishHeader(PHASE_STORED);
      return true;
    }
    if (!this.readDynamicHeader(pull)) return false;
    this.finishHeader(PHASE_BODY);
    return true;
  }

  private finishHeader(phase: number): void {
    this.blockOpen = true;
    this.headerStage = 0;
    this.phase = phase;
  }

  private readDynamicHeader(pull: () => Uint8Array | undefined): boolean {
    if (this.dynamicStage === DYNAMIC_COUNTS) {
      if (!this.ensureBits(14, pull)) return false;
      this.dynamicLiteralCount = 257 + (this.bitBuffer & 31);
      this.dropBits(5);
      this.dynamicDistanceCount = 1 + (this.bitBuffer & 31);
      this.dropBits(5);
      this.dynamicCodeLengthCount = 4 + (this.bitBuffer & 15);
      this.dropBits(4);
      if (this.dynamicLiteralCount > LENGTH_SYMBOLS) failRaster();
      this.dynamicIndex = 0;
      this.dynamicStage = DYNAMIC_CODE_LENGTHS;
    }
    if (this.dynamicStage === DYNAMIC_CODE_LENGTHS) {
      while (this.dynamicIndex < this.dynamicCodeLengthCount) {
        if (!this.ensureBits(3, pull)) return false;
        this.codeLengthLengths[CODE_LENGTH_ORDER[this.dynamicIndex]!] = this.bitBuffer & 7;
        this.dropBits(3);
        this.dynamicIndex += 1;
      }
      if (!buildHuffman(this.codeLengthPool, this.codeLengthLengths, CODE_LENGTH_SYMBOLS, 7)) failRaster();
      this.dynamicIndex = 0;
      this.dynamicStage = DYNAMIC_LENGTHS;
    }
    const total = this.dynamicLiteralCount + this.dynamicDistanceCount;
    while (this.dynamicIndex < total) {
      if (!this.ensureBits(7, pull)) return false;
      const symbol = this.decodeTree(this.codeLengthPool);
      if (symbol < 0) failRaster();
      if (symbol < 16) {
        this.assignCodeLength(symbol);
        continue;
      }
      let repeat: number;
      let value = 0;
      if (symbol === 16) {
        if (this.dynamicIndex === 0) failRaster();
        if (!this.ensureBits(2, pull)) return false;
        repeat = 3 + (this.bitBuffer & 3);
        this.dropBits(2);
        value = this.assignedCodeLength(this.dynamicIndex - 1);
      } else if (symbol === 17) {
        if (!this.ensureBits(3, pull)) return false;
        repeat = 3 + (this.bitBuffer & 7);
        this.dropBits(3);
      } else {
        if (!this.ensureBits(7, pull)) return false;
        repeat = 11 + (this.bitBuffer & 127);
        this.dropBits(7);
      }
      for (let step = 0; step < repeat; step += 1) this.assignCodeLength(value);
    }
    if (!buildHuffman(this.literalPool, this.literalLengths, this.dynamicLiteralCount, 15)) failRaster();
    if (this.literalPool.empty) failRaster();
    if (!buildHuffman(this.distancePool, this.distanceLengths, this.dynamicDistanceCount, 15)) failRaster();
    this.dynamicStage = 0;
    return true;
  }

  private assignedCodeLength(index: number): number {
    return index < this.dynamicLiteralCount
      ? this.literalLengths[index]!
      : this.distanceLengths[index - this.dynamicLiteralCount]!;
  }

  private assignCodeLength(value: number): void {
    if (this.dynamicIndex < this.dynamicLiteralCount) this.literalLengths[this.dynamicIndex] = value;
    else if (this.dynamicIndex - this.dynamicLiteralCount < this.dynamicDistanceCount) {
      this.distanceLengths[this.dynamicIndex - this.dynamicLiteralCount] = value;
    } else {
      failRaster();
    }
    this.dynamicIndex += 1;
  }

  private setFixedTables(): void {
    for (let symbol = 0; symbol <= 143; symbol += 1) this.literalLengths[symbol] = 8;
    for (let symbol = 144; symbol <= 255; symbol += 1) this.literalLengths[symbol] = 9;
    for (let symbol = 256; symbol <= 279; symbol += 1) this.literalLengths[symbol] = 7;
    for (let symbol = 280; symbol <= 287; symbol += 1) this.literalLengths[symbol] = 8;
    if (!buildHuffman(this.literalPool, this.literalLengths, LENGTH_SYMBOLS, 15)) failRaster();
    for (let symbol = 0; symbol < 32; symbol += 1) this.distanceLengths[symbol] = 5;
    if (!buildHuffman(this.distancePool, this.distanceLengths, 32, 15)) failRaster();
  }

  /** 讀取 extra bits；一次最多 8 bits，可中止後續接（stored block 之外唯一可暫停的讀取）。 */
  private readExtraBits(pull: () => Uint8Array | undefined): boolean {
    while (this.extraBits > 0) {
      const take = Math.min(this.extraBits, 8);
      if (!this.ensureBits(take, pull)) return false;
      this.extraValue |= (this.bitBuffer & lowBitsMask(take)) << this.extraOffset;
      this.dropBits(take);
      this.extraBits -= take;
      this.extraOffset += take;
    }
    return true;
  }

  private ensureBits(count: number, pull: () => Uint8Array | undefined): boolean {
    while (this.bitCount < count && this.bitCount <= 24) {
      if (this.inputPosition >= this.input.length) {
        if (this.inputEnded) break;
        const next = pull();
        if (next === undefined) {
          this.inputEnded = true;
          break;
        }
        this.input = next;
        this.inputPosition = 0;
        if (next.length === 0) continue;
      }
      this.bitBuffer |= this.input[this.inputPosition++]! << this.bitCount;
      this.bitCount += 8;
      this.loadedBits += 8;
    }
    return this.bitCount >= count;
  }

  private dropBits(count: number): void {
    this.bitBuffer >>>= count;
    this.bitCount -= count;
    this.droppedBits += count;
    // 消耗到補零位元即代表真實輸入不足：截斷或串流非法。
    if (this.droppedBits > this.loadedBits) failRaster();
  }

  /** 走 Huffman 樹（LSB-first 位元順序），最多 15 層；空洞代表非法碼。 */
  private decodeTree(pool: HuffmanPool): number {
    const bits = this.bitBuffer & 0x7fff;
    let node = 1;
    for (let depth = 0; depth < 15; depth += 1) {
      const child = (bits >>> depth) & 1 ? pool.right[node]! : pool.left[node]!;
      if (child === 0) return -1;
      const symbol = pool.symbol[child]!;
      if (symbol >= 0) {
        this.dropBits(depth + 1);
        return symbol;
      }
      node = child;
    }
    return -1;
  }

  private pushByte(value: number): void {
    this.history[this.historyPosition] = value;
    this.historyPosition = (this.historyPosition + 1) & HISTORY_MASK;
    this.totalOutput += 1;
  }

  private copyStored(target: Uint8Array, offset: number, limit: number, pull: () => Uint8Array | undefined): number {
    let written = 0;
    while (written < limit && this.storedRemaining > 0) {
      if (this.inputPosition >= this.input.length) {
        const next = this.inputEnded ? undefined : pull();
        if (next === undefined || next.length === 0) failRaster();
        this.input = next;
        this.inputPosition = 0;
        continue;
      }
      const byte = this.input[this.inputPosition++]!;
      target[offset + written] = byte;
      this.pushByte(byte);
      this.storedRemaining -= 1;
      written += 1;
    }
    return written;
  }

  private copyMatch(target: Uint8Array, offset: number, limit: number): number {
    let written = 0;
    while (written < limit && this.matchRemaining > 0) {
      const byte = this.history[(this.historyPosition - this.matchDistance) & HISTORY_MASK]!;
      target[offset + written] = byte;
      written += 1;
      this.pushByte(byte);
      this.matchRemaining -= 1;
    }
    return written;
  }
}

// ---------------------------------------------------------------------------
// 縮圖累加器：area（box）加權縮放，輸出確定且與列抵達順序無關
// ---------------------------------------------------------------------------

/**
 * 只保留「來源單列 + 目標縮圖」記憶體。
 * 每個來源取樣覆蓋 [x, x+1) x [y, y+1)，與目標 cell 的覆蓋面積成正比累加權重；
 * 因為只會縮小（不放大），每個取樣最多落在 2x2 個目標 cell。
 * 累加與列抵達順序無關（Adam7 與 GIF interlace 的列不是依序抵達），最後再除以權重總和。
 */
class ThumbnailAccumulator {
  readonly width: number;
  readonly height: number;
  private readonly channels: 3 | 4;
  private readonly sourceWidth: number;
  private readonly xScale: number;
  private readonly yScale: number;
  private readonly sums: Float64Array;
  private readonly weights: Float64Array;
  private readonly pixels: Uint8Array;

  constructor(sourceWidth: number, sourceHeight: number, channels: 3 | 4, maxEdge: number) {
    this.sourceWidth = sourceWidth;
    this.channels = channels;
    const scale = Math.min(maxEdge / sourceWidth, maxEdge / sourceHeight, 1);
    this.width = Math.max(1, Math.min(sourceWidth, Math.round(sourceWidth * scale)));
    this.height = Math.max(1, Math.min(sourceHeight, Math.round(sourceHeight * scale)));
    this.xScale = this.width / sourceWidth;
    this.yScale = this.height / sourceHeight;
    this.pixels = new Uint8Array(this.width * this.height * channels);
    // 一律走加權累加：即使是 1:1（不縮放）也要和交錯來源共用同一條路徑，
    // 否則交錯來源會有部分列被丟棄、部分列直接寫入，兩者不一致。
    this.sums = new Float64Array(this.width * this.height * channels);
    this.weights = new Float64Array(this.width * this.height);
  }

  /** values 為 interleaved 取樣（channels 個一組），對應 y 列上 x0 + i*step（i < count）。 */
  addRun(y: number, x0: number, step: number, count: number, values: Uint8Array, offset: number): void {
    if (count <= 0) return;
    const startY = y * this.yScale;
    const endY = (y + 1) * this.yScale;
    const row0 = Math.floor(startY);
    if (row0 < 0 || row0 >= this.height) failRaster();
    const weightY0 = Math.min(endY, row0 + 1) - startY;
    const row1 = row0 + 1;
    const weightY1 = row1 < this.height ? endY - row1 : 0;
    for (let index = 0; index < count; index += 1) {
      const x = x0 + index * step;
      if (x < 0 || x >= this.sourceWidth) failRaster();
      const startX = x * this.xScale;
      const endX = (x + 1) * this.xScale;
      const column0 = Math.floor(startX);
      const weightX0 = Math.min(endX, column0 + 1) - startX;
      const column1 = column0 + 1;
      const weightX1 = column1 < this.width ? endX - column1 : 0;
      const source = offset + index * this.channels;
      this.accumulate(row0 * this.width + column0, weightY0 * weightX0, values, source);
      if (weightX1 > 0) this.accumulate(row0 * this.width + column1, weightY0 * weightX1, values, source);
      if (weightY1 > 0) {
        this.accumulate(row1 * this.width + column0, weightY1 * weightX0, values, source);
        if (weightX1 > 0) this.accumulate(row1 * this.width + column1, weightY1 * weightX1, values, source);
      }
    }
  }

  private accumulate(cell: number, weight: number, values: Uint8Array, offset: number): void {
    this.weights[cell] = this.weights[cell]! + weight;
    const base = cell * this.channels;
    for (let channel = 0; channel < this.channels; channel += 1) {
      this.sums[base + channel] = this.sums[base + channel]! + weight * values[offset + channel]!;
    }
  }

  render(): Readonly<{ pixels: Uint8Array; width: number; height: number; channels: 3 | 4 }> {
    const cells = this.width * this.height;
    for (let cell = 0; cell < cells; cell += 1) {
      const weight = this.weights[cell]!;
      const base = cell * this.channels;
      for (let channel = 0; channel < this.channels; channel += 1) {
        const average = weight > 0 ? Math.round(this.sums[base + channel]! / weight) : 0;
        this.pixels[base + channel] = average < 0 ? 0 : average > 255 ? 255 : average;
      }
    }
    return { pixels: this.pixels, width: this.width, height: this.height, channels: this.channels };
  }
}

// ---------------------------------------------------------------------------
// PNG 編碼（非交錯、bit depth 8、RGB／RGBA）
// ---------------------------------------------------------------------------

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type);
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.writeUInt32BE(crc32Of(typeBytes, data), data.length + 8);
  return chunk;
}

/**
 * 輸出 PNG：filter type 一律 0（縮圖不需要 filter，也少一個不確定性來源），
 * zlib 由 node:zlib 產生（同一輸入 → 同一輸出，輸出不含時間戳）。
 */
function encodePng(pixels: Uint8Array, width: number, height: number, channels: 3 | 4): Uint8Array {
  const stride = width * channels;
  const raw = Buffer.allocUnsafe(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const header = Buffer.allocUnsafe(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(PNG_SIGNATURE),
      Buffer.from(pngChunk("IHDR", header)),
      Buffer.from(pngChunk("IDAT", deflateSync(raw, { level: 9 }))),
      Buffer.from(pngChunk("IEND", EMPTY_BYTES)),
    ]),
  );
}

function finishThumbnail(accumulator: ThumbnailAccumulator): RasterThumbnail {
  const raster = accumulator.render();
  return {
    bytes: encodePng(raster.pixels, raster.width, raster.height, raster.channels),
    width: raster.width,
    height: raster.height,
  };
}

// ---------------------------------------------------------------------------
// PNG 解碼
// ---------------------------------------------------------------------------

const ADAM7_PASSES = [
  { x0: 0, y0: 0, dx: 8, dy: 8 },
  { x0: 4, y0: 0, dx: 8, dy: 8 },
  { x0: 0, y0: 4, dx: 4, dy: 8 },
  { x0: 2, y0: 0, dx: 4, dy: 4 },
  { x0: 0, y0: 2, dx: 2, dy: 4 },
  { x0: 1, y0: 0, dx: 2, dy: 2 },
  { x0: 0, y0: 1, dx: 1, dy: 2 },
] as const;

type PngHeader = Readonly<{
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}>;

type PngChunkHeader = Readonly<{ type: string; length: number }>;

function readChunkHeader(cursor: FileCursor): PngChunkHeader | undefined {
  const header = Buffer.allocUnsafe(8);
  if (!cursor.readInto(header, 8)) return undefined;
  const length = header.readUInt32BE(0);
  if (length > 0x7fffffff) failRaster();
  const type = header.toString("latin1", 4, 8);
  if (!/^[A-Za-z]{4}$/.test(type)) failRaster();
  return { type, length };
}

/**
 * PNG IDAT 串接：把連續 IDAT chunk 當成單一 zlib 串流餵給 inflate，
 * 每個 chunk 讀完即刻驗證 CRC；遇到非 IDAT chunk 就代表影像資料結束。
 */
class PngImageData {
  private remaining = 0;
  private crc = CRC32_INITIAL;
  private tracking = false;

  constructor(private readonly cursor: FileCursor) {}

  /** 由外層 chunk 迴圈把已讀到的 IDAT header 交進來；後續的 IDAT chunk 由本物件自行接續。 */
  begin(chunk: PngChunkHeader): void {
    if (chunk.length === 0) return;
    this.remaining = chunk.length;
    this.crc = crc32Update(CRC32_INITIAL, asciiBytes(chunk.type));
    this.tracking = true;
  }

  /** 驗證並跳過 zlib 標頭（CMF/FLG）：CM 必須是 deflate，FDICT 不支援。 */
  readZlibHeader(): void {
    const cmf = this.nextByte();
    const flg = this.nextByte();
    if (cmf < 0 || flg < 0) failRaster();
    if ((cmf & 0x0f) !== 8 || cmf >> 4 > 7) failRaster();
    if (((cmf << 8) | flg) % 31 !== 0) failRaster();
    if ((flg & 0x20) !== 0) failRaster();
  }

  pull(): Uint8Array | undefined {
    if (!this.ensureChunk()) return undefined;
    const view = this.cursor.take(Math.min(this.remaining, READ_CHUNK));
    if (view === undefined || view.length === 0) failRaster();
    this.remaining -= view.length;
    this.crc = crc32Update(this.crc, view);
    if (this.remaining === 0) this.finishChunk();
    return view;
  }

  private nextByte(): number {
    if (!this.ensureChunk()) return -1;
    const view = this.cursor.take(1);
    if (view === undefined || view.length !== 1) failRaster();
    this.remaining -= 1;
    this.crc = crc32Update(this.crc, view);
    if (this.remaining === 0) this.finishChunk();
    return view[0]!;
  }

  private ensureChunk(): boolean {
    while (this.remaining === 0) {
      if (this.tracking) this.finishChunk();
      const header = readChunkHeader(this.cursor);
      if (header === undefined || header.type !== "IDAT") return false;
      if (header.length === 0) continue;
      this.remaining = header.length;
      this.crc = crc32Update(CRC32_INITIAL, asciiBytes(header.type));
      this.tracking = true;
    }
    return true;
  }

  private finishChunk(): void {
    if (!this.tracking) return;
    this.tracking = false;
    const crc = Buffer.allocUnsafe(4);
    if (!this.cursor.readInto(crc, 4)) failRaster();
    if (crc.readUInt32BE(0) !== crc32Finish(this.crc)) failRaster();
  }
}

function pngPassSize(total: number, offset: number, step: number): number {
  if (total <= offset) return 0;
  return Math.ceil((total - offset) / step);
}

/** PNG unfilter：filter type 1-4 依左／上／左上重建，資料就地展開在 row[1..]。 */
function pngUnfilter(row: Uint8Array, length: number, filter: number, previous: Uint8Array, bpp: number): void {
  if (filter === 0) return;
  if (filter === 1) {
    for (let index = bpp; index < length; index += 1) row[1 + index] = (row[1 + index]! + row[1 + index - bpp]!) & 0xff;
    return;
  }
  if (filter === 2) {
    for (let index = 0; index < length; index += 1) row[1 + index] = (row[1 + index]! + previous[index]!) & 0xff;
    return;
  }
  if (filter === 3) {
    for (let index = 0; index < length; index += 1) {
      const left = index >= bpp ? row[1 + index - bpp]! : 0;
      row[1 + index] = (row[1 + index]! + ((left + previous[index]!) >> 1)) & 0xff;
    }
    return;
  }
  if (filter === 4) {
    for (let index = 0; index < length; index += 1) {
      const left = index >= bpp ? row[1 + index - bpp]! : 0;
      const up = previous[index]!;
      const upLeft = index >= bpp ? previous[index - bpp]! : 0;
      const estimate = left + up - upLeft;
      const leftDistance = Math.abs(estimate - left);
      const upDistance = Math.abs(estimate - up);
      const upLeftDistance = Math.abs(estimate - upLeft);
      const predictor =
        leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : upDistance <= upLeftDistance ? up : upLeft;
      row[1 + index] = (row[1 + index]! + predictor) & 0xff;
    }
    return;
  }
  failRaster();
}

/** 依 PNG color type 取出該列的 RGB／RGBA 取樣（palette 先查色表）。 */
function pngEmitRow(
  row: Uint8Array,
  width: number,
  bitDepth: number,
  colorType: number,
  palette: Uint8Array | undefined,
  transparency: Uint8Array | undefined,
  channels: 3 | 4,
  values: Uint8Array,
): void {
  if (colorType === 3) {
    if (palette === undefined) failRaster();
    const mask = lowBitsMask(bitDepth);
    for (let x = 0; x < width; x += 1) {
      const index =
        bitDepth === 8
          ? row[1 + x]!
          : (row[1 + ((x * bitDepth) >> 3)]! >> (8 - bitDepth - ((x * bitDepth) & 7))) & mask;
      const base = index * 3;
      if (base + 2 >= palette.length) failRaster();
      values[x * channels] = palette[base]!;
      values[x * channels + 1] = palette[base + 1]!;
      values[x * channels + 2] = palette[base + 2]!;
      if (channels === 4) {
        values[x * channels + 3] = transparency !== undefined && index < transparency.length ? transparency[index]! : 255;
      }
    }
    return;
  }
  if (colorType === 0) {
    for (let x = 0; x < width; x += 1) {
      const gray = row[1 + x]!;
      values[x * 3] = gray;
      values[x * 3 + 1] = gray;
      values[x * 3 + 2] = gray;
    }
    return;
  }
  if (colorType === 4) {
    for (let x = 0; x < width; x += 1) {
      const source = 1 + x * 2;
      values[x * 4] = row[source]!;
      values[x * 4 + 1] = row[source]!;
      values[x * 4 + 2] = row[source]!;
      values[x * 4 + 3] = row[source + 1]!;
    }
    return;
  }
  const samples = colorType === 2 ? 3 : 4;
  for (let x = 0; x < width; x += 1) {
    const source = 1 + x * samples;
    values[x * channels] = row[source]!;
    values[x * channels + 1] = row[source + 1]!;
    values[x * channels + 2] = row[source + 2]!;
    if (channels === 4) values[x * channels + 3] = row[source + 3]!;
  }
}

function readPngHeader(data: Buffer): PngHeader {
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8]!;
  const colorType = data[9]!;
  const compression = data[10]!;
  const filter = data[11]!;
  const interlace = data[12]!;
  if (width === 0 || height === 0 || width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) failRaster();
  if (compression !== 0 || filter !== 0 || interlace > 1) failRaster();
  if (colorType === 0 || colorType === 2 || colorType === 4 || colorType === 6) {
    // 只支援 bit depth 8；16-bit 與 1／2／4-bit 灰階一律回 undefined（見檔頭說明）。
    if (bitDepth !== 8) failRaster();
  } else if (colorType === 3) {
    if (bitDepth !== 1 && bitDepth !== 2 && bitDepth !== 4 && bitDepth !== 8) failRaster();
  } else {
    failRaster();
  }
  return { width, height, bitDepth, colorType, interlace };
}

function decodePng(cursor: FileCursor, expected: RasterDimensions, maxEdge: number): RasterThumbnail {
  const signature = new Uint8Array(8);
  if (!cursor.readInto(signature, 8)) failRaster();
  for (let index = 0; index < 8; index += 1) if (signature[index] !== PNG_SIGNATURE[index]) failRaster();

  let header: PngHeader | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const imageData = new PngImageData(cursor);

  for (;;) {
    const chunk = readChunkHeader(cursor);
    if (chunk === undefined) failRaster();
    if (chunk.type === "IHDR") {
      if (header !== undefined) failRaster();
      if (chunk.length !== 13) failRaster();
      const data = Buffer.allocUnsafe(13);
      if (!cursor.readInto(data, 13)) failRaster();
      header = readPngHeader(data);
      if (header.width !== expected.width || header.height !== expected.height) failRaster();
      const crc = Buffer.allocUnsafe(4);
      if (!cursor.readInto(crc, 4)) failRaster();
      if (crc.readUInt32BE(0) !== crc32Of(asciiBytes("IHDR"), data)) failRaster();
      continue;
    }
    if (chunk.type === "IDAT") {
      if (header === undefined) failRaster();
      if (header.colorType === 3 && palette === undefined) failRaster();
      const inflate = new Inflate();
      imageData.begin(chunk);
      imageData.readZlibHeader();
      return decodePngRows(inflate, imageData, header, palette, transparency, maxEdge);
    }
    if (chunk.type === "IEND") failRaster();
    if (chunk.type === "PLTE" || chunk.type === "tRNS") {
      if (header === undefined || palette !== undefined && chunk.type === "PLTE") failRaster();
      const limit = chunk.type === "PLTE" ? 768 : 256;
      if (chunk.length === 0 || chunk.length > limit) failRaster();
      const data = Buffer.allocUnsafe(chunk.length);
      if (!cursor.readInto(data, chunk.length)) failRaster();
      const crc = Buffer.allocUnsafe(4);
      if (!cursor.readInto(crc, 4)) failRaster();
      if (crc.readUInt32BE(0) !== crc32Of(asciiBytes(chunk.type), data)) failRaster();
      if (chunk.type === "PLTE") {
        if (header.colorType !== 3 || chunk.length % 3 !== 0) failRaster();
        palette = new Uint8Array(data);
      } else {
        if (header.colorType !== 3) failRaster();
        transparency = new Uint8Array(data);
      }
      continue;
    }
    // 未知的 critical chunk（首字母大寫）必須拒絕；其餘 chunk 驗證 CRC 後跳過。
    if (chunk.type[0] === chunk.type[0]!.toUpperCase()) failRaster();
    // CRC 涵蓋順序是 type 之後才是 data，因此先用 type 起算再串流 skip 資料。
    const running = cursor.skip(chunk.length, crc32Update(CRC32_INITIAL, asciiBytes(chunk.type)));
    if (running === undefined) failRaster();
    const stored = Buffer.allocUnsafe(4);
    if (!cursor.readInto(stored, 4)) failRaster();
    if (stored.readUInt32BE(0) !== crc32Finish(running)) failRaster();
  }
}

function decodePngRows(
  inflate: Inflate,
  imageData: PngImageData,
  header: PngHeader,
  palette: Uint8Array | undefined,
  transparency: Uint8Array | undefined,
  maxEdge: number,
): RasterThumbnail {
  const { width, height, bitDepth, colorType, interlace } = header;
  const channels: 3 | 4 =
    colorType === 3 ? (transparency !== undefined ? 4 : 3) : colorType === 4 || colorType === 6 ? 4 : 3;
  const bitsPerPixel =
    colorType === 0
      ? bitDepth
      : colorType === 2
        ? bitDepth * 3
        : colorType === 3
          ? bitDepth
          : colorType === 4
            ? bitDepth * 2
            : bitDepth * 4;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const accumulator = new ThumbnailAccumulator(width, height, channels, maxEdge);
  const pull = (): Uint8Array | undefined => imageData.pull();
  const passes = interlace === 1 ? ADAM7_PASSES : [{ x0: 0, y0: 0, dx: 1, dy: 1 }];

  for (const pass of passes) {
    const passWidth = pngPassSize(width, pass.x0, pass.dx);
    const passHeight = pngPassSize(height, pass.y0, pass.dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    const row = new Uint8Array(rowBytes + 1);
    const previous = new Uint8Array(rowBytes);
    const values = new Uint8Array(passWidth * channels);
    for (let line = 0; line < passHeight; line += 1) {
      let filled = 0;
      while (filled < row.length) {
        const produced = inflate.fill(row.subarray(filled), row.length - filled, pull);
        if (produced === 0) failRaster();
        filled += produced;
      }
      pngUnfilter(row, rowBytes, row[0]!, previous, bpp);
      pngEmitRow(row, passWidth, bitDepth, colorType, palette, transparency, channels, values);
      accumulator.addRun(pass.y0 + line * pass.dy, pass.x0, pass.dx, passWidth, values, 0);
      previous.set(row.subarray(1, rowBytes + 1));
    }
  }
  return finishThumbnail(accumulator);
}

// ---------------------------------------------------------------------------
// JPEG 解碼（DC-only：每個 8x8 block 的 DC 值 = 該 block 的平均亮度）
// ---------------------------------------------------------------------------

type JpegComponent = {
  readonly id: number;
  readonly hs: number;
  readonly vs: number;
  readonly quantTable: number;
  predictor: number;
  readonly blocksPerLine: number;
  readonly blocksPerColumn: number;
};

type JpegFrame = {
  readonly width: number;
  readonly height: number;
  readonly progressive: boolean;
  readonly components: readonly JpegComponent[];
  readonly componentIndex: ReadonlyMap<number, number>;
  readonly hMax: number;
  readonly vMax: number;
  restartInterval: number;
  readonly quantTables: (number | undefined)[];
  readonly dcTables: (HuffmanPool | undefined)[];
  readonly acTables: (HuffmanPool | undefined)[];
};

class JpegReader {
  private bitBuffer = 0;
  private bitCount = 0;
  private loadedBits = 0;
  private droppedBits = 0;
  pendingMarker = 0;
  private pendingRestart = 0;

  constructor(private readonly cursor: FileCursor) {}

  readByte(): number {
    return this.cursor.readByte();
  }

  readUint16(): number {
    const high = this.readByte();
    const low = this.readByte();
    if (high < 0 || low < 0) failRaster();
    return (high << 8) | low;
  }

  /** 段資料：跳過 length-2 個 byte（length 已含自身的 2 bytes）。 */
  skipSegment(length: number): void {
    if (length < 2) failRaster();
    if (this.cursor.skip(length - 2) === undefined) failRaster();
  }

  skipBytes(count: number): void {
    if (count <= 0) return;
    if (this.cursor.skip(count) === undefined) failRaster();
  }

  private nextEntropyByte(): number {
    // 已停在 marker 上時不得再讀任何 byte：restart()／主迴圈必須先處理掉 marker，
    // 否則會把下一個 interval 或下一段的資料當成 entropy 資料吃掉。
    if (this.pendingMarker !== 0 || this.pendingRestart !== 0) return -1;
    const byte = this.cursor.readByte();
    if (byte < 0) return -1;
    if (byte !== 0xff) return byte;
    let code = this.cursor.readByte();
    if (code < 0) return -1;
    while (code === 0xff) {
      code = this.cursor.readByte();
      if (code < 0) return -1;
    }
    if (code === 0x00) return 0xff;
    if (code >= 0xd0 && code <= 0xd7) this.pendingRestart = code;
    else this.pendingMarker = code;
    return -1;
  }

  private resetBits(): void {
    this.bitBuffer = 0;
    this.bitCount = 0;
    this.loadedBits = 0;
    this.droppedBits = 0;
  }

  private ensureBits(count: number): boolean {
    while (this.bitCount < count && this.bitCount <= 16) {
      const byte = this.nextEntropyByte();
      if (byte < 0) return this.bitCount >= count;
      this.bitBuffer = (this.bitBuffer << 8) | byte;
      this.bitCount += 8;
      this.loadedBits += 8;
    }
    return this.bitCount >= count;
  }

  private peekBits(count: number): number {
    const mask = lowBitsMask(count);
    if (this.bitCount >= count) return (this.bitBuffer >>> (this.bitCount - count)) & mask;
    return (this.bitBuffer << (count - this.bitCount)) & mask;
  }

  private dropBits(count: number): void {
    this.bitCount -= count;
    this.bitBuffer &= lowBitsMask(this.bitCount);
    this.droppedBits += count;
    // JPEG 的 entropy 資料沒有 DEFLATE 的補零語意：消耗到不存在的位元就是截斷。
    if (this.droppedBits > this.loadedBits) failRaster();
  }

  decodeHuffman(table: HuffmanPool, maxBits: number): number {
    this.ensureBits(maxBits);
    const bits = this.peekBits(maxBits);
    let node = 1;
    for (let depth = 0; depth < maxBits; depth += 1) {
      const child = ((bits >>> (maxBits - 1 - depth)) & 1) === 1 ? table.right[node]! : table.left[node]!;
      if (child === 0) return -1;
      const symbol = table.symbol[child]!;
      if (symbol >= 0) {
        this.dropBits(depth + 1);
        return symbol;
      }
      node = child;
    }
    return -1;
  }

  readBits(count: number): number {
    if (count === 0) return 0;
    if (!this.ensureBits(count)) return -1;
    const value = this.peekBits(count);
    this.dropBits(count);
    return value;
  }

  /** restart 邊界：丟掉剩餘位元並吃掉 RST marker（若 reader 已看到則直接消費）。 */
  restart(): boolean {
    this.resetBits();
    if (this.pendingRestart !== 0) {
      this.pendingRestart = 0;
      return true;
    }
    const first = this.cursor.readByte();
    if (first !== 0xff) return false;
    let code = this.cursor.readByte();
    while (code === 0xff) code = this.cursor.readByte();
    if (code < 0) return false;
    return code >= 0xd0 && code <= 0xd7;
  }
}

/** JPEG 的 extend：s 個位元表示 signed magnitude。 */
function extendBits(value: number, bits: number): number {
  return value < 1 << (bits - 1) ? value - (1 << bits) + 1 : value;
}

function decodeJpeg(cursor: FileCursor, expected: RasterDimensions, maxEdge: number): RasterThumbnail {
  const reader = new JpegReader(cursor);
  if (reader.readByte() !== 0xff || reader.readByte() !== 0xd8) failRaster();
  const quantTables: (number | undefined)[] = [];
  const dcTables: (HuffmanPool | undefined)[] = [];
  const acTables: (HuffmanPool | undefined)[] = [];
  let adobeTransform: number | undefined;
  let frame: JpegFrame | undefined;

  for (;;) {
    let marker = reader.pendingMarker;
    if (marker !== 0) reader.pendingMarker = 0;
    else {
      let byte = reader.readByte();
      while (byte >= 0 && byte !== 0xff) byte = reader.readByte();
      if (byte < 0) failRaster();
      let code = reader.readByte();
      while (code === 0xff) code = reader.readByte();
      if (code <= 0 || code === 0xff) failRaster();
      marker = code;
    }
    if (marker === 0xd9) failRaster();
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = reader.readUint16();
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (frame !== undefined) failRaster();
      frame = readJpegFrame(reader, marker, length, expected, quantTables, dcTables, acTables);
      continue;
    }
    if (marker === 0xc4) {
      readJpegHuffmanTables(reader, length, dcTables, acTables);
      continue;
    }
    if (marker === 0xdb) {
      readJpegQuantizationTables(reader, length, quantTables);
      continue;
    }
    if (marker === 0xee) {
      // Adobe APP14：最後一個 byte 是色彩轉換（0 = RGB／CMYK、1 = YCbCr、2 = YCCK）。
      if (length < 3) failRaster();
      reader.skipBytes(length - 3);
      const transform = reader.readByte();
      if (transform < 0) failRaster();
      adobeTransform = transform;
      continue;
    }
    if (marker === 0xdd) {
      // DRI 的 payload 就是 2 bytes 的 restart interval（length 已含長度欄位本身），不可再跳過一次。
      const interval = reader.readUint16();
      if (length > 4) reader.skipBytes(length - 4);
      if (frame !== undefined) frame.restartInterval = interval;
      continue;
    }
    if (marker === 0xda) {
      if (frame === undefined) failRaster();
      const thumbnail = decodeJpegScan(reader, frame, length, maxEdge, adobeTransform);
      if (thumbnail !== undefined) return thumbnail;
      continue;
    }
    reader.skipSegment(length);
  }
}

function readJpegFrame(
  reader: JpegReader,
  marker: number,
  length: number,
  expected: RasterDimensions,
  quantTables: (number | undefined)[],
  dcTables: (HuffmanPool | undefined)[],
  acTables: (HuffmanPool | undefined)[],
): JpegFrame {
  const precision = reader.readByte();
  const height = reader.readUint16();
  const width = reader.readUint16();
  const componentCount = reader.readByte();
  if (precision !== 8) failRaster();
  if (width === 0 || height === 0 || width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) failRaster();
  if (width !== expected.width || height !== expected.height) failRaster();
  if (componentCount !== 1 && componentCount !== 3) failRaster();
  if (length !== 8 + componentCount * 3) failRaster();
  const descriptors: { id: number; hs: number; vs: number; quantTable: number }[] = [];
  let hMax = 1;
  let vMax = 1;
  for (let index = 0; index < componentCount; index += 1) {
    const id = reader.readByte();
    const sampling = reader.readByte();
    const quantTable = reader.readByte();
    const hs = sampling >> 4;
    const vs = sampling & 15;
    if (hs < 1 || hs > 4 || vs < 1 || vs > 4) failRaster();
    if (quantTable > 3) failRaster();
    hMax = Math.max(hMax, hs);
    vMax = Math.max(vMax, vs);
    descriptors.push({ id, hs, vs, quantTable });
  }
  for (const descriptor of descriptors) {
    if (hMax % descriptor.hs !== 0 || vMax % descriptor.vs !== 0) failRaster();
  }
  // 縮圖以第一個分量（luma）的 block 網格為取樣空間，因此它必須是最高取樣因子。
  if (descriptors[0]!.hs !== hMax || descriptors[0]!.vs !== vMax) failRaster();
  const components: JpegComponent[] = [];
  const componentIndex = new Map<number, number>();
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index]!;
    if (componentIndex.has(descriptor.id)) failRaster();
    const samples = Math.ceil((width * descriptor.hs) / hMax);
    const lines = Math.ceil((height * descriptor.vs) / vMax);
    componentIndex.set(descriptor.id, index);
    components.push({
      id: descriptor.id,
      hs: descriptor.hs,
      vs: descriptor.vs,
      quantTable: descriptor.quantTable,
      predictor: 0,
      blocksPerLine: Math.ceil(samples / 8),
      blocksPerColumn: Math.ceil(lines / 8),
    });
  }
  return {
    width,
    height,
    progressive: marker === 0xc2,
    components,
    componentIndex,
    hMax,
    vMax,
    restartInterval: 0,
    quantTables,
    dcTables,
    acTables,
  };
}

function readJpegHuffmanTables(
  reader: JpegReader,
  length: number,
  dcTables: (HuffmanPool | undefined)[],
  acTables: (HuffmanPool | undefined)[],
): void {
  let remaining = length - 2;
  while (remaining > 0) {
    const descriptor = reader.readByte();
    const counts = new Uint8Array(17);
    let total = 0;
    for (let index = 1; index <= 16; index += 1) {
      const count = reader.readByte();
      if (count < 0) failRaster();
      counts[index] = count;
      total += count;
    }
    if (total === 0 || total > 256) failRaster();
    remaining -= 17 + total;
    if (remaining < 0) failRaster();
    // 表項順序＝每個長度的碼數展開後的順序，符號值必須照 DHT 的 byte 清單讀出來。
    const lengths = new Uint8Array(total);
    let position = 0;
    for (let bits = 1; bits <= 16; bits += 1) {
      for (let step = 0; step < counts[bits]!; step += 1) lengths[position++] = bits;
    }
    const values = new Uint8Array(total);
    for (let index = 0; index < total; index += 1) {
      const value = reader.readByte();
      if (value < 0) failRaster();
      values[index] = value;
    }
    const pool = new HuffmanPool(2 * total + 2);
    if (!buildHuffman(pool, lengths, total, 16, values)) failRaster();
    const identifier = descriptor & 15;
    if (identifier > 3) failRaster();
    if (descriptor >> 4 === 0) dcTables[identifier] = pool;
    else if (descriptor >> 4 === 1) acTables[identifier] = pool;
    else failRaster();
  }
  if (remaining !== 0) failRaster();
}

/** DQT：只需要每個 table 的 DC 元素（zigzag 第 0 項），其餘跳過。 */
function readJpegQuantizationTables(reader: JpegReader, length: number, tables: (number | undefined)[]): void {
  let remaining = length - 2;
  while (remaining > 0) {
    const descriptor = reader.readByte();
    const precision = descriptor >> 4;
    const identifier = descriptor & 15;
    if (precision > 1 || identifier > 3) failRaster();
    const size = precision === 0 ? 64 : 128;
    const first = precision === 0 ? reader.readByte() : reader.readUint16();
    if (first < 0) failRaster();
    reader.skipBytes(size - (precision === 0 ? 1 : 2));
    tables[identifier] = first;
    remaining -= size + 1;
  }
  if (remaining !== 0) failRaster();
}

function decodeJpegScan(
  reader: JpegReader,
  frame: JpegFrame,
  length: number,
  maxEdge: number,
  adobeTransform: number | undefined,
): RasterThumbnail | undefined {
  const componentCount = reader.readByte();
  if (componentCount < 1 || componentCount > 4) failRaster();
  const scanComponents: JpegComponent[] = [];
  const selectors: number[] = [];
  for (let index = 0; index < componentCount; index += 1) {
    const id = reader.readByte();
    const selector = reader.readByte();
    const order = frame.componentIndex.get(id);
    if (order === undefined) failRaster();
    scanComponents.push(frame.components[order]!);
    selectors.push(selector);
  }
  const spectralStart = reader.readByte();
  const spectralEnd = reader.readByte();
  const approximation = reader.readByte();
  const successiveHigh = approximation >> 4;
  const successiveLow = approximation & 15;
  if (length !== 6 + componentCount * 2) failRaster();
  if (spectralStart !== 0 || successiveHigh !== 0) {
    // progressive 的 AC scan 與 DC refinement scan 一律整段跳過（見檔頭限制說明）。
    if (!frame.progressive) failRaster();
    reader.pendingMarker = skipEntropyData(reader);
    return undefined;
  }
  // progressive 的 DC scan 必須是 Ss=Se=0；baseline 的單一 scan 則必須覆蓋 Ss=0..Se=63。
  if (frame.progressive) {
    if (spectralEnd !== 0) failRaster();
  } else if (spectralEnd !== 63 || successiveLow !== 0) {
    failRaster();
  }
  if (scanComponents.length !== 1 && scanComponents.length !== frame.components.length) failRaster();
  if (frame.components.length === 3 && scanComponents.length !== 3) failRaster();
  if (frame.components.length === 3) {
    // 3 分量的色彩轉換一律假設 YCbCr（JFIF 慣例）。Adobe transform=0 或 R／G／B 分量 id
    // 代表 RGB-coded JPEG，解出來的顏色會是錯的，因此直接視為不支援。
    const [first, second, third] = frame.components;
    if (adobeTransform === 0 || (first!.id === 0x52 && second!.id === 0x47 && third!.id === 0x42)) failRaster();
  }
  const dcTables: HuffmanPool[] = [];
  const acTables: (HuffmanPool | undefined)[] = [];
  for (let index = 0; index < scanComponents.length; index += 1) {
    const component = scanComponents[index]!;
    const dcTable = frame.dcTables[selectors[index]! >> 4];
    const acTable = frame.acTables[selectors[index]! & 15];
    if (dcTable === undefined) failRaster();
    if (frame.quantTables[component.quantTable] === undefined) failRaster();
    if (!frame.progressive && acTable === undefined) failRaster();
    dcTables.push(dcTable);
    acTables.push(acTable);
    component.predictor = 0;
  }
  const luma = frame.components[0]!;
  const accumulator = new ThumbnailAccumulator(luma.blocksPerLine, luma.blocksPerColumn, 3, maxEdge);
  const scratch: Int32Array[] = frame.components.map((component) => new Int32Array(component.hs * component.vs));
  const values = new Uint8Array(luma.hs * 3);
  const mcusX = Math.ceil(frame.width / (8 * frame.hMax));
  const mcusY = Math.ceil(frame.height / (8 * frame.vMax));
  const baseline = !frame.progressive;
  let mcuIndex = 0;
  for (let mcuY = 0; mcuY < mcusY; mcuY += 1) {
    for (let mcuX = 0; mcuX < mcusX; mcuX += 1) {
      if (frame.restartInterval > 0 && mcuIndex > 0 && mcuIndex % frame.restartInterval === 0) {
        if (!reader.restart()) failRaster();
        for (const component of frame.components) component.predictor = 0;
      }
      const finalMcu = mcuY === mcusY - 1 && mcuX === mcusX - 1;
      for (let order = 0; order < scanComponents.length; order += 1) {
        const component = scanComponents[order]!;
        const target = scratch[frame.componentIndex.get(component.id)!]!;
        const blockCount = component.hs * component.vs;
        for (let block = 0; block < blockCount; block += 1) {
          const category = reader.decodeHuffman(dcTables[order]!, 16);
          if (category < 0 || category > 15) failRaster();
          const bits = reader.readBits(category);
          if (bits < 0) failRaster();
          component.predictor += category === 0 ? 0 : extendBits(bits, category) << successiveLow;
          target[block] = component.predictor;
          const isFinalBlock = finalMcu && order === scanComponents.length - 1 && block === blockCount - 1;
          if (baseline && !isFinalBlock && !skipAcBlock(reader, acTables[order])) failRaster();
        }
      }
      emitJpegBlocks(frame, scratch, accumulator, values, mcuX, mcuY);
      mcuIndex += 1;
    }
  }
  return finishThumbnail(accumulator);
}

/** 跳過一個 block 的 AC 係數：baseline scan 必須消耗掉它們，下一個 block 的 DC 才會對齊。 */
function skipAcBlock(reader: JpegReader, table: HuffmanPool | undefined): boolean {
  if (table === undefined) return false;
  for (let coefficient = 1; coefficient < 64; ) {
    const symbol = reader.decodeHuffman(table, 16);
    if (symbol < 0) return false;
    const run = symbol >> 4;
    const size = symbol & 15;
    if (size === 0) {
      if (run !== 15) return true;
      coefficient += 16;
      continue;
    }
    const position = coefficient + run;
    if (position > 63) return false;
    coefficient = position + 1;
    if (reader.readBits(size) < 0) return false;
  }
  return true;
}

/** 把一個 MCU 的 DC 值轉成 RGB 取樣並餵進縮圖累加器（YCbCr → RGB 用 T.81 的定點係數）。 */
function emitJpegBlocks(
  frame: JpegFrame,
  scratch: Int32Array[],
  accumulator: ThumbnailAccumulator,
  values: Uint8Array,
  mcuX: number,
  mcuY: number,
): void {
  const luma = frame.components[0]!;
  const lumaScale = frame.quantTables[luma.quantTable]!;
  const lumaScratch = scratch[0]!;
  const chromaComponents = frame.components.length === 3 ? [frame.components[1]!, frame.components[2]!] : undefined;
  const blueScratch = chromaComponents === undefined ? undefined : scratch[1]!;
  const redScratch = chromaComponents === undefined ? undefined : scratch[2]!;
  for (let v = 0; v < luma.vs; v += 1) {
    const blockRow = mcuY * luma.vs + v;
    if (blockRow >= luma.blocksPerColumn) continue;
    let emitted = 0;
    for (let h = 0; h < luma.hs; h += 1) {
      const blockColumn = mcuX * luma.hs + h;
      if (blockColumn >= luma.blocksPerLine) break;
      const luminance = Math.round((lumaScratch[v * luma.hs + h]! * lumaScale) / 8) + 128;
      const clamped = luminance < 0 ? 0 : luminance > 255 ? 255 : luminance;
      if (chromaComponents === undefined) {
        values[emitted * 3] = clamped;
        values[emitted * 3 + 1] = clamped;
        values[emitted * 3 + 2] = clamped;
      } else {
        const blue = chromaComponents[0]!;
        const red = chromaComponents[1]!;
        const chromaH = Math.floor((h * blue.hs) / luma.hs);
        const chromaV = Math.floor((v * blue.vs) / luma.vs);
        const blueIndex = chromaV * blue.hs + chromaH;
        const redIndex = Math.floor((v * red.vs) / luma.vs) * red.hs + Math.floor((h * red.hs) / luma.hs);
        const blueDelta = clampChroma(Math.round((blueScratch![blueIndex]! * frame.quantTables[blue.quantTable]!) / 8));
        const redDelta = clampChroma(Math.round((redScratch![redIndex]! * frame.quantTables[red.quantTable]!) / 8));
        const r = clamped + ((91881 * redDelta) >> 16);
        const g = clamped - ((22554 * blueDelta + 46802 * redDelta) >> 16);
        const b = clamped + ((116130 * blueDelta) >> 16);
        values[emitted * 3] = r < 0 ? 0 : r > 255 ? 255 : r;
        values[emitted * 3 + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        values[emitted * 3 + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      emitted += 1;
    }
    if (emitted > 0) accumulator.addRun(blockRow, mcuX * luma.hs, 1, emitted, values, 0);
  }
}

function clampChroma(value: number): number {
  return value < -128 ? -128 : value > 127 ? 127 : value;
}

/** 掃描（跳過）entropy-coded 資料，回傳終止該 scan 的 marker code。 */
function skipEntropyData(reader: JpegReader): number {
  for (;;) {
    let byte = reader.readByte();
    if (byte < 0) failRaster();
    while (byte !== 0xff) {
      byte = reader.readByte();
      if (byte < 0) failRaster();
    }
    let code = reader.readByte();
    while (code === 0xff) code = reader.readByte();
    if (code < 0) failRaster();
    if (code === 0x00) continue;
    if (code >= 0xd0 && code <= 0xd7) continue;
    return code;
  }
}

// ---------------------------------------------------------------------------
// GIF 解碼（第一格）
// ---------------------------------------------------------------------------

/** GIF interlace 的列順序：四個 pass 分別是 8／8／4／2 的間隔。 */
function gifRowOrder(height: number): number[] {
  const rows: number[] = [];
  for (let y = 0; y < height; y += 8) rows.push(y);
  for (let y = 4; y < height; y += 8) rows.push(y);
  for (let y = 2; y < height; y += 4) rows.push(y);
  for (let y = 1; y < height; y += 2) rows.push(y);
  return rows;
}

class GifSubBlocks {
  private remaining = 0;
  private ended = false;

  constructor(private readonly cursor: FileCursor) {}

  nextByte(): number {
    while (this.remaining === 0) {
      if (this.ended) return -1;
      const length = this.cursor.readByte();
      if (length < 0) failRaster();
      if (length === 0) {
        this.ended = true;
        return -1;
      }
      this.remaining = length;
    }
    this.remaining -= 1;
    return this.cursor.readByte();
  }
}

type GifFrameInfo = Readonly<{
  width: number;
  height: number;
  interlaced: boolean;
  minimumCodeSize: number;
  table: Uint8Array;
  transparentIndex: number;
}>;

function decodeGif(cursor: FileCursor, expected: RasterDimensions, maxEdge: number): RasterThumbnail {
  const signature = new Uint8Array(6);
  if (!cursor.readInto(signature, 6)) failRaster();
  const label = Buffer.from(signature).toString("latin1");
  if (label !== "GIF87a" && label !== "GIF89a") failRaster();
  const descriptor = new Uint8Array(7);
  if (!cursor.readInto(descriptor, 7)) failRaster();
  const screenWidth = descriptor[0]! | (descriptor[1]! << 8);
  const screenHeight = descriptor[2]! | (descriptor[3]! << 8);
  if (screenWidth === 0 || screenHeight === 0) failRaster();
  if (screenWidth > MAX_SOURCE_EDGE || screenHeight > MAX_SOURCE_EDGE) failRaster();
  if (screenWidth !== expected.width || screenHeight !== expected.height) failRaster();
  const globalTable = (descriptor[4]! & 0x80) !== 0 ? readGifColorTable(cursor, 2 << (descriptor[4]! & 7)) : undefined;
  let transparentIndex = -1;

  for (;;) {
    const block = cursor.readByte();
    if (block < 0 || block === 0x3b) failRaster();
    if (block === 0x21) {
      const extension = cursor.readByte();
      if (extension < 0) failRaster();
      if (extension === 0xf9) {
        // Graphic Control Extension：4 bytes 的順序是 packed、delay(2 bytes)、透明索引。
        const size = cursor.readByte();
        if (size !== 4) failRaster();
        const packed = cursor.readByte();
        const delayLow = cursor.readByte();
        const delayHigh = cursor.readByte();
        const transparent = cursor.readByte();
        const terminator = cursor.readByte();
        if (packed < 0 || delayLow < 0 || delayHigh < 0 || transparent < 0 || terminator !== 0) failRaster();
        transparentIndex = (packed & 1) !== 0 ? transparent : -1;
        continue;
      }
      skipGifSubBlocks(cursor);
      continue;
    }
    if (block !== 0x2c) failRaster();
    const image = new Uint8Array(9);
    if (!cursor.readInto(image, 9)) failRaster();
    const left = image[0]! | (image[1]! << 8);
    const top = image[2]! | (image[3]! << 8);
    const width = image[4]! | (image[5]! << 8);
    const height = image[6]! | (image[7]! << 8);
    const packed = image[8]!;
    if (width === 0 || height === 0) failRaster();
    if (left + width > screenWidth || top + height > screenHeight) failRaster();
    const localTable = (packed & 0x80) !== 0 ? readGifColorTable(cursor, 2 << (packed & 7)) : undefined;
    const table = localTable ?? globalTable;
    if (table === undefined) failRaster();
    const minimumCodeSize = cursor.readByte();
    if (minimumCodeSize < 2 || minimumCodeSize > 8) failRaster();
    return decodeGifFrame(
      new GifSubBlocks(cursor),
      { width, height, interlaced: (packed & 0x40) !== 0, minimumCodeSize, table, transparentIndex },
      maxEdge,
    );
  }
}

function readGifColorTable(cursor: FileCursor, entries: number): Uint8Array {
  const table = new Uint8Array(entries * 3);
  if (!cursor.readInto(table, table.length)) failRaster();
  return table;
}

function skipGifSubBlocks(cursor: FileCursor): void {
  for (;;) {
    const length = cursor.readByte();
    if (length < 0) failRaster();
    if (length === 0) return;
    if (cursor.skip(length) === undefined) failRaster();
  }
}

/**
 * GIF LZW：code 以 LSB-first 打包。
 * 字典每個 code 增一項，當 nextCode 追上 2^codeSize（且未達 12 bits）就提高 code 長度；
 * 這個成長時機已用 PIL 產生的 GIF 對照驗證過。
 */
function decodeGifFrame(blocks: GifSubBlocks, info: GifFrameInfo, maxEdge: number): RasterThumbnail {
  const channels: 3 | 4 = info.transparentIndex >= 0 ? 4 : 3;
  const accumulator = new ThumbnailAccumulator(info.width, info.height, channels, maxEdge);
  const pixelCount = info.width * info.height;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const chain = new Uint8Array(4096);
  const order = info.interlaced ? gifRowOrder(info.height) : undefined;
  const rowValues = new Uint8Array(info.width * channels);
  const clearCode = 1 << info.minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = info.minimumCodeSize + 1;
  let nextCode = clearCode + 2;
  let previous = -1;
  let bitBuffer = 0;
  let bitCount = 0;
  let produced = 0;
  let rowIndex = 0;
  let column = 0;

  const emit = (value: number): void => {
    if (rowIndex >= info.height) failRaster();
    const base = value * 3;
    if (base + 2 >= info.table.length) failRaster();
    rowValues[column * channels] = info.table[base]!;
    rowValues[column * channels + 1] = info.table[base + 1]!;
    rowValues[column * channels + 2] = info.table[base + 2]!;
    if (channels === 4) rowValues[column * channels + 3] = value === info.transparentIndex ? 0 : 255;
    column += 1;
    if (column === info.width) {
      accumulator.addRun(order === undefined ? rowIndex : order[rowIndex]!, 0, 1, info.width, rowValues, 0);
      column = 0;
      rowIndex += 1;
    }
    produced += 1;
  };
  const emitChain = (length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) emit(chain[index]!);
  };
  /** 把 code 的序列展開到 chain（反向），回傳長度；同時維護 firstByte。 */
  const expand = (code: number): number => {
    let length = 0;
    let walk = code;
    while (walk >= clearCode) {
      if (walk >= nextCode) failRaster();
      chain[length] = suffix[walk]!;
      length += 1;
      if (length >= 4096) failRaster();
      walk = prefix[walk]!;
    }
    chain[length] = walk;
    length += 1;
    return length;
  };

  for (;;) {
    while (bitCount < codeSize) {
      const byte = blocks.nextByte();
      if (byte < 0) {
        if (produced === pixelCount && bitCount === 0) break;
        failRaster();
      }
      bitBuffer |= byte << bitCount;
      bitCount += 8;
    }
    if (bitCount < codeSize) break;
    const code = bitBuffer & lowBitsMask(codeSize);
    bitBuffer >>>= codeSize;
    bitCount -= codeSize;
    if (code === clearCode) {
      codeSize = info.minimumCodeSize + 1;
      nextCode = clearCode + 2;
      previous = -1;
      continue;
    }
    if (code === endCode) break;
    if (code > nextCode) failRaster();
    if (previous === -1) {
      if (code >= clearCode) failRaster();
      emit(code);
      previous = code;
      continue;
    }
    if (code === nextCode) {
      const length = expand(previous);
      const head = chain[length - 1]!;
      emitChain(length);
      emit(head);
      if (nextCode < 4096) {
        prefix[nextCode] = previous;
        suffix[nextCode] = head;
        nextCode += 1;
      }
      previous = code;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
      continue;
    }
    const length = expand(code);
    emitChain(length);
    if (nextCode < 4096) {
      prefix[nextCode] = previous;
      suffix[nextCode] = chain[length - 1]!;
      nextCode += 1;
    }
    previous = code;
    if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
  }
  if (produced !== pixelCount || column !== 0) failRaster();
  return finishThumbnail(accumulator);
}

// ---------------------------------------------------------------------------
// 檔頭尺寸解析
// ---------------------------------------------------------------------------

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function readPngDimensions(head: Uint8Array): RasterDimensions | undefined {
  if (head.length < 33) return undefined;
  for (let index = 0; index < 8; index += 1) if (head[index] !== PNG_SIGNATURE[index]) return undefined;
  if (readUint32(head, 8) !== 13) return undefined;
  if (head[12] !== 0x49 || head[13] !== 0x48 || head[14] !== 0x44 || head[15] !== 0x52) return undefined;
  const width = readUint32(head, 16);
  const height = readUint32(head, 20);
  if (width === 0 || height === 0) return undefined;
  return { width, height };
}

function readJpegDimensions(head: Uint8Array): RasterDimensions | undefined {
  if (head.length < 4) return undefined;
  if (head[0] !== 0xff || head[1] !== 0xd8) return undefined;
  let position = 2;
  while (position + 4 <= head.length) {
    if (head[position] !== 0xff) return undefined;
    const marker = head[position + 1]!;
    if (marker === 0xff) {
      position += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      position += 2;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9) return undefined;
    const length = (head[position + 2]! << 8) | head[position + 3]!;
    if (length < 2) return undefined;
    // 只認 SOF0／SOF1／SOF2；其餘 SOF 變體（12-bit、arithmetic、lossless）不支援。
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (position + 10 > head.length) return undefined;
      const height = (head[position + 5]! << 8) | head[position + 6]!;
      const width = (head[position + 7]! << 8) | head[position + 8]!;
      if (width === 0 || height === 0) return undefined;
      return { width, height };
    }
    position += 2 + length;
  }
  return undefined;
}

function readGifDimensions(head: Uint8Array): RasterDimensions | undefined {
  if (head.length < 10) return undefined;
  const label = String.fromCharCode(head[0]!, head[1]!, head[2]!, head[3]!, head[4]!, head[5]!);
  if (label !== "GIF87a" && label !== "GIF89a") return undefined;
  const width = head[6]! | (head[7]! << 8);
  const height = head[8]! | (head[9]! << 8);
  if (width === 0 || height === 0) return undefined;
  return { width, height };
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/** 從檔頭解析 raster 尺寸（PNG IHDR／JPEG SOFn／GIF LSD）；不足或非該格式回 undefined。 */
export function readRasterDimensions(input: RasterDimensionRequest): RasterDimensions | undefined {
  try {
    const head = input.head;
    if (input.format === "png") return readPngDimensions(head);
    if (input.format === "jpeg") return readJpegDimensions(head);
    if (input.format === "gif") return readGifDimensions(head);
    return undefined;
  } catch {
    return undefined;
  }
}

/** 從已驗證格式的 staged 檔產生內容安全的縮圖 PNG；無法解碼回 undefined，不得丟出例外。 */
export function decodeRasterThumbnail(input: RasterThumbnailRequest): RasterThumbnail | undefined {
  try {
    const maxEdge = input.maxEdge ?? DEFAULT_MAX_EDGE;
    if (!isPositiveInteger(maxEdge)) return undefined;
    if (!isPositiveInteger(input.width) || !isPositiveInteger(input.height)) return undefined;
    if (input.width > MAX_SOURCE_EDGE || input.height > MAX_SOURCE_EDGE) return undefined;
    const cursor = FileCursor.open(input.path);
    try {
      const expected: RasterDimensions = { width: input.width, height: input.height };
      if (input.format === "png") return decodePng(cursor, expected, maxEdge);
      if (input.format === "jpeg") return decodeJpeg(cursor, expected, maxEdge);
      if (input.format === "gif") return decodeGif(cursor, expected, maxEdge);
      return undefined;
    } finally {
      cursor.close();
    }
  } catch {
    return undefined;
  }
}
