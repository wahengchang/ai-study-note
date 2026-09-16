import { randomUUID } from "node:crypto";

import { canonicalJsonBytes, isDigest, sha256Digest, type CoreFailure, type Digest } from "../foundation/index.js";
import { MAX_RASTER_PIXELS, decodeRasterThumbnail, mediaFailureMessages, sniffMediaType } from "../media/index.js";
import type { CurrentMediaObjectStore, DataMediaFailure, DataMediaFailureCode, DataMediaResult, MediaByteEvidence, SniffedMedia } from "../media/index.js";
import { globalSlug, suggestGlobalSlug } from "../persistence/index.js";
import type { CurrentMediaAssetRecord, CurrentMediaEntryStatus, PersistenceFailure, PersistenceStore } from "../persistence/index.js";

export type MediaImageV2 = Readonly<{ width: number; height: number }>;
export type MediaThumbnailV2 = Readonly<{ digest: Digest; byteLength: number; width: number; height: number }>;
export type MediaAssetV2 = Readonly<{
  contract: "media-asset/v2";
  assetId: string;
  slug: string;
  title: string;
  altText: string | null;
  caption: string;
  description: string;
  originalFilename: string;
  mimeType: string;
  byteLength: number;
  checksum: Digest;
  uploadedAt: string;
  image: MediaImageV2 | null;
  thumbnail: MediaThumbnailV2 | null;
  stateDigest: Digest;
}>;
export type MediaUsageV2 = Readonly<{ entryId: string; status: CurrentMediaEntryStatus }>;
export type MediaCatalogV2 = Readonly<{ contract: "media-catalog/v2"; items: readonly MediaAssetV2[]; stateDigest: Digest }>;
export type MediaAssetDetailV2 = Readonly<{ contract: "media-asset-detail/v2"; asset: MediaAssetV2; usage: readonly MediaUsageV2[] }>;
export type MediaImportMetadataV2 = Readonly<{ contract: "media-import-metadata/v2"; title: string; slug?: string | undefined; altText?: string | null | undefined; caption?: string | undefined; description?: string | undefined }>;
export type MediaMetadataSaveRequestV2 = Readonly<{ contract: "media-metadata-save-request/v2"; assetId: string; expectedStateDigest: string; title: string; slug: string; altText: string | null; caption: string; description: string }>;
export type MediaReplaceRequestV2 = Readonly<{ contract: "media-replace-request/v2"; assetId: string; expectedStateDigest: string; metadata: MediaImportMetadataV2 }>;
export type MediaDeleteRequestV2 = Readonly<{ contract: "media-delete-request/v2"; assetId: string; expectedStateDigest: string }>;
export type MediaDeleteReceiptV2 = Readonly<{ contract: "media-delete-receipt/v2"; assetId: string; releasedSlug: string }>;
/** 傳輸層把單一 file part 的 bytes 灌進 sink；sink 是唯一不經 JSON 的通道。 */
export type MediaUploadSink = Readonly<{ write(chunk: Uint8Array): DataMediaResult<void> }>;
export type MediaUploadSource = (sink: MediaUploadSink) => Promise<void>;
export type CurrentMediaLibraryResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DataMediaFailure }>;
export interface CurrentMediaLibrary {
  list(): Promise<CurrentMediaLibraryResult<MediaCatalogV2>>;
  get(assetId: string): Promise<CurrentMediaLibraryResult<MediaAssetDetailV2>>;
  importAsset(input: Readonly<{ filename: string; metadata: MediaImportMetadataV2; source: MediaUploadSource }>): Promise<CurrentMediaLibraryResult<MediaAssetV2>>;
  replaceAsset(input: Readonly<{ filename: string; metadata: MediaImportMetadataV2; request: MediaReplaceRequestV2; source: MediaUploadSource }>): Promise<CurrentMediaLibraryResult<MediaAssetV2>>;
  saveMetadata(request: MediaMetadataSaveRequestV2): Promise<CurrentMediaLibraryResult<MediaAssetV2>>;
  deleteAsset(request: MediaDeleteRequestV2): Promise<CurrentMediaLibraryResult<MediaDeleteReceiptV2>>;
  readThumbnail(assetId: string): Promise<CurrentMediaLibraryResult<Readonly<{ bytes: Uint8Array; digest: Digest }>>>;
}

