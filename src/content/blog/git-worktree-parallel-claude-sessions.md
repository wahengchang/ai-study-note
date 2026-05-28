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

下面所有指令我用 `myapp` 當作專案名、`myapp-frontend`、`myapp-api` 當作 worktree 資料夾名稱——換成你自己的就好。

## 起步四場景

### 場景 1：開一條新 worktree

從現有 repo 裡，分出一個新的工作資料夾 + 新分支：

```bash
git worktree add ../myapp-frontend -b frontend-work
```

意思是：在 `../myapp-frontend/` 建立一個新資料夾，裡面是 `frontend-work` 這條新分支的工作區。`-b` 是「同時建立分支」。

### 場景 2：看現有的 worktree 有哪些

```bash
git worktree list
```

輸出長這樣：

```
/Users/you/projects/myapp            abc1234 [main]
/Users/you/projects/myapp-frontend   def5678 [frontend-work]
```

每行是「路徑 + commit + 分支」。

### 場景 3：日常 commit、push、開 PR

這是核心循環，做最多次的事：

```bash
cd ~/projects/myapp-frontend

git status                    # 衛生習慣：commit 前先看一眼
git diff

git add .
git commit -m "feat(public): implement post page layout"

git push -u origin frontend-work    # 首次 push 要 -u 設 upstream
# 之後只要 git push

gh pr create --fill --base main     # --fill 用最近 commit 訊息自動填
```

開完 PR，CI 會自動跑、preview URL 會貼回 PR 留言、merge 之後 production deploy 自動觸發。**重點是「做完一段就推一次、開一個 PR」，不要累積一週才推**——累積越多，rebase 衝突越痛。

### 場景 4：收工、清理

做完合併之後，清掉這條 worktree：

```bash
git worktree remove ../myapp-frontend
git branch -d frontend-work
```

第一行清掉資料夾跟 git 內部紀錄，第二行刪掉本地分支。**不要直接 `rm -rf`**——下面〈哪裡會出問題〉會講為什麼。

## 進階場景（撞到再學）

下面這幾個不是天天用，但遲早會遇到。我自己第一週完全沒碰，撐得很順。

### 拉主分支最新進度

```bash
git fetch origin
git rebase origin/main
```

### Rebase 過程遇到衝突，解完繼續

```bash
# 編輯衝突檔案後
git add <conflicted-file>
git rebase --continue
```

### Rebase 中途想放棄

```bash
git rebase --abort
```

### 強推已經 rebase 過的分支

```bash
git push --force-with-lease
```

`--force-with-lease` 比 `--force` 安全——如果遠端有別人新推的 commit，它會擋下來而不是蓋掉。

### 強制清掉還有未 commit 改動的 worktree

```bash
git worktree remove ../myapp-frontend --force
```

### 從另一條 worktree 撿單一 commit 過來

```bash
git cherry-pick <commit-hash>
```

## 資料夾管理：worktree 平時怎麼擺、怎麼開

指令會背之後，第二個會卡住的是「**那我平常打開哪個資料夾？**」這部分我覺得有點複雜，所以多花一些篇幅講清楚。

### 一個關鍵校正：沒有「主資料夾」這個特權

新手最常見的誤解：

```
直覺版心智模型              實際的 git 觀念
──────────────────────────────────────────────────────────
主資料夾（老大）             所有 worktree 在 git 眼中是「平等的」
   ├─ worktree-1            它們共享同一個 .git/ 倉庫資料
   ├─ worktree-2            只是每個指向不同的分支
   └─ worktree-3
                            第一個建立的那個（你最初 clone 的）
                            技術上叫「main worktree」，但這只是
                            歷史/順序的差別，不是地位的差別
```

實務影響很小——你仍然可以把最初那個 `~/projects/myapp/` 當「主工作目錄」用，多數人也這麼做。但你要知道：它不是「比較高級」，只是「最先存在、通常包含 main 分支」。

### 平時打開哪個資料夾？看你現在做什麼

