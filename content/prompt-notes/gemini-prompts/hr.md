---
title: "Gemini Prompt：人力資源"
tags:
  - template
  - prompt-engineering
  - gemini
description: "Gemini prompts for HR — onboarding presentations, job descriptions, and employee development scripts"
---

# 人力資源 Prompt 範本

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## 新人歡迎簡報

```
I am an HR manager, and I am developing a script for my presentation for
new hires. I need to create the script for an onboarding presentation about
our company's commitment to employee development and well-being. Help me
draft talking points that showcase why employee mentorship and development
are core values for our company using @[Mission Statement and Core Values].
```
**工具**：Gemini in Docs

### 迭代：補充發展計劃

```
Add four talking points for a new section of the presentation script that
explains how we support our employees' development. Mention our training
and certification programs and mentorship opportunities using @[Learning
and Development Paths], and write a strong closing statement about our
expectation that everyone contributes to a respectful and welcoming
workplace. Use a professional tone.
```

## 招聘流程

### 招聘統計

```
Help me create a formula to calculate the total number of [hires]
by [department].
```
**工具**：Gemini in Sheets

### 職位描述

```
I am opening a new job position on the marketing team. Write a compelling
role description for a content marketing manager. Highlight key
responsibilities [insert] and requirements, including B2B and B2C content
creation, a minimum of five years experience, and a portfolio of writing
examples.
```

> **進階：Gem "Job Description Writer"** — 訓練公司格式、品牌語調、核心價值觀，確保所有 JD 一致且高品質。

## 面試準備

```
I am a recruiter, and I am preparing for candidate interviews. Using the
job description in the file I'm uploading, write a list of 20 open-ended
interview questions that I can use to screen candidates.
```
**工具**：Gemini App（上傳 JD 檔案）

## 錄取/婉拒信

### 錄取信

```
I am writing an email to a job candidate who just finished the interview
process. Create a template for an offer letter for the [selected candidate]
for the [position] with a request to schedule a call to discuss benefits,
compensation, and start date.
```

### 婉拒信

```
I am writing an email to job candidates who finished the interview process,
but who were not selected. Help me write a rejection letter for [candidate]
for the [position]. Use an empathetic tone.
```

## 員工入職

### 第一週行程表

```
Create a table that outlines a new employee's first-week schedule, including
key meetings, training sessions, and introductions. Provide a column for
key contacts and priority level (low, medium, high) for each activity.
```
**工具**：Gemini in Sheets

### 團隊活動

```
Design a team-bonding activity, such as an office scavenger hunt, to have
team members work together during their team meeting.
```

## 員工調查

### 產出問卷

```
I am an HR manager in charge of running our enterprise-wide survey at
[company] to gauge employee engagement and satisfaction. Generate a list
of questions I can use to build the survey.
```

### 清理調查數據

```
Help me clean my employee survey spreadsheet. Specifically, fill any blank
values in the name column with "Anonymous," and if the region column shows
Headquarters, replace that with HQ. Finally, remove any rows where the
satisfaction column is blank. Please generate a new file for me with my
cleaned data.
```
**工具**：Gemini App

### 個人化學習計劃

```
Create a personalized learning and development plan for a new hire who
needs to learn about [topic]. Organize it by day and suggest relevant files.
```
**工具**：Gemini in Drive side panel
