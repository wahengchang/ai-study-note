---
title: Team File Structure & Logic Guide
---

# Team File Structure & Logic Guide

- **From:** File Management Team
- **To:** All Team Members
- **Last Updated:** March 2026

## Overview

To ensure efficiency and knowledge retention, we use four file structures based on project complexity. Please follow these guidelines for creating, updating, and reading files.

## Type 1-A: Simple Daily Log

- **Path:** `workspace/topic/[date].md`
- **Use case:** Simple chronological tracking (e.g., daily meeting notes, single-stream progress).
- **Logic:** One file per day per topic. All updates for the day go in this single file.

### Create/Update

- If the file doesn't exist, create it (e.g., `2026-03-06.md`).
- If it exists, append your notes and include a timestamp.

### Read

- Check the specific date's file to see the day's progress.

## Type 1-B: Daily Log + Master Overview

- **Path:** `workspace/topic/[date].md` & `workspace/topic/overview.md`
- **Use case:** Ongoing projects requiring a high-level summary for management or cross-functional teams.
- **Logic:** Same as 1-A, plus a master `overview.md` file at the topic root.

### Create/Update

- Update `[date].md` as usual.
- **Crucial:** After finishing your daily log, add 1-2 summary bullet points to `overview.md` with a link to the daily log.

### Read

- Read `overview.md` for the big picture; click the links for daily details.

## Type 2-A: Sub-Topic Daily Folder

- **Path:** `workspace/topic/[date]/[sub-topic].md`
- **Use case:** Days with multiple independent workflows (e.g., Frontend, Backend, and Design working simultaneously).
- **Logic:** Create a "daily folder" containing separate files for each sub-topic (workflow).

### Create/Update

- Create the date folder.
- Create or update your specific `[sub-topic].md` (e.g., `2026-03-06/backend.md`).
- Do not overwrite others' files.

### Read

- Enter the date folder to check isolated progress for a specific sub-topic.

## Type 2-B: Comprehensive Matrix

- **Path:** `workspace/topic/[date]/[sub-topic].md` & `workspace/topic/[date]/overview.md` & `workspace/topic/overview.md`
- **Use case:** Complex, large-scale, long-term projects across multiple teams.
- **Logic:** The most rigorous structure. Combines daily sub-topic files, a daily overview, and a master project overview.

### Create/Update

- **Members:** Update your `[sub-topic].md` in the date folder.
- **Leads:** At EOD, compile all sub-topic updates into `[date]/overview.md`.
- **Leads:** Condense the daily overview into a single sentence and update the master `workspace/topic/overview.md`.

### Read

- **Execs:** Read the master `overview.md` for project health.
- **Leads:** Read `[date]/overview.md` for total daily output.
- **Members:** Read specific `[sub-topic].md` files for technical details.

## ⚠️ Important Rule: Standard Naming Format

To ensure proper file sorting, always use the `YYYY-MM-DD` format for all date variables (both folders and files).

- ✅ Correct: `2026-03-06.md`
- ❌ Incorrect: `March-6.md`, `03-06-2026.md`, `today.md`