/** raw file 上限由 Application 執行；metadata envelope 上限屬於 multipart framing，由 transport 執行。 */
export const MEDIA_FILE_CEILING = 400 * 1024 * 1024;
export const MEDIA_THUMBNAIL_MAX_EDGE = 320;

const headLimit = 1024 * 1024;
const titleMaxScalars = 300;
const captionMaxScalars = 1_000;
const descriptionMaxScalars = 5_000;
const filenameMaxScalars = 255;

export type CurrentMediaLibraryDependencies = Readonly<{
  persistence: PersistenceStore;
  objectStore: CurrentMediaObjectStore;
  newStableId?: () => string;
  now?: () => Date;
  /** 測試可注入以模擬解碼 fault；production 一律使用 in-repo raster pipeline。 */
  decodeThumbnail?: typeof decodeRasterThumbnail;
}>;

function libraryFailureError(code: DataMediaFailureCode, subjectIds: readonly string[] = [], extra: Readonly<{ usage?: readonly MediaUsageV2[] }> = {}): DataMediaFailure {
  return { code, owner: "DataMedia", subjectIds: [...subjectIds], remediation: { kind: "message", message: mediaFailureMessages[code] }, ...extra };
}
function libraryFailure<T>(code: DataMediaFailureCode, subjectIds: readonly string[] = [], extra: Readonly<{ usage?: readonly MediaUsageV2[] }> = {}): CurrentMediaLibraryResult<T> {
  return { ok: false, error: libraryFailureError(code, subjectIds, extra) };
}
/** transaction decision 的 failure 可能是 Application 的 DataMedia failure 或 Persistence failure；後者收斂為 library failure。 */
function decisionFailure(error: DataMediaFailure | PersistenceFailure): DataMediaFailure {
  return error.owner === "DataMedia" ? error : libraryFailureError("MEDIA_LIBRARY_FAILURE");
}

/** 物件儲存層的 failure 一律是 DataMedia；理論上可能出現的 CoreFailure 收斂為 library failure。 */
function asMediaFailure(error: CoreFailure | DataMediaFailure): DataMediaFailure {
  return error.owner === "DataMedia" ? error : libraryFailureError("MEDIA_LIBRARY_FAILURE");
}

/**
 * Transport 會在任何 response 上以 `asn_(v1|bt_v1)_…` canary 遮蔽 credential 形狀的字串
 * （見 `apps/authoring-api/origin.ts` 的 REDACTION_PATTERN）。若允許這種 metadata 落地，
 * wire 上的 asset 就會與其 `stateDigest` 的 JCS 輸入不一致，CMS 一旦原樣 Save 還會用有效的
 * CAS 把 durable 原文覆寫成 placeholder。因此這種輸入一律 fail closed。
 */
const redactedShapePattern = /asn_(?:v1|bt_v1)_[A-Za-z0-9_-]+/u;

function normalizedText(value: unknown, maxScalars: number, allowEmpty: boolean): string | undefined {
  if (typeof value !== "string" || !value.isWellFormed() || redactedShapePattern.test(value)) return undefined;
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if ((!allowEmpty && length === 0) || length > maxScalars) return undefined;
  return normalized;
}

function normalizedFilename(value: unknown): string | undefined {
  const name = normalizedText(value, filenameMaxScalars, false);
  if (name === undefined || name.includes("/") || name.includes("\\") || name.includes("\u0000")) return undefined;
  return name;
}

type NormalizedMetadata = Readonly<{ title: string; requestedSlug?: string; altText: string | null; caption: string; description: string }>;

