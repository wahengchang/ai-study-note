---
title: awesome-nanobanana-pro 資源筆記
tags:
  - research
  - prompt-engineering
  - gemini
description: "Curated prompt patterns from ZeroLu/awesome-nanobanana-pro for Gemini Nano Banana Pro image generation"
---

# awesome-nanobanana-pro 資源筆記

> 來源：[ZeroLu/awesome-nanobanana-pro](https://github.com/ZeroLu/awesome-nanobanana-pro)（9.6k+ stars，CC BY 4.0）

## 這個 repo 是什麼

社群精選的 **Nano Banana Pro（Gemini 2 圖像模型，又稱 Nano Banana 2）** prompt 合集。作者從 X（Twitter）、微信、Replicate、prompt engineer 圈整理出約 **60+ 組高保真 prompt**，涵蓋從寫實人像到 3D 場景、產品攝影、UI mockup、室內設計等使用場景。

- **檔案結構**：單一 `README.md`（約 1,700 行），無程式碼，每組 prompt 含：情境描述、範例圖、完整 prompt 文字、原始出處連結。
- **語系**：prompt 本身以英文為主，少量中文出處。
- **授權**：CC BY 4.0，可改寫與再散佈（需署名）。

## 12 個主題分類一覽

| # | 主題 | 可複用方向 |
|---|------|-----------|
| 1 | Photorealism & Aesthetics | 人像、年代感風格（2000s/1990s/Y2K）、雜誌封面、商業頭像 |
| 2 | Creative Experiments | 3D isometric、微縮場景、liquid pour、cinematic keyframe |
| 3 | Education & Knowledge | 概念視覺化、infographic、兒童插畫遊記、Sankey 財務圖 |
| 4 | E-commerce & Virtual Studio | 虛擬試穿、商品白底攝影、3D 品牌概念店 |
| 5 | Workplace & Productivity | 手繪白板 → McKinsey 風格圖、UI wireframe → 高保真 mockup、雜誌版型 |
| 6 | Photo Editing & Restoration | Smart outpainting（擴圖）、人群移除、CCTV 模擬 |
| 7 | Interior Design | 平面圖 → 多視角 3D 呈現板 |
| 8 | Social Media & Marketing | YouTube/TikTok 封面、促銷海報 |
| 9 | Daily Life & Translation | 招牌即時翻譯、漫畫/迷因本地化 |
| 10 | Social Networking & Avatars | 3D 盲盒頭像、寵物迷因、Y2K 剪貼簿 |
| 11 | Resources | 相關工具與站點連結 |
| 12 | Contributing | 社群貢獻指南 |

## 值得借鑑的 prompt 結構範式

從這份 repo 可萃取出 **4 種可直接套用到其他圖像模型（Gemini、GPT-4o image、Flux）** 的寫法：

### 1. 段落式 + 具名子欄位（最常見）

以 `KEY :` 冒號分段，大寫欄位名當錨點。適合需要同時控制 **風格、環境、光線、鏡頭、主體** 的複合場景。

```text
GENERAL STYLE & MOOD: Photorealistic, 8k, shallow DOF, soft natural fill light + golden rim light.
THE ENVIRONMENT: Rooftop terrace at sunset, polished marble, warm golden light.
SUBJECT: ...
CAMERA: 35mm lens, center-weighted, slightly wide-angle.
```

**為什麼有效**：把多個維度顯式命名後，模型較少漏掉約束條件；也便於使用者替換單一欄位重用模板。

### 2. 結構化 JSON prompt

適合年代感人像、角色一致性、多屬性 subject。範例（2000s Mirror Selfie）：

```json
{
  "subject": {
    "description": "...",
    "hair": {"color": "dark", "style": "voluminous waves"},
    "clothing": {"top": {"type": "cropped t-shirt", "details": "anime cat graphic"}},
    "face": {"preserve_original": true, "makeup": "natural glam, glossy red lips"}
  }
}
```

**為什麼有效**：`preserve_original: true` 之類的布林旗標對 Nano Banana Pro 這類多模態模型有效，可鎖住臉部/姿態來源；巢狀結構比自然語言更不容易被模型自由發揮。

### 3. 雙圖輸入 + 明確角色分配

電商試穿、產品合成必備句式：

```text
Using Image 1 (the garment) and Image 2 (the model), create ...
Crucial Fit Details: ...
High-Fidelity Preservation: ...
Seamless Integration: match ambient lighting, color temperature, shadow direction.
```

**重點**：明確標註「哪張圖提供什麼資訊」＋ 三段式約束（外觀一致、保真度、融合方式），比模糊說「合成這兩張」可靠得多。

### 4. 轉換型 prompt（sketch → polished）

只要一句「將 X 轉為 Y」+ 具名風格系統即可：

```text
Convert this hand-drawn whiteboard sketch into a professional corporate flowchart.
Style Guide: McKinsey-style, blue-and-gray palette, ample whitespace.
Structure: align to grid, orthogonal arrows only (90°).
Text: transcribe handwritten labels to bold sans-serif.
```

適用場景：whiteboard → McKinsey chart、wireframe → iOS 18 mockup、2D 平面圖 → 3D 室內呈現板。

## 可複用的技巧清單

- **相機/鏡頭語言**：`shot on Canon EOS R5`、`50mm f/1.8`、`35mm`、`shallow DOF`、`fisheye` — 用實體器材名取代抽象形容詞
- **光線描述**：`golden rim light`、`soft natural fill light`、`calibrated color grading`
- **背景約束**：`pure white studio background (RGB 255, 255, 255)`、`subtle contact shadow` — 電商/產品必備
- **風格錨點**：`Cinema 4D render`、`blind-box toy aesthetic`、`iOS 18 / Material Design 3`、`McKinsey-style`
- **保真度關鍵詞**：`preserve original fabric texture`、`High-Fidelity Preservation`、`preserve_original: true`
- **負面限制**：`no text, no timestamps, no overlays`、`no curvy lines, 90-degree angles only`

## 建議納入 ai-study-note 的方式

- **本篇（這份筆記）**：作為索引與結構分析，讀者想找實際 prompt 時點連結到原 repo 即可，不搬運全部 60+ 組 prompt。
- **若未來要 fork 特定模板**：建議挑 3–5 組通用性高的（如「產品白底攝影」、「wireframe → mockup」、「雙圖合成」）改寫為 zh-tw 可填空模板，放到 `content/prompt-notes/gemini-prompts/` 底下新增 `image-generation.md`。
- **不建議**：整份翻譯搬運。原 repo 更新頻繁（每日 20k 訪問），本地 fork 會立即過期；保持連結 + 結構筆記是較低維護成本的做法。

## Key Takeaways

- 九千多星不是因為 prompt 特別精妙，而是因為 **「主題分類 + 實拍對照 + 來源引用」的編排方式**，讓 prompt 可以被快速檢索與驗證
- 最值得抄的不是個別 prompt，而是 **4 種結構範式**（段落具名、JSON、雙圖角色分配、轉換型）與 **相機/光線/負面限制的固定詞彙庫**
- JSON prompt 在多模態圖像模型上確實有效，特別是保留臉部/姿態的旗標式欄位
- 對 ai-study-note 而言，這個資源的最佳用法是 **索引 + 模式萃取**，而非內容搬運

## Next Actions

- [x] 建立本索引筆記
- [ ] （選配）從 repo 挑選 3–5 組通用模板，寫成 zh-tw 填空版放入 `gemini-prompts/image-generation.md`
- [ ] （選配）在 `prompt-notes/index.md` 加入本筆記的連結
