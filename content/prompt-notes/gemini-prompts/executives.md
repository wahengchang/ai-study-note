---
title: "Gemini Prompt：高階主管"
tags:
  - template
  - prompt-engineering
  - gemini
description: "Gemini prompts for C-suite — board meeting replies, strategic memos, and executive briefings"
---

# 高階主管 Prompt 範本

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## CEO

### 行動中回信

```
Draft an email confirming that I will be at the board meeting. Ask if we
can adjust the agenda to give 15 minutes to [urgent topics].
```
**工具**：Gemini in Gmail → Refine → Formalize

### 快速回覆長信件串

```
Generate a response to [person] about [topic]. Include details on
[deliverable] and [timeline] using @[Project A Status Report].
```

### 簡報大綱（語音輸入）

```
I'm the CEO giving a presentation to [audience] at [event], and I want to
create a detailed outline for my team to get started. I want to include a
few important topics, including [areas of focus] and how our company is
innovating with [company initiatives]. I'm envisioning time for a customer
Q&A to end the presentation.
```
**工具**：Gemini App（語音輸入）

### 產業追蹤（Deep Research）

開啟 Gemini App → Deep Research，研究最新產業趨勢 → 建立 Audio Overview 於通勤時收聽。

## COO

### Town Hall 開場白

```
Write two uplifting paragraphs for employees who have just finished a
challenging quarter. Acknowledge [difficulties] and emphasize [positives]
for the upcoming quarter. Use a tone that is motivating, optimistic, and
fosters a sense of unity and collaboration.
```

### 模擬困難 Q&A

```
I'm the COO of a mid-sized company. I am hosting a quarterly town hall
meeting with the entire company. I want to brainstorm and practice how I
will respond to potentially tough questions. Help me write challenging
questions that employees may ask at the upcoming town hall about [URL of
company announcement]. Generate potential answers for each question that
use a confident but firm tone.
```

### 行動中快速委派

```
Draft an email to [project lead] letting them know I will not be in the
meeting due to an urgent matter. Ask them to take detailed notes and to
ensure the team arrives at a decision on [key topic] in addition to
assigning ownership of the postmortem report to [colleague].
```

## CMO

### 目標受眾研究

```
I'm a marketing leader conducting analysis in preparation for next year's
[launch]. Define my target audiences [audiences], for my new line of
[product]. Include interests, relevant marketing channels, and top trends
that drive their consideration and purchase behavior.
```

### 品牌價值與競品分析

```
Brainstorm value props for my [target audiences] based on features from
@[Product Requirements Document]. Include a section on campaign learnings
from @[Campaign Performance].
```

### 競爭分析（Deep Research）

```
I am a CMO conducting a competitive analysis. My company is considering
expanding into [a new line of business]. Generate a list of the top five
competitors in the [industry] industry and include their pricing, strengths,
weaknesses, and target audience.
```

## CTO

### 新興技術摘要

```
I am the CTO of [company] in [industry]. I want to understand emerging
technology trends. Summarize the top five emerging technologies with the
most significant potential impact on [industry]. For each technology, list
its potential benefits and challenges, and suggest how it could impact
[company] in the next two to three years.
```

### 程式碼盡職調查

上傳程式碼至 Gemini App，請求分析主要架構、過時依賴、潛在安全漏洞。

## CIO

### 技術主題非技術化溝通

```
I am the CIO at [company], and I am trying to build the case to [adopt
generative AI solutions]. I need to explain the technical concept of
generative AI to a non-technical audience (the CEO and board). Help me
write talking points that will help me convey what generative AI is, ways
it could help us digitally transform, and why it's important to our growth
as a company.
```

### 供應商研究

```
I am the CIO at [company]. We are currently evaluating vendor options to
[replatform our intranet]. Right now, we use [vendor], but we are looking
to switch because [we are unhappy with limited functionality and account
support]. Suggest additional vendor options to consider and include
descriptions of their product and services and key features.
```

### 技術報告摘要

```
Summarize the key findings and implications of this report for [audience].
Focus on the main [vulnerabilities] identified and the recommended actions
to address them. Use a formal tone.
```

### IT 資產追蹤

```
Create a tracker of software licenses for employees and include columns
for license types, usage rights, and renewal dates.
```
**工具**：Gemini in Sheets

## CHRO

### 員工滿意度調查

```
Draft an anonymous employee satisfaction survey with questions and answer
options that touch upon key areas like workload, work-life balance,
compensation, and career growth opportunities. Ensure the questions are
clear, concise, and avoid leading answers.
```

### 培訓計劃（Deep Research）

使用 Gemini App Deep Research 辨識產業所需的新興技能，並產出內部培訓課程大綱。
