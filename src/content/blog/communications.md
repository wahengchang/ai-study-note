---
title: Gemini Prompt：溝通公關
description: >-
  Gemini prompts for PR and communications — press releases, internal
  announcements, and stakeholder updates
pubDate: '2026-04-05'
category: prompt-notes
tags:
  - template
  - prompt-engineering
  - gemini
draft: false
---

# 溝通公關 Prompt 範本

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## 撰寫新聞稿

```
I'm a PR manager. I need to create a press release with a catchy title.
Include quotes from @[VIP Quotes Acquisition].
```
**工具**：Gemini in Docs side panel

### 迭代：補充被收購公司資訊

```
Use @[Biography and Mission Statement] to add more information about the
company that is being acquired, its mission, and how it got started.
```

## 準備分析師/媒體簡報

```
Create a brief template to prepare a spokesperson for an upcoming media
and analyst briefing for @[Product Launch]. Include space for a synopsis,
key messages, and supporting data.
```
**工具**：Gemini in Docs

### 迭代：產出摘要

```
Craft a synopsis of the product launch in three main points using
@[Product Launch - Notes].
```

### 管理媒體聯繫人（Sheets）

```
Organize my media and analyst contacts from @[Analyst and Journalist
Contact Notes] for a new product briefing. I need to keep track of their
names, type of contact (analyst or journalist), focus area, the name of
the outlet, agency or firm that they work for, and a place where I can
indicate the priority level of their attendance at this briefing
(low, medium, high).
```

## 模擬面試問題

```
I am a [PR/AR] manager at [company name]. We just launched [product] and
had a briefing where we discussed [key messages]. I am preparing
[spokesperson and role/title] for interviews. Generate a list of mock
interview questions to help [spokesperson] prepare. Include a mixture of
easy and hard questions, with some asking about the basics of [product]
and some asking about the long-term vision of [product].
```
**工具**：Gemini App → Export to Docs

### 迭代：產出建議答案

```
Use @[Product Launch Notes] to write suggested answers for these questions.
Write the talking points as if you are [title of spokesperson] at [company].
```

## 內部溝通備忘錄

```
I need to draft a company-wide memo unveiling our relaunched intranet.
The [new page] addresses [common feedback we heard from employees] and
aims to create a more user friendly experience. Draft an upbeat memo
announcing [the new site] using @[Intranet Launch Plan Notes].
```
**工具**：Gemini in Docs

## 進階：Gem 壓力測試

建立 Gem 扮演特定角色（如 "Skeptical Tech Journalist" 或 "C-Suite Executive"），用來審查簡報並生成挑戰性問題，預先準備各種情境。