function normalizedImportMetadata(input: MediaImportMetadataV2): NormalizedMetadata | undefined {
  if (input === null || typeof input !== "object" || input.contract !== "media-import-metadata/v2") return undefined;
  const title = normalizedText(input.title, titleMaxScalars, false);
  const caption = normalizedText(input.caption ?? "", captionMaxScalars, true);
  const description = normalizedText(input.description ?? "", descriptionMaxScalars, true);
  if (title === undefined || caption === undefined || description === undefined) return undefined;
  // 空字串代表未設定 alt：可空是契約，不是錯誤。
  const altText = input.altText === undefined || input.altText === null || input.altText === "" ? null : normalizedText(input.altText, captionMaxScalars, true);
  if (altText === undefined) return undefined;
  const normalizedSlug = input.slug === undefined || input.slug === "" ? undefined : globalSlug(input.slug)?.slug;
  if (input.slug !== undefined && input.slug !== "" && normalizedSlug === undefined) return undefined;
  return { title, ...(normalizedSlug === undefined ? {} : { requestedSlug: normalizedSlug }), altText, caption, description };
}

function requestedSlugOf(metadata: NormalizedMetadata, filename: string): string | undefined {
  if (metadata.requestedSlug !== undefined) return metadata.requestedSlug;
  const fromTitle = suggestGlobalSlug(metadata.title);
  if (fromTitle !== undefined) return fromTitle.slug;
  const base = filename.slice(0, filename.lastIndexOf(".") === -1 ? filename.length : filename.lastIndexOf("."));
  return suggestGlobalSlug(base)?.slug;
}

function assetDigest(asset: Omit<MediaAssetV2, "stateDigest">): Digest {
  const bytes = canonicalJsonBytes({
    contract: asset.contract,
    assetId: asset.assetId,
    slug: asset.slug,
    title: asset.title,
    altText: asset.altText,
    caption: asset.caption,
    description: asset.description,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    checksum: asset.checksum,
    uploadedAt: asset.uploadedAt,
    image: asset.image === null ? null : { width: asset.image.width, height: asset.image.height },
    thumbnail: asset.thumbnail === null ? null : { digest: asset.thumbnail.digest, byteLength: asset.thumbnail.byteLength, width: asset.thumbnail.width, height: asset.thumbnail.height },
  });
  if (!bytes.ok) throw new Error("media-asset-digest-failed");
  return sha256Digest(bytes.value);
}

function publicAsset(record: CurrentMediaAssetRecord): MediaAssetV2 {
  const base: Omit<MediaAssetV2, "stateDigest"> = {
    contract: "media-asset/v2",
    assetId: record.assetId,
    slug: record.slug,
    title: record.title,
    altText: record.altText,
    caption: record.caption,
    description: record.description,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    checksum: record.checksum,
    uploadedAt: record.uploadedAt,
    image: record.image === undefined ? null : { width: record.image.width, height: record.image.height },
    thumbnail: record.thumbnail === undefined ? null : { digest: record.thumbnail.digest, byteLength: record.thumbnail.byteLength, width: record.thumbnail.width, height: record.thumbnail.height },
  };
  return { ...base, stateDigest: assetDigest(base) };
}

function persistenceRecord(asset: Omit<MediaAssetV2, "stateDigest">): CurrentMediaAssetRecord {
  return {
    assetId: asset.assetId,
    slug: asset.slug,
    title: asset.title,
    altText: asset.altText,
    caption: asset.caption,
    description: asset.description,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    checksum: asset.checksum,
    uploadedAt: asset.uploadedAt,
    ...(asset.image === null ? {} : { image: { width: asset.image.width, height: asset.image.height } }),
    ...(asset.thumbnail === null ? {} : { thumbnail: { digest: asset.thumbnail.digest, byteLength: asset.thumbnail.byteLength, width: asset.thumbnail.width, height: asset.thumbnail.height } }),
  };
}

function utcMoment(now: Date): string { return `${now.toISOString().slice(0, 19)}.${String(now.getUTCMilliseconds()).padStart(3, "0")}Z`; }

