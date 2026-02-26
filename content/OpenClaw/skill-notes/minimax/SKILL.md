# MiniMax TTS Skill
文字轉語音技能，支持多種語言與模型，特別優化了廣東話生成。

## 配置
在技能目錄下的 `.env` 文件中配置：
`MINIMAX_API_KEY=你的API密鑰`

## 調用方式
`scripts/tts.sh --text "文字內容" --output "路徑.mp3" [其他參數]`

## 參數說明
- `--text`: 必填，合成文字（建議包含標點符號以優化停頓）。
- `--output`: 必填，輸出 MP3 文件路徑。
- `--model`: 默認 `speech-2.6-turbo`。
- `--voice`: 默認 `Chinese (Mandarin)_HK_Flight_Attendant`。
- `--boost`: 默認 `Chinese,Yue`。
- `--speed`: 語速，默認 `1.0`。
- `--vol`: 音量，默認 `1.0`。
- `--pitch`: 音調，默認 `0`。