不是「永遠打開主資料夾」，也不是「永遠打開新的」——是跟著「現在這條工作線」走。

```
你現在要做的事                  打開哪個 worktree
─────────────────────────────────────────────────────────
做後台 / API 功能               ~/projects/myapp/
                                （主目錄，在 main 或主開發分支）

做前端設計實作                  ~/projects/myapp-frontend/
                                （前端 worktree，在 frontend-work）

做設計研究 / 探索新版            ~/projects/myapp-design-research/
                                （研究 worktree，在對應分支）

修一個短期 bug                  可以開新 worktree，也可以直接在
                                主目錄切 bug 分支（短任務不一定要開）
```

關鍵心智模型：**一個 worktree = 一條工作線 = 一個分支**。「我現在在做哪條線」決定「我打開哪個資料夾」。

### 一個典型的一天長這樣

```
早上 09:00 ─ 開電腦，打開 terminal
            │
            cd ~/projects/myapp        ← 從主目錄開始
            git worktree list          ← 看一眼今天有幾條線

            喔，今天要做前端
            cd ../myapp-frontend       ← 切到前端 worktree
            claude                     ← 在這啟動 Claude Code

            （整個上午在這條 session 做前端...）


中午 12:30 ─「主目錄有個小 bug 想順手修」
            │
            開另一個 terminal 視窗（重點）
            cd ~/projects/myapp        ← 在新 terminal 切回主目錄
            修 bug、commit、push
            （前端那條 session 不用關，還在另一個 terminal 跑）


下午 15:00 ─ 回到前端 terminal，繼續做設計實作


晚上 18:00 ─ 前端做完一段
            git add . && git commit -m "..."
            git push
            gh pr create --fill --base main
```

兩個關鍵：

**第一，兩個 terminal、各自 `cd` 進不同 worktree**。你不是「切換」資料夾——你是同時打開兩個、各做各的。這就是 worktree 的全部意義：讓你能真正同時、隔離地推進兩條線。

**第二，「現在在哪」靠指令而不是記性**。任何時候不確定：

```bash
pwd                          # 我現在在哪個資料夾
git branch --show-current    # 我現在在哪條分支
```

兩條 session 跑久了，你會搞混——所以不要靠記性，靠指令。

### 編輯器 / Claude Code 怎麼開

每條線開一個編輯器視窗：

```bash
# 做後台
code ~/projects/myapp

# 做前端
code ~/projects/myapp-frontend
```

兩個 VSCode / Cursor 視窗同時開，各看各的檔案樹。

對 Claude Code 也一樣——**你在哪個 worktree 啟動 `claude`，它就把那個資料夾當「專案根目錄」**。它讀到的 `docs/`、`app/`、`CLAUDE.md` 全都是那個 worktree 裡的版本。這正是隔離的關鍵：Claude Code 看不到別條 worktree 的存在，它只看到當下這條。

### 一個會踩的坑：同步的錯覺

新手最常犯的錯：

```
錯誤心智模型                    正確心智模型
─────────────────────────       ─────────────────────────
「我在 worktree-A 改了           「worktree-A 改的東西在 A 的
  schema，worktree-B 應該          working copy 裡，B 看不到。
  也會看到」                       要 B 也看到，A 必須 commit
                                   + push，B 必須 fetch + rebase
                                   才會拿到」
```

**worktree 之間不會自動同步**。它們共享 git 倉庫（`.git/` 內部資料），但工作目錄是獨立的。要讓變更跨 worktree 流通，得透過 git 正規流程（commit / push / pull / rebase）。

這也是為什麼 `schema.ts`、`wrangler.jsonc`、`package.json` 這種共用檔該約定「只有一條線能動」——另一條線要拿到改動，得等對方 commit 完才能 fetch+rebase 過來，不是即時的。

### 給你的具體建議