export function createCurrentMediaLibrary(input: CurrentMediaLibraryDependencies): CurrentMediaLibraryResult<CurrentMediaLibrary> {
  const { persistence, objectStore } = input;
  // 啟動收斂必須 fail closed：staging 殘留或無法讀取 record 都代表儲存狀態不可信。
  const swept = objectStore.sweepStages();
  if (!swept.ok) return { ok: false, error: asMediaFailure(swept.error) };
  const known = persistence.listCurrentMediaAssets();
  if (!known.ok) return libraryFailure("MEDIA_LIBRARY_FAILURE");
  const pruned = objectStore.sweepObjects(known.value.flatMap((record) => [record.checksum, ...(record.thumbnail === undefined ? [] : [record.thumbnail.digest])]));
  if (!pruned.ok) return { ok: false, error: asMediaFailure(pruned.error) };
  const allocateId = input.newStableId ?? randomUUID;
  const now = input.now ?? (() => new Date());
  const decodeThumbnail = input.decodeThumbnail ?? decodeRasterThumbnail;

  const catalog = (): CurrentMediaLibraryResult<MediaCatalogV2> => {
    const records = persistence.listCurrentMediaAssets();
    if (!records.ok) return libraryFailure("MEDIA_LIBRARY_FAILURE");
    const items = records.value.map(publicAsset);
    const bytes = canonicalJsonBytes({ contract: "media-catalog/v2", items });
    return bytes.ok ? { ok: true, value: { contract: "media-catalog/v2", items, stateDigest: sha256Digest(bytes.value) } } : libraryFailure("MEDIA_LIBRARY_FAILURE");
  };

  const usageOf = (assetId: string): CurrentMediaLibraryResult<readonly MediaUsageV2[]> => {
    const references = persistence.listCurrentMediaReferences(assetId);
    return references.ok ? { ok: true, value: references.value.map((reference) => ({ entryId: reference.entryId, status: reference.status })) } : libraryFailure("MEDIA_LIBRARY_FAILURE", [assetId]);
  };

  /** 只有明確的 not found 才是 404；儲存故障或損壞 row 必須是可分辨的 library failure。 */
  const currentAssetFailure = (code: string, assetId: string): DataMediaFailure =>
    libraryFailureError(code === "CURRENT_MEDIA_ASSET_NOT_FOUND" ? "MEDIA_ASSET_NOT_FOUND" : "MEDIA_LIBRARY_FAILURE", [assetId]);

  const load = (assetId: string): CurrentMediaLibraryResult<MediaAssetV2> => {
    if (typeof assetId !== "string" || assetId.length === 0) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    const record = persistence.getCurrentMediaAsset(assetId);
    if (!record.ok) return { ok: false, error: currentAssetFailure(record.error.code, assetId) };
    return { ok: true, value: publicAsset(record.value) };
  };

  type StagedUpload = Readonly<{ stageId: string; evidence: MediaByteEvidence; head: Uint8Array }>;
  const stageUpload = async (source: MediaUploadSource): Promise<CurrentMediaLibraryResult<StagedUpload>> => {
    if (typeof source !== "function") return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    const stageId = allocateId();
    const opened = objectStore.openStage({ stageId, ceiling: MEDIA_FILE_CEILING });
    if (!opened.ok) return { ok: false, error: asMediaFailure(opened.error) };
    const parts: Uint8Array[] = [];
    let headLength = 0;
    let writeFailure: DataMediaFailure | undefined;
    const sink: MediaUploadSink = { write(chunk) {
      if (headLength < headLimit) { const slice = chunk.subarray(0, headLimit - headLength); parts.push(slice.slice()); headLength += slice.byteLength; }
      const written = opened.value.write(chunk);
      // 容量或儲存故障的原始 code 優先於呼叫端看到的泛用 staging failure。
      if (!written.ok) writeFailure ??= asMediaFailure(written.error);
      return written;
    } };
    try {
      await source(sink);
    } catch {
      // client abort、framing 錯誤或 transport fault：staging 一律清除，不得留下半成品。
      opened.value.abandon();
      return { ok: false, error: writeFailure ?? asMediaFailure(libraryFailureError("MEDIA_STAGING_FAILURE")) };
    }
    if (writeFailure !== undefined) { opened.value.abandon(); return { ok: false, error: writeFailure }; }
    const finished = opened.value.finish();
    if (!finished.ok) return { ok: false, error: asMediaFailure(finished.error) };
    const head = new Uint8Array(headLength);
    let offset = 0;
    for (const part of parts) { head.set(part, offset); offset += part.byteLength; }
    return { ok: true, value: { stageId, evidence: finished.value, head } };
  };

  type ThumbnailBytes = Readonly<{ stageId: string; evidence: MediaByteEvidence; width: number; height: number }>;
  const stageThumbnail = (bytes: Uint8Array, width: number, height: number): CurrentMediaLibraryResult<ThumbnailBytes> => {
    const stageId = allocateId();
    const opened = objectStore.openStage({ stageId, ceiling: bytes.byteLength });
    if (!opened.ok) return { ok: false, error: asMediaFailure(opened.error) };
    const written = opened.value.write(bytes);
    if (!written.ok) { opened.value.abandon(); return { ok: false, error: asMediaFailure(written.error) }; }
    const finished = opened.value.finish();
    if (!finished.ok) return { ok: false, error: asMediaFailure(finished.error) };
    return { ok: true, value: { stageId, evidence: finished.value, width, height } };
  };

  type Ingested = Readonly<{ evidence: MediaByteEvidence; sniffed: SniffedMedia; thumbnail: ThumbnailBytes | undefined }>;
  const ingest = (filename: string, upload: StagedUpload): CurrentMediaLibraryResult<Ingested> => {
    const sniffed = sniffMediaType({ head: upload.head, filename });
    if (!sniffed.ok) { objectStore.removeStage(upload.stageId); return { ok: false, error: asMediaFailure(sniffed.error) }; }
    const raster = sniffed.value.raster;
    if (raster === undefined) return { ok: true, value: { evidence: upload.evidence, sniffed: sniffed.value, thumbnail: undefined } };
    if (raster.width * raster.height > MAX_RASTER_PIXELS) { objectStore.removeStage(upload.stageId); return libraryFailure("MEDIA_THUMBNAIL_FAILURE", [filename]); }
    const path = objectStore.stageFilePath(upload.stageId);
    const decoded = path === undefined ? undefined : decodeThumbnail({ path, format: raster.format, width: raster.width, height: raster.height, maxEdge: MEDIA_THUMBNAIL_MAX_EDGE });
    if (decoded === undefined) { objectStore.removeStage(upload.stageId); return libraryFailure("MEDIA_THUMBNAIL_FAILURE", [filename]); }
    const staged = stageThumbnail(decoded.bytes, decoded.width, decoded.height);
    if (!staged.ok) { objectStore.removeStage(upload.stageId); return { ok: false, error: asMediaFailure(staged.error) }; }
    return { ok: true, value: { evidence: upload.evidence, sniffed: sniffed.value, thumbnail: staged.value } };
  };

  /**
   * promote 之後必須在同一次請求內釋放 stage：release 失敗代表 bytes 仍以 `.partial` 存在，
   * 因此 operation 必須失敗且不得 commit record（殘留由啟動 sweep 收斂）。
   */
  const promoteUpload = (upload: StagedUpload, ingested: Ingested): CurrentMediaLibraryResult<void> => {
    const promoted = objectStore.promote({ stageId: upload.stageId, evidence: ingested.evidence });
    if (!promoted.ok) { objectStore.removeStage(upload.stageId); return { ok: false, error: asMediaFailure(promoted.error) }; }
    const released = objectStore.releaseStage({ stageId: upload.stageId, evidence: ingested.evidence });
    if (!released.ok) return { ok: false, error: asMediaFailure(released.error) };
    const thumbnail = ingested.thumbnail;
    if (thumbnail === undefined) return { ok: true, value: undefined };
    const promotedThumbnail = objectStore.promote({ stageId: thumbnail.stageId, evidence: thumbnail.evidence });
    if (!promotedThumbnail.ok) { objectStore.removeStage(thumbnail.stageId); return { ok: false, error: asMediaFailure(promotedThumbnail.error) }; }
    const releasedThumbnail = objectStore.releaseStage({ stageId: thumbnail.stageId, evidence: thumbnail.evidence });
    return releasedThumbnail.ok ? { ok: true, value: undefined } : { ok: false, error: asMediaFailure(releasedThumbnail.error) };
  };

  const releaseStages = (upload: StagedUpload, ingested: Ingested): void => {
    objectStore.removeStage(upload.stageId);
    if (ingested.thumbnail !== undefined) objectStore.removeStage(ingested.thumbnail.stageId);
  };

  const buildAsset = (input_: Readonly<{ assetId: string; slug: string; metadata: NormalizedMetadata; filename: string; evidence: MediaByteEvidence; sniffed: SniffedMedia; thumbnail: ThumbnailBytes | undefined }>): MediaAssetV2 => {
    const base: Omit<MediaAssetV2, "stateDigest"> = {
      contract: "media-asset/v2",
      assetId: input_.assetId,
      slug: input_.slug,
      title: input_.metadata.title,
      altText: input_.metadata.altText,
      caption: input_.metadata.caption,
      description: input_.metadata.description,
      originalFilename: input_.filename,
      mimeType: input_.sniffed.mimeType,
      byteLength: input_.evidence.byteLength,
      checksum: input_.evidence.checksum,
      uploadedAt: utcMoment(now()),
      image: input_.sniffed.raster === undefined ? null : { width: input_.sniffed.raster.width, height: input_.sniffed.raster.height },
      thumbnail: input_.thumbnail === undefined ? null : { digest: input_.thumbnail.evidence.checksum, byteLength: input_.thumbnail.evidence.byteLength, width: input_.thumbnail.width, height: input_.thumbnail.height },
    };
    return { ...base, stateDigest: assetDigest(base) };
  };

  /**
   * 單一 transaction 內完成 CAS／usage 再驗、slug 配置與 record 寫入；Replace 的 CAS 與 usage
   * 必須在此重驗，避免 staging 與 promote 之間的時序讓過期請求覆蓋較新的 state。
   */
  const commit = (asset: MediaAssetV2, expected: Readonly<{ stateDigest: string }> | undefined): CurrentMediaLibraryResult<MediaAssetV2> => {
    const decision = persistence.runTransaction<MediaAssetV2, DataMediaFailure>((transaction) => {
      if (expected !== undefined) {
        const current = transaction.getCurrentMediaAsset(asset.assetId);
        if (!current.ok) return { ok: false, error: currentAssetFailure(current.error.code, asset.assetId) };
        if (publicAsset(current.value).stateDigest !== expected.stateDigest) return { ok: false, error: libraryFailureError("MEDIA_ASSET_STATE_CONFLICT", [asset.assetId]) };
        const references = transaction.listCurrentMediaReferences(asset.assetId);
        if (!references.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [asset.assetId]) };
        if (references.value.length > 0) return { ok: false, error: libraryFailureError("MEDIA_ASSET_REFERENCED", [asset.assetId], { usage: references.value.map((reference) => ({ entryId: reference.entryId, status: reference.status })) }) };
      }
      const claim = transaction.allocateGlobalSlug({ requestedSlug: asset.slug, entityKind: "media", entityId: asset.assetId });
      if (!claim.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [asset.assetId]) };
      const record = persistenceRecord({ ...asset, slug: claim.value.slug });
      const written = expected === undefined ? transaction.createCurrentMediaAsset(record) : transaction.replaceCurrentMediaAsset(record);
      if (!written.ok) return { ok: false, error: libraryFailureError(written.error.code === "CURRENT_MEDIA_ASSET_NOT_FOUND" ? "MEDIA_ASSET_NOT_FOUND" : "MEDIA_LIBRARY_FAILURE", [asset.assetId]) };
      return { ok: true, value: publicAsset(written.value) };
    });
    if (decision.ok) return decision;
    return { ok: false, error: decisionFailure(decision.error) };
  };

  const importOrReplace = async (mode: "import" | "replace", request: Readonly<{ filename: string; metadata: MediaImportMetadataV2; assetId?: string; expectedStateDigest?: string; source: MediaUploadSource }>): Promise<CurrentMediaLibraryResult<MediaAssetV2>> => {
    const metadata = normalizedImportMetadata(request.metadata);
    const filename = normalizedFilename(request.filename);
    if (metadata === undefined || filename === undefined) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    // 格式錯誤的 CAS digest 是 malformed command，不得與真正的 stale state 混為同一個 409。
    if (mode === "replace" && (typeof request.expectedStateDigest !== "string" || !isDigest(request.expectedStateDigest))) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    const requestedSlug = requestedSlugOf(metadata, filename);
    if (requestedSlug === undefined) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    let assetId: string;
    if (mode === "import") assetId = allocateId();
    else {
      assetId = request.assetId ?? "";
      const current = load(assetId);
      if (!current.ok) return current;
      // CAS 必須在任何 bytes 落地前先比較一次；transaction 內會再比一次作為唯一權威。
      if (current.value.stateDigest !== request.expectedStateDigest) return libraryFailure("MEDIA_ASSET_STATE_CONFLICT", [assetId]);
      const usage = usageOf(assetId);
      if (!usage.ok) return usage;
      if (usage.value.length > 0) return libraryFailure("MEDIA_ASSET_REFERENCED", [assetId], { usage: usage.value });
    }
    const staged = await stageUpload(request.source);
    if (!staged.ok) return staged;
    const ingested = ingest(filename, staged.value);
    if (!ingested.ok) return ingested;
    // 上傳可能持續數分鐘，因此在 promote 前先以 read snapshot 再驗一次 CAS／usage，讓「已被更新或
    // 已被引用」的請求不會把 bytes 落地；權威判定仍在 record transaction 內。
    if (mode === "replace") {
      const preflight = load(assetId);
      if (!preflight.ok) { releaseStages(staged.value, ingested.value); return preflight; }
      if (preflight.value.stateDigest !== request.expectedStateDigest) { releaseStages(staged.value, ingested.value); return libraryFailure("MEDIA_ASSET_STATE_CONFLICT", [assetId]); }
      const liveUsage = usageOf(assetId);
      if (!liveUsage.ok) { releaseStages(staged.value, ingested.value); return liveUsage; }
      if (liveUsage.value.length > 0) { releaseStages(staged.value, ingested.value); return libraryFailure("MEDIA_ASSET_REFERENCED", [assetId], { usage: liveUsage.value }); }
    }
    const promoted = promoteUpload(staged.value, ingested.value);
    if (!promoted.ok) { releaseStages(staged.value, ingested.value); return promoted; }
    const asset = buildAsset({ assetId, slug: requestedSlug, metadata, filename, evidence: ingested.value.evidence, sniffed: ingested.value.sniffed, thumbnail: ingested.value.thumbnail });
    // promote 後才在同一個 transaction 內重驗 CAS／usage。失敗時 stage 立即清除；已 promote 但無 record
    // 指向的 object 是 immutable 的 content-addressed bytes，會由下一次啟動的 sweepObjects 收斂，
    // 不在請求路徑上刪除（併發匯入相同 bytes 時刪除會讓另一個 record 指向不存在的 object）。
    const committed = commit(asset, mode === "import" ? undefined : { stateDigest: request.expectedStateDigest ?? "" });
    if (!committed.ok) releaseStages(staged.value, ingested.value);
    return committed;
  };

  const saveMetadata = (request: MediaMetadataSaveRequestV2): CurrentMediaLibraryResult<MediaAssetV2> => {
    if (request === null || typeof request !== "object" || request.contract !== "media-metadata-save-request/v2" || typeof request.assetId !== "string") return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
    const title = normalizedText(request.title, titleMaxScalars, false);
    const caption = normalizedText(request.caption, captionMaxScalars, true);
    const description = normalizedText(request.description, descriptionMaxScalars, true);
    const altText = request.altText === null || request.altText === "" ? null : normalizedText(request.altText, captionMaxScalars, true);
    const requestedSlug = typeof request.slug === "string" ? globalSlug(request.slug)?.slug : undefined;
    if (title === undefined || caption === undefined || description === undefined || altText === undefined || requestedSlug === undefined || !isDigest(request.expectedStateDigest)) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT", [request.assetId]);
    const decision = persistence.runTransaction<MediaAssetV2, DataMediaFailure>((transaction) => {
      const record = transaction.getCurrentMediaAsset(request.assetId);
      if (!record.ok) return { ok: false, error: currentAssetFailure(record.error.code, request.assetId) };
      if (publicAsset(record.value).stateDigest !== request.expectedStateDigest) return { ok: false, error: libraryFailureError("MEDIA_ASSET_STATE_CONFLICT", [request.assetId]) };
      const claim = transaction.allocateGlobalSlug({ requestedSlug, entityKind: "media", entityId: request.assetId });
      if (!claim.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [request.assetId]) };
      const written = transaction.replaceCurrentMediaAsset({ ...record.value, slug: claim.value.slug, title, altText, caption, description });
      return written.ok ? { ok: true, value: publicAsset(written.value) } : { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [request.assetId]) };
    });
    if (decision.ok) return decision;
    return { ok: false, error: decisionFailure(decision.error) };
  };

  return { ok: true, value: {
    async list() { return catalog(); },
    async get(assetId) {
      const asset = load(assetId);
      if (!asset.ok) return asset;
      const usage = usageOf(assetId);
      return usage.ok ? { ok: true, value: { contract: "media-asset-detail/v2", asset: asset.value, usage: usage.value } } : usage;
    },
    async importAsset(request) { return importOrReplace("import", request); },
    async replaceAsset(request) { return importOrReplace("replace", { filename: request.filename, metadata: request.metadata, assetId: request.request.assetId, expectedStateDigest: request.request.expectedStateDigest, source: request.source }); },
    async saveMetadata(request) { return saveMetadata(request); },
    async deleteAsset(request) {
      if (request === null || typeof request !== "object" || request.contract !== "media-delete-request/v2" || typeof request.assetId !== "string" || !isDigest(request.expectedStateDigest)) return libraryFailure("INVALID_MEDIA_LIBRARY_INPUT");
      const decision = persistence.runTransaction<MediaDeleteReceiptV2, DataMediaFailure>((transaction) => {
        const record = transaction.getCurrentMediaAsset(request.assetId);
        if (!record.ok) return { ok: false, error: currentAssetFailure(record.error.code, request.assetId) };
        if (publicAsset(record.value).stateDigest !== request.expectedStateDigest) return { ok: false, error: libraryFailureError("MEDIA_ASSET_STATE_CONFLICT", [request.assetId]) };
        const references = transaction.listCurrentMediaReferences(request.assetId);
        if (!references.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [request.assetId]) };
        if (references.value.length > 0) return { ok: false, error: libraryFailureError("MEDIA_ASSET_REFERENCED", [request.assetId], { usage: references.value.map((reference) => ({ entryId: reference.entryId, status: reference.status })) }) };
        const releasedSlug = record.value.slug;
        const deleted = transaction.deleteCurrentMediaAsset(request.assetId);
        if (!deleted.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [request.assetId]) };
        // slug 在 real Delete 的同一個 transaction 內釋放，之後可被任何 entity 重用。
        const released = transaction.releaseGlobalSlug({ entityKind: "media", entityId: request.assetId });
        if (!released.ok) return { ok: false, error: libraryFailureError("MEDIA_LIBRARY_FAILURE", [request.assetId]) };
        return { ok: true, value: { contract: "media-delete-receipt/v2", assetId: request.assetId, releasedSlug } };
      });
      if (decision.ok) return decision;
      return { ok: false, error: decisionFailure(decision.error) };
    },
    async readThumbnail(assetId) {
      const asset = load(assetId);
      if (!asset.ok) return asset;
      const thumbnail = asset.value.thumbnail;
      if (thumbnail === null) return libraryFailure("MEDIA_ASSET_NOT_FOUND", [assetId]);
      const bytes = objectStore.read({ checksum: thumbnail.digest, byteLength: thumbnail.byteLength });
      return bytes.ok ? { ok: true, value: { bytes: bytes.value, digest: thumbnail.digest } } : libraryFailure("MEDIA_THUMBNAIL_FAILURE", [assetId]);
    },
  } };
}
