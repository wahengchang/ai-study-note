---
title: "完整移除 Telegram Plugin 指南"
description: "Complete removal of Telegram Plugin from Claude Code — config cleanup, pairing disconnect, and cache purge"
tags:
  - guide
  - claude-code
  - telegram
---

# 完整移除 Telegram Plugin 指南

> 停用 Telegram Plugin 不等於移除。本文教你如何徹底清除 Plugin、斷開配對、防止自動重建。

---

## 為什麼「停用」不夠？

很多人在 Claude Code 裡執行 `/plugin disable telegram@claude-plugins-official` 後，發現 Telegram Bot 還是能回應訊息。原因是：

```
Plugin 停用只影響這些：
├── settings.json → enabledPlugins: false    ✓ 已停用
│
但這些東西完全不受影響：
├── channels/telegram/access.json            ✗ 配對還在
├── channels/telegram/.env                   ✗ Bot Token 還在
├── plugins/cache/.../telegram/              ✗ Plugin 程式碼還在
└── plugins/data/telegram-inline             ✗ 執行資料還在
```

**停用 ≠ 斷開配對。** Plugin 的程式碼和配對資料是獨立儲存的。

---

## 完整移除步驟

### 第一步：關閉 Claude Code

**這一步最重要。** 如果 Claude Code 還在執行，它會自動重建被刪除的檔案。

- 如果用桌面版 Claude：完全關閉應用程式
- 如果用終端機：確認所有 Claude 程序都已結束

```bash
# 終止所有 Claude 相關程序
pkill -f "claude"

# 確認全部結束
ps aux | grep claude | grep -v grep
```

> 如果看到 `ShipIt` 程序，不用擔心——那只是自動更新程式，與 Bot 無關。

---

### 第二步：刪除三個目錄

```bash
# 1. 刪除 Plugin 程式碼 cache
rm -rf ~/.claude/plugins/cache/claude-plugins-official/telegram/

# 2. 刪除 Channel 配對資料（Bot Token + 使用者綁定）
rm -rf ~/.claude/channels/telegram/

# 3. 刪除 Plugin 執行資料
rm -rf ~/.claude/plugins/data/telegram-inline
```

對應關係：

```
刪除的目錄                          效果
─────────────────────────────────────────────────
plugins/cache/.../telegram/     → Plugin 程式碼消失
channels/telegram/              → 配對斷開、Bot Token 清除
plugins/data/telegram-inline    → 歷史資料清除
```

---

### 第三步：驗證清除完成

```bash
# 確認 telegram cache 已不存在
ls ~/.claude/plugins/cache/claude-plugins-official/
# 預期輸出：只剩 fakechat、superpowers 等其他 plugin

# 確認 channel 已清除
ls ~/.claude/channels/
# 預期輸出：不應該有 telegram 目錄

# 確認 settings.json 裡的設定
grep telegram ~/.claude/settings.json
# 預期輸出：空的，或顯示 "telegram": false
```

---

### 第四步：測試

1. 重新開啟 Claude Code
2. 在 Telegram 對 Bot 傳送 `/status`
3. Bot 應該**完全不回應**（因為沒有程序在監聽了）

如果 Bot 回覆「Not paired」而非完全無回應，代表 Plugin 程式碼已清除，但 Bot Token 可能還被其他 session 使用。再次執行第一步和第二步即可。

---

## 常見問題排查

### 刪了又自動重建？

**原因：** Claude Code 還在背景執行，啟動時會重新載入 Plugin。

**解法：** 一定要先 `pkill -f "claude"` 把所有程序殺掉，再刪除檔案。

---

### `/plugin uninstall` 指令無效？

**原因：** Telegram Plugin 不是透過 npm 安裝的，而是由 Claude Code App 透過 `--plugin-dir` 參數載入的。所以 uninstall 指令找不到它。

**解法：** 直接刪除 cache 目錄，這是唯一有效的方式。

---

### Bot 還在回應「要配對請 DM」？

**原因：** Bot Token 仍然有效，Telegram 那邊的 Bot 本身還存在。你刪除的是本機的監聽程式，不是 Telegram 上的 Bot。

**解法：** 如果想讓 Bot 完全消失，到 Telegram 找 @BotFather，執行 `/deletebot` 刪除 Bot 本身。

---

### 有多個 Claude Code Session 同時監聽？

**症狀：** 出現兩組不同的配對碼。

**原因：** 你開了多個 Claude Code 視窗或 Session，每個都啟動了自己的 Telegram Plugin。

**解法：**
```bash
# 列出所有 Claude 程序，確認 --plugin-dir 裡有沒有 telegram
ps aux | grep claude | grep telegram

# 全部殺掉
pkill -f "claude"
```

---

## 如果以後想重新安裝

```
# 在 Claude Code 裡執行
/plugin install telegram@claude-plugins-official
/reload-plugins
```

Plugin 會自動重新下載到 cache，並建立新的配對流程。之前的配對資料不會恢復——需要重新配對。

## Related

- [[telegram-bridge-guide|Telegram Bot 橋接運作原理]]
- [[claude-folder-anatomy-guide|.claude/ 資料夾完全解析]]
