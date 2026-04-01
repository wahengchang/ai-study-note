---
title: tmux 快速入門：搭配 OpenClaw 的 Prefix、Pane、Window、Session
aliases:
tags:
---

## 目標

- 提供一份精簡的 tmux 參考，方便日常操作 OpenClaw。
- 涵蓋最基本的指令集：分割 Pane、切換 Window、Detach / Reattach Session。

## 前提 / 驗證狀態

- 本筆記根據常見 tmux 預設值整理。
- 指令並未在本筆記中實際執行。
- 請在你的環境中驗證：

```bash
tmux -V
tmux list-keys | head
```

## 核心規則：Prefix Key

- tmux 的指令都要透過 **Prefix** 鍵序列觸發。
- 預設 Prefix：`Ctrl+b`。

### 操作模式

1. 按下 `Ctrl+b`。
2. 放開按鍵。
3. 再按指令鍵。

## 安裝與啟動

```bash
brew install tmux
tmux
```

- `brew install tmux`：在 macOS 上用 Homebrew 安裝。
- `tmux`：啟動新的 tmux Session。

## Pane 管理（分割畫面）

| 動作 | 按鍵 |
| --- | --- |
| 左右分割（垂直切割） | `Prefix` 然後 `%` |
| 上下分割（水平切割） | `Prefix` 然後 `"` |
| 在 Pane 之間移動 | `Prefix` 然後方向鍵 |
| 關閉目前 Pane（需確認） | `Prefix` 然後 `x` |
| 放大 / 還原目前 Pane | `Prefix` 然後 `z` |

## Window 管理（分頁）

| 動作 | 按鍵 |
| --- | --- |
| 新增 Window | `Prefix` 然後 `c` |
| 下一個 Window | `Prefix` 然後 `n` |
| 上一個 Window | `Prefix` 然後 `p` |
| 跳到第 `0-9` 個 Window | `Prefix` 然後 `0..9` |
| 關閉目前 Window | `Prefix` 然後 `&` |

## Session 管理（讓工作持續執行）

| 動作 | 按鍵 / 指令 |
| --- | --- |
| 從目前 Session 脫離 | `Prefix` 然後 `d` |
| 重新接上最後的 Session | `tmux attach` |
| 列出所有 Session | `tmux ls` |

- Detach 之後程式會繼續在背景執行。
- Reattach 會完整恢復你離開時的 Pane / Window 狀態。

## 建議的 OpenClaw 配置

### 雙 Pane 工作流

| Pane | 用途 |
| --- | --- |
| 左邊 Pane | 執行 Gateway（`openclaw gateway --port 18789`） |
| 右邊 Pane | 跑 CLI 檢查 / 瀏覽器指令 / 看 Log |

### 範例 Session

```bash
tmux
# Split into left/right panes: Prefix, %

# Left pane
openclaw gateway --port 18789

# Right pane
openclaw --help
```

## 疑難排解

| 問題 | 可能原因 | 檢查方式 |
| --- | --- | --- |
| 快捷鍵沒反應 | 不在 tmux Session 中 | 確認 Prompt / 狀態列；執行 `echo $TMUX` |
| Prefix 無法使用 | 自訂 tmux 設定改了 Prefix | 檢查 `~/.tmux.conf` |
| `tmux attach` 失敗 | 沒有執行中的 Session | 執行 `tmux ls`，再用 `tmux` 啟動新的 |

## 極簡速查表

| 動作 | 快捷鍵 |
| --- | --- |
| Prefix | `Ctrl+b` |
| 左右分割 | `Prefix`, `%` |
| 上下分割 | `Prefix`, `"` |
| 移動 Pane | `Prefix`, 方向鍵 |
| 新增 Window | `Prefix`, `c` |
| 下一個 Window | `Prefix`, `n` |
| Detach | `Prefix`, `d` |
| Reattach | `tmux attach` |
