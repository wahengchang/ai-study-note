---
title: "n8n Workflow Skill"
name: n8n-workflow-skill
description: "Standardize n8n workflow management — CLI-based CRUD, project-scoped install, and workflows-as-code"
tags:
  - skill-definition
  - openclaw
  - n8n
---

# n8n-workflow-skill

## Description
Standardize n8n workflow management using local project-scoped installation, CLI-based CRUD, and workflows-as-code.

## Workspace Context
- **Root**: `/home/peter/.openclaw/workspace-dev/n8n-project`
- **Binary**: `./node_modules/.bin/n8n`
- **Workflows Directory**: `./workflows/`
- **Server URL**: `http://localhost:5678`

## Operational Directives

### 1. Project Structure
- `n8n-project/`
    - `.env` (Secrets - DO NOT COMMIT)
    - `.n8n/` (Database/Runtime - DO NOT COMMIT)
    - `workflows/` (Source of Truth - JSON files)
    - `package.json`
    - `node_modules/`

### 2. Core Rule: Conflict Management
**NEVER** run CLI commands that execute workflows (`n8n execute`) while the background server is running. Both processes compete for internal port `5679`.
- **Stop Server**: Find the OpenClaw process (e.g., `wild-bloom`) and kill it.
- **Run CLI**: Execute the command.
- **Restart Server**: `cd n8n-project && npm start` (background).

### 3. Workflow Lifecycle Commands
Run all commands from `n8n-project/`.

#### Create / Update
Import a workflow from JSON. If the `id` in the JSON exists in the DB, it updates; otherwise, it creates.
```bash
./node_modules/.bin/n8n import:workflow --input=./workflows/workflow.json
```

#### Read (Export)
Sync the database state back to your "Workflows as Code" directory.
```bash
# Export specific
./node_modules/.bin/n8n export:workflow --id=1 --output=./workflows/workflow.json

# Export all
./node_modules/.bin/n8n export:workflow --all --output=./workflows/
```

#### Execute (Headless)
Run a workflow without the UI. **Requirement: Stop the server first.**
```bash
./node_modules/.bin/n8n execute --id=1
```

### 4. Developer Workflow
1. **Start Server**: Ensure n8n is running.
2. **Build**: Create/Edit in the UI (`http://localhost:5678`).
3. **Capture**: Export the UI changes to the `workflows/` folder.
4. **Commit**: JSON files are the source of truth.
5. **Test**: Stop server, run `execute` via CLI to verify.
6. **Deploy**: Restart server.

### 5. ID Strategy
- **Maintain ID**: Keep the `id` field in JSON for deterministic updates of existing workflows.
- **Duplicate**: Remove the `id` field from the JSON before importing to create a copy.

## Deployment Pattern
To bulk-provision an environment:
```bash
./node_modules/.bin/n8n import:workflow --input=./workflows/
./node_modules/.bin/n8n update:workflow --id=1 --active=true
```
