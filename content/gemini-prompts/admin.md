---
title: "Gemini Prompt：行政支援"
tags:
  - Gemini
  - prompting
  - admin
description: "Reusable Gemini prompts for admin tasks — offsite planning, event coordination, and scheduling"
---

# 行政支援 Prompt 範本

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## 規劃 Offsite 議程

```
I am an executive administrator to a team director. Our newly formed team now
consists of [team members]. We are gathering for the first time at a [N]-day
offsite in [location]. Plan activities for each day that include team bonding
activities and time for deeper strategic work. Create a sample agenda for me.
```
**工具**：Gemini App → Export to Docs

### 迭代：產出破冰活動

```
Suggest three different icebreaker activities that encourage people to learn
about their teammates' preferred working styles, strengths, and goals. Make
sure the icebreaker ideas are engaging and can be completed by a group of
25 people in 30 minutes or less.
```

### 迭代：轉換為表格

```
Organize this agenda in a table format. Include one of your suggested
icebreakers for each day.
```

## 管理多個 Email 信箱

```
Summarize emails from [manager] from the last week.
```
**工具**：Gemini in Gmail side panel

### 迭代：摘要特定信件串

```
Summarize this email thread and list all action items and deadlines.
```

### 迭代：引用檔案回覆

```
Generate a response to this email and use @[file name] to describe how
the [initiative] can complement the workstream outlined in [colleague's
name]'s message.
```

## 商務旅行規劃

```
I am an executive assistant. I need to create an itinerary for a two-day
business trip in [location] during [dates]. My manager is staying at [hotel].
Suggest different options for breakfast and dinner within a 10-minute walk
of the hotel, and find one entertainment option such as a movie theater,
a local art show, or a popular tourist attraction. Put it in a table for me.
```
**工具**：Gemini App → Share & export → Draft in Gmail

## 差旅預算追蹤

```
Create a budget tracker for business travel. It should include columns for:
date, expense type (meal, entertainment, transportation), vendor name,
and a description.
```
**工具**：Gemini in Sheets side panel

## 會議簡報準備

上傳活動簡報、相關新聞剪報、過往談話重點至 **NotebookLM**，一鍵產出簡報文件或 Video Overview。

## 引用檔案補充議程內容

```
Use @[2024 H2 Team Vision] to generate a summary for the opening remarks
on Day 1 of this agenda.
```
**工具**：Gemini in Docs
