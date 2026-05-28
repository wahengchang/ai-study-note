---
title: "Git worktree 起步四場景：平行跑多個 Claude Code session 的工作法"
description: "平行開多個 Claude Code session 變難管？git worktree 是答案。前三天只用四個場景，git worktree list 當安全網。"
pubDate: 2026-05-28
category: setup-env
tags:
  - guide
  - devops
  - claude-code
---

開到第三個 Claude Code session 的時候，我才發現問題不是 token、不是模型——是 git。三個 session 同時在一個 repo 裡改檔案，互相覆蓋、互相 commit，整條歷史亂掉。`git worktree` 才是讓平行 session 真正能跑的那塊基礎建設。

這篇是我自己整理的工作筆記，目的是寫完丟著、下次撞到 worktree 操作能直接抄。**核心主張：前三天只需要四個場景，剩下的撞到再回來查。**

## 起步四場景速查表

把這張表存起來就好。能解決 90% 的日常操作：

```
情境                          指令
─────────────────────────────────────────────────────────
場景 1  開一條新 worktree     git worktree add ../X -b branch-name
場景 2  看現有 worktree       git worktree list
場景 3  日常 commit + push    git add . && git commit -m "..."
                              git push -u origin branch-name
        開 PR                 gh pr create --fill --base main
場景 4  收工 / 清理           git worktree remove ../X
                              git branch -d branch-name
```

進階場景（撞到再學）：

```
拉主分支最新進度              git fetch origin && git rebase origin/main
rebase 衝突 → 繼續            git add <file> && git rebase --continue
rebase 想放棄                 git rebase --abort
強推已 rebase 的分支          git push --force-with-lease
強制清掉有未 commit 的 wt     git worktree remove ../X --force
從另一條 wt 撿 commit         git cherry-pick <hash>
```

## worktree 的心智模型

一個 worktree = 磁碟上的一個獨立資料夾 + 一條獨立分支 + 一條獨立的 Claude Code session。你的 `~/projects/owlchi-frontend/` 跟 `~/projects/owlchi-site-system/` 是兩個真正的工作區，互不污染。

這跟 `git checkout` 切分支不一樣——`checkout` 是「在同一個資料夾裡換成另一條分支」，所有 session 看到的檔案會一起變。worktree 是「再開一個資料夾、放另一條分支的快照」，每個 session 看到自己的世界。

對平行 Claude session 來說這是關鍵：兩個 session 同時在不同 worktree 改檔案，**對 git 而言是兩個獨立的工作區，不會打架**。

## 為什麼起步四場景就夠

我一開始想把 10 個場景一次背完，結果第二天就忘一半。後來發現：場景 1（開）、場景 2（看）、場景 3（commit + push + PR）、場景 4（清），這四個就佔了 90% 的時間。

其他的（rebase、cherry-pick、強推）是「撞到衝突」的情境，**等真的撞到再查比較有效**——因為那時你有具體錯誤訊息，知道在解什麼問題。

我自己的踩雷紀錄：第一週我太想學「對的做法」，跑去研究 `git rebase --interactive` 跟 `--force-with-lease` 的差異，花了一個下午看完還是不太懂。後來我把這些先丟掉，只用場景 1-4 撐了一週，撐得很順。**真正撞到 rebase 衝突是第十天的事，那時看場景 5 五分鐘就學會了**，因為我手上正有個衝突可以對照。

## 場景 3 是核心循環

四個場景裡，場景 3（commit + push + 開 PR）是你會做最多次的事。完整流程：

```bash
cd ~/projects/owlchi-frontend

git status                    # 衛生習慣：commit 前先看一眼
git diff

git add .
git commit -m "feat(public): implement post page layout"

git push -u origin frontend-work    # 首次 push 要 -u 設 upstream
# 之後只要 git push

gh pr create --fill --base main     # --fill 用最近 commit 訊息自動填
```

開完 PR，CI 會自動跑、preview URL 會貼回 PR 留言、merge 之後 production deploy 自動觸發。**重點是「做完一段就推一次、開一個 PR」，不要累積一週才推**——累積越多，rebase 衝突越痛。

## git worktree list 是你的安全網

第二個要記的概念：**`git worktree list` 永遠不會壞事**。

```bash
git worktree list
```

```
/Users/you/projects/owlchi-site-system       abc1234 [main]
/Users/you/projects/owlchi-frontend          def5678 [frontend-work]
```

每行是「路徑 + commit + 分支」。什麼時候跑這個？

- 早上開工，提醒自己昨天開了哪些線
- 切 terminal 切到頭暈，不確定自己在哪
- 準備清理之前，看哪些可以收掉

任何時候覺得「我搞混了」，先跑 `git worktree list` 再說。它純讀取、不改任何東西、不會破壞工作區。配合 `pwd` 跟 `git branch --show-current`，三個指令就能把自己定位回來。

## 哪裡會出問題

worktree 不解決一切——**共用檔案還是會撞**。

`lib/db/schema.ts`、`wrangler.jsonc`、`package.json` 這些檔案如果兩條 worktree 同時改，merge 回 main 時 100% 會 conflict。預防法：開工前約定「前端線只動 UI、後端線只動 schema」，真的需要跨越界線就停下來協調。**規則勝過事後解 conflict。**

另一個雷：`git worktree remove` 不能省略。直接 `rm -rf ../owlchi-frontend` 看起來是清掉了，但 git 內部還記得這個 worktree 存在，下次 `worktree list` 會出現殭屍記錄。乖乖用 `git worktree remove ../X`。

## 今天可以做的事

1. 開一條新的 worktree 給下一個小功能：`git worktree add ../<project>-feature -b feature-branch-name`
2. `cd` 進去，啟動一條新的 Claude Code session
3. 做完一段就跑場景 3（commit + push + `gh pr create --fill --base main`）
4. 不確定自己在哪？`git worktree list`

撞到 rebase、cherry-pick、強推再回來查上面的進階表。起步四場景先撐一週。

---

下一步閱讀建議：如果你在用 `gh` CLI 開 PR，搭配 GitHub Actions 自動跑 preview deploy 會把這個循環收得更緊——做完一段、推、自動部署、看畫面、merge，整套不到五分鐘。
