# Airtable curl templates

Set once:

```bash
export AIRTABLE_TOKEN="<PAT>"
export BASE_ID="appXXXXXXXXXXXXXX"
export TABLE_NAME="YourTable"
```

## List bases

```bash
curl -sS "https://api.airtable.com/v0/meta/bases" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN"
```

## List tables in a base

```bash
curl -sS "https://api.airtable.com/v0/meta/bases/$BASE_ID/tables" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN"
```

## Create

```bash
curl -sS -X POST "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"fields":{"Name":"Example"}}'
```

## Read list

```bash
curl -sS "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN"
```

## Read one

```bash
curl -sS "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME/recXXXXXXXXXXXXXX" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN"
```

## Update

```bash
curl -sS -X PATCH "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME/recXXXXXXXXXXXXXX" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"fields":{"Notes":"Updated"}}'
```

## Upload attachment by URL

```bash
curl -sS -X PATCH "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME/recXXXXXXXXXXXXXX" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"fields":{"Attachments":[{"url":"https://example.com/file.pdf","filename":"file.pdf"}]}}'
```

## Delete

```bash
curl -sS -X DELETE "https://api.airtable.com/v0/$BASE_ID/$TABLE_NAME/recXXXXXXXXXXXXXX" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN"
```
