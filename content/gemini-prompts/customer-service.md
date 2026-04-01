---
title: "Gemini Prompt：客戶服務"
tags:
  - Gemini
  - prompting
  - customer-service
description: "Gemini prompts for customer service — empathetic complaint responses, escalation templates, and FAQ drafting"
---

# 客戶服務 Prompt 範本

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## 回覆客訴（同理心回應）

```
Help me craft an empathetic email response. I am a customer service
representative, and I need to create a response to a customer complaint.
The customer ordered a pair of headphones that arrived damaged. They've
already contacted us via email and provided pictures of the damage. I've
offered a replacement, but they're requesting an expedited shipping option
that isn't typically included with their order. Include a paragraph that
acknowledges their frustration and three bullet points with potential
resolutions.
```
**工具**：Gemini in Docs (Help me write)

### 迭代：替代方案

```
Suggest 10 alternative options in place of expedited shipping to resolve
the customer's frustration about receiving the damaged package.
```

## 引用 FAQ 回覆複雜問題

```
Summarize information about [product name] including the product's specific
[return policy], [ingredients], and [certifications].
```
**工具**：Gemini in Drive side panel（搜尋跨檔案資訊）

```
Generate a response to the customer question about our [return policy] and
[product certifications] based on @[Customer FAQ Document]. Use a helpful
and professional tone.
```
**工具**：Gemini in Gmail side panel

## 標準化溝通模板

```
Draft templates for three different types of customer communication.
Create templates for apology emails, order confirmation messages, and
thank you notes for loyal customers. Keep each template to one paragraph
and use a friendly tone.
```

### 客服 best practices 培訓

```
Craft a list of customer communication best practices that can be used to
train new team members. Outline three sections, including how to handle
happy customer inquiries, neutral customer inquiries, and dissatisfied
customer inquiries.
```

### 電話標準用語

```
I am a [customer service manager]. I am trying to create standardized
language that the team can use when interacting with customers on phone
calls. Generate templates for common call openings, greetings, and closures
for a customer service representative at a retail store. These templates
should allow for personalization with customer details.
```

## 客戶回饋分析

```
I am a customer support specialist. Using the attached spreadsheet, identify
trends and patterns in our [customer feedback] by [category] over
[time period]. Identify areas where [customer outreach] has increased
significantly and investigate potential reasons.
```
**工具**：Gemini App（上傳試算表）

## 客戶自助服務內容

```
Summarize this content to write a clear and concise product return policy
and outline 5 steps for customers to take in sequential order.
```

### 轉為部落格

```
Take this content and turn it into a short blog with the title "Resolve
Common Issues Without Agent Assistance." Have separate sections for our
return policy, our refund policy, and our store credit policy.
```

## 跨部門協作

```
Draft an email to my colleagues proposing a meeting to discuss customer
experience improvement initiatives. Request that marketing, sales, and
product stakeholders meet in the next week to get a clear sense of roles
and responsibilities.
```

```
Create a table to track the progress and impact of different customer
experience improvement tactics using relevant metrics, including support
ticket volume and priority level (high, medium, low).
```
**工具**：Gemini in Sheets
