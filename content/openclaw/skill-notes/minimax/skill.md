---
title: "MiniMax TTS Skill"
tags:
  - openclaw
  - skill-definition
  - tts
description: "Text-to-speech skill optimized for Cantonese — MiniMax API integration with configurable voice and speed"
---

# MiniMax TTS Skill
文字轉語音技能，支援多種語言與模型，特別針對廣東話生成做了優化。

## 設定
在技能目錄下的 `.env` 檔案中設定：
`MINIMAX_API_KEY=你的API金鑰`

## 呼叫方式
`scripts/tts.sh --text "文字內容" --output "路徑.mp3" [其他參數]`

## 參數說明
- `--text`: 必填，合成文字（建議包含標點符號以優化停頓）。
- `--output`: 必填，輸出 MP3 檔案路徑。
- `--model`: 預設 `speech-2.6-turbo`。
- `--voice`: 預設 `Chinese (Mandarin)_HK_Flight_Attendant`。
- `--boost`: 預設 `Chinese,Yue`。
- `--speed`: 語速，預設 `1.0`。
- `--vol`: 音量，預設 `1.0`。
- `--pitch`: 音調，預設 `0`。
