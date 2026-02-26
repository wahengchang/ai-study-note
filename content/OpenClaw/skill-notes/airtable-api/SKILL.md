---
name: airtable-api
description: Airtable Web API operations for listing bases and tables, validating PAT access, and performing record CRUD (create/read/update/delete), including attachment uploads via URL. Use when users ask to inspect Airtable metadata, verify token permissions, or automate Airtable record workflows with curl.
---

# Airtable API

Follow this workflow in order.

## 1) Validate token access

- Run `GET https://api.airtable.com/v0/meta/bases`.
- Confirm HTTP status and list visible bases.
- If no expected base appears, check PAT scope and base sharing.

## 2) Discover tables and fields before writes

- Run `GET https://api.airtable.com/v0/meta/bases/{base_id}/tables`.
- Extract target table ID/name and field names/types.
- Use exact field names in request payloads.

## 3) Execute CRUD operations

Use `Authorization: Bearer <PAT>` and `Content-Type: application/json`.

- Create: `POST /v0/{base_id}/{table_name}` with `{"fields": {...}}`.
- Read list: `GET /v0/{base_id}/{table_name}`.
- Read one: `GET /v0/{base_id}/{table_name}/{record_id}`.
- Update: `PATCH /v0/{base_id}/{table_name}/{record_id}`.
- Delete: `DELETE /v0/{base_id}/{table_name}/{record_id}`.

When running verification tests, delete temporary records unless the user asks to keep them.

## 4) Upload attachments

For `multipleAttachments` fields, send an array:

```json
{
  "fields": {
    "Attachments": [
      {
        "url": "https://example.com/file.pdf",
        "filename": "file.pdf"
      }
    ]
  }
}
```

After upload, verify attachment metadata is present in the response.

## 5) Handle common errors

- `401 Unauthorized`: token invalid/expired.
- `403 Forbidden`: missing scope or insufficient base permissions.
- `404 Not Found`: wrong base/table/record identifier.
- `422 Unprocessable Entity`: invalid field names or field types.

## 6) Reporting format

Return concise results with:

- Base and table used (name + ID).
- HTTP status for each step.
- Record ID created/updated/deleted.
- Final cleanup status.

## 7) Security

- Prefer PAT in environment variables.
- Do not log PAT in plaintext in deliverables.
- If user shares PAT in chat, recommend rotating it.

For reusable command templates, see `references/curl-templates.md`.