1. **把最初那個資料夾固定當「家」**。早上開電腦先 `cd` 進去、跑 `git worktree list` 看當天有哪些線。這是錨點。
2. **當天要做什麼，就 `cd` 進對應 worktree**。別在主目錄改前端的東西、別在前端 worktree 改後台的東西——一律「線對線」。
3. **開兩個以上 terminal 視窗，各自固定一條線**。terminal A 永遠停在主目錄、terminal B 永遠停在前端 worktree。要切就切視窗，不要在同一個 terminal 裡 `cd` 來 `cd` 去（容易迷失）。
4. **每天結束前跑一次 `git worktree list`**。確認哪些線該收掉（做完合併後沒清的），別讓殭屍 worktree 累積。

## worktree 的心智模型

一個 worktree = 磁碟上的一個獨立資料夾 + 一條獨立分支 + 一條獨立的 Claude Code session。你的 `~/projects/myapp-frontend/` 跟 `~/projects/myapp/` 是兩個真正的工作區，互不污染。

這跟 `git checkout` 切分支不一樣——`checkout` 是「在同一個資料夾裡換成另一條分支」，所有 session 看到的檔案會一起變。worktree 是「再開一個資料夾、放另一條分支的快照」，每個 session 看到自己的世界。

對平行 Claude session 來說這是關鍵：兩個 session 同時在不同 worktree 改檔案，**對 git 而言是兩個獨立的工作區，不會打架**。

## 為什麼起步四場景就夠

我一開始想把 10 個場景一次背完，結果第二天就忘一半。後來發現：場景 1（開）、場景 2（看）、場景 3（commit + push + PR）、場景 4（清），這四個就佔了 90% 的時間。

其他的（rebase、cherry-pick、強推）是「撞到衝突」的情境，**等真的撞到再查比較有效**——因為那時你有具體錯誤訊息，知道在解什麼問題。

我自己的踩雷紀錄：第一週我太想學「對的做法」，跑去研究 `git rebase --interactive` 跟 `--force-with-lease` 的差異，花了一個下午看完還是不太懂。後來把這些先丟掉，只用場景 1-4 撐了一週，撐得很順。**真正撞到 rebase 衝突是第十天的事，那時看一次五分鐘就學會**，因為手上正有個衝突可以對照。

## git worktree list 是你的安全網

第二個要記的概念：**`git worktree list` 永遠不會壞事**。

什麼時候跑這個？

- 早上開工，提醒自己昨天開了哪些線
- 切 terminal 切到頭暈，不確定自己在哪
- 準備清理之前，看哪些可以收掉

任何時候覺得「我搞混了」，先跑 `git worktree list` 再說。它純讀取、不改任何東西、不會破壞工作區。配合 `pwd` 跟 `git branch --show-current`，三個指令就能把自己定位回來。

## 哪裡會出問題

worktree 不解決一切——**共用檔案還是會撞**。

`lib/db/schema.ts`、`wrangler.jsonc`、`package.json` 這些檔案如果兩條 worktree 同時改，merge 回 main 時 100% 會 conflict。預防法：開工前約定「前端線只動 UI、後端線只動 schema」，真的需要跨越界線就停下來協調。**規則勝過事後解 conflict。**

另一個雷：`git worktree remove` 不能省略。直接 `rm -rf ../myapp-frontend` 看起來是清掉了，但 git 內部還記得這個 worktree 存在，下次 `worktree list` 會出現殭屍記錄。乖乖用 `git worktree remove ../X`。

## 今天可以做的事

1. 開一條新 worktree 給下一個小功能：`git worktree add ../myapp-feature -b feature-branch-name`
2. `cd` 進去，啟動一條新的 Claude Code session
3. 做完一段就跑場景 3（commit + push + `gh pr create --fill --base main`）
4. 不確定自己在哪？`git worktree list`

撞到 rebase、cherry-pick、強推再回來查上面的進階場景。起步四場景先撐一週。

---

下一步閱讀建議：如果你在用 `gh` CLI 開 PR，搭配 GitHub Actions 自動跑 preview deploy 會把這個循環收得更緊——做完一段、推、自動部署、看畫面、merge，整套不到五分鐘。
