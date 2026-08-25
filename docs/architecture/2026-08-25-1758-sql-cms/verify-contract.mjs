#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ENVIRONMENT_ERROR = 78;
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
const root = resolve(rootFlag === -1 ? here : args[rootFlag + 1]);
const writeSnapshot = args.includes('--write-snapshot');
const noMutationTests = args.includes('--no-mutation-tests');

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch (error) {
  console.error(`ENVIRONMENT_ERROR: node:sqlite is required (Node.js 22.22+): ${error.message}`);
  process.exit(ENVIRONMENT_ERROR);
}

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const migrationDir = join(root, 'migrations');
const schemaPath = join(root, 'schema.sql');
const fixturePath = join(root, 'contract-fixtures.sql');
const openapiPath = join(root, 'openapi.json');

function migrations() {
  const files = readdirSync(migrationDir).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  assert(files.length > 0, '至少需要一個 ordered migration');
  return files.map((filename, index) => {
    const sequence = Number(filename.slice(0, 4));
    assert(sequence === index + 1, `migration sequence 不連續：${filename}`);
    const sql = readFileSync(join(migrationDir, filename), 'utf8');
    assert(sql.includes('PRAGMA foreign_keys = ON;'), `${filename} 缺少 foreign_keys header`);
    return { filename, sequence, migrationId: filename.slice(0, -4), sql, hash: sha256(sql) };
  });
}

function openDatabase(migrationFiles) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
  for (const migration of migrationFiles) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (migration_id, sequence, filename, sha256, applied_at) VALUES (?, ?, ?, ?, ?)')
        .run(migration.migrationId, migration.sequence, migration.filename, migration.hash, '2026-08-25T00:00:00Z');
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }
  return db;
}

function snapshot(db) {
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  return [
    '-- GENERATED from migrations/*.sql by verify-contract.mjs --write-snapshot; DO NOT EDIT.',
    ...rows.map((row) => `-- ${row.type}:${row.name}:${row.tbl_name}\n${normalize(row.sql)};`),
    ''
  ].join('\n');
}

function assertLedger(db, migrationFiles) {
  const rows = db.prepare('SELECT migration_id, sequence, filename, sha256 FROM schema_migrations ORDER BY sequence').all();
  assert(rows.length === migrationFiles.length, 'migration ledger 長度不符');
  for (const [index, migration] of migrationFiles.entries()) {
    const row = rows[index];
    assert(row.migration_id === migration.migrationId && row.sequence === migration.sequence && row.filename === migration.filename && row.sha256 === migration.hash, `migration ledger/hash 不符：${migration.filename}`);
  }
}

function assertSchema(db, migrationFiles) {
  const expectedTables = ['schema_migrations','post_types','post_type_schema_versions','field_definitions','field_definition_versions','taxonomies','taxonomy_versions','taxonomy_version_post_types','terms','term_revisions','entries','entry_revisions','entry_field_values','revision_terms','route_claims','media_objects','media_assets','idempotency_keys','operation_log'];
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
  for (const table of expectedTables) assert(tables.has(table), `缺少 table：${table}`);
  const triggers = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'").all().map((row) => row.name));
  for (const trigger of ['field_definition_versions_membership_insert','entry_field_values_membership_insert','revision_terms_membership_insert','route_claims_validate_insert','route_claims_validate_update','immutable_entry_revisions_update','immutable_entry_revisions_delete','immutable_term_revisions_update','immutable_field_definition_versions_update']) assert(triggers.has(trigger), `缺少 contract trigger：${trigger}`);
  const indexes = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'index'").all().map((row) => row.name));
  for (const index of ['entry_field_values_integer_idx','entry_field_values_real_idx','entry_field_values_date_idx','entry_field_values_datetime_idx','entry_field_values_text_idx','entry_field_values_media_idx','entry_field_values_relation_idx']) assert(indexes.has(index), `缺少 typed partial index：${index}`);
  const postTypeFks = db.prepare('PRAGMA foreign_key_list(post_type_schema_versions)').all();
  assert(postTypeFks.some((row) => row.table === 'post_types'), 'post_type_schema_versions 缺少 post_types FK');
  const valueFks = db.prepare('PRAGMA foreign_key_list(entry_field_values)').all();
  assert(valueFks.some((row) => row.table === 'entry_revisions') && valueFks.some((row) => row.table === 'field_definition_versions'), 'entry_field_values 缺少 required FK');
  const rendered = snapshot(db);
  const migrationFingerprint = sha256(migrationFiles.map((migration) => `${migration.filename}:${migration.hash}`).join('\n'));
  assert(rendered.includes('route_claims_validate_insert') && rendered.includes('owner_kind'), 'route ownership contract 缺失');
  assert(rendered.includes("state TEXT NOT NULL CHECK (state IN ('pending','completed','failed'))"), 'idempotency state contract 缺失');
  assert(migrationFingerprint.length === 64 && sha256(rendered).length === 64, 'schema fingerprint 無法建立');
  return rendered;
}

function expectFailure(db, sql, label) {
  try {
    db.exec(sql);
  } catch {
    return;
  }
  fail(`應被 SQLite 拒絕：${label}`);
}

function assertFixtures(db) {
  db.exec(readFileSync(fixturePath, 'utf8'));
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-route-kind', 'entry', 'entry-one', '/bad-kind/', 'tr-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, canonical_path, reserved_key, current_source_id, created_at, updated_at) VALUES ('bad-reserved', 'reserved', '/bad-reserved/', 'reserved', 'er-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'reserved route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-route-owner', 'entry', 'entry-one', '/bad-owner/', 'other-entry-revision', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'cross-owner route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-post-type-source', 'post_type_archive', 'pt-page', '/pages/', 'tax-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'post type wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-taxonomy-source', 'taxonomy_archive', 'tax-topic', '/topics/', 'pts-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'taxonomy wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-term-source', 'term_archive', 'term-ai', '/topics/ai/', 'pts-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'term wrong-kind route source');
  db.exec("INSERT INTO post_type_schema_versions (id, post_type_id, version_number, route_base, has_archive, hierarchical, created_at) VALUES ('pts-v2', 'pt-page', 2, '', 0, 1, '2026-08-25T00:00:00Z'); INSERT INTO field_definition_versions (id, field_definition_id, post_type_id, post_type_schema_version_id, label, field_type, cardinality, required, public_visible, filterable, sortable, created_at) VALUES ('fdv-v2', 'fd-title', 'pt-page', 'pts-v2', 'Rating', 'integer', 'single', 0, 1, 1, 1, '2026-08-25T00:00:00Z');");
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-cross-schema', 'er-v1', 'fdv-v2', 0, 'integer', 1, '2026-08-25T00:00:00Z');", 'cross-schema field version');
  db.exec("INSERT INTO post_types (id, key, resource_version, created_at, updated_at) VALUES ('pt-other', 'other', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO post_type_schema_versions (id, post_type_id, version_number, route_base, has_archive, hierarchical, created_at) VALUES ('pts-other-v1', 'pt-other', 1, 'other', 0, 0, '2026-08-25T00:00:00Z'); INSERT INTO field_definitions (id, post_type_id, key, created_at) VALUES ('fd-other', 'pt-other', 'other-rating', '2026-08-25T00:00:00Z'); INSERT INTO field_definition_versions (id, field_definition_id, post_type_id, post_type_schema_version_id, label, field_type, cardinality, required, public_visible, filterable, sortable, created_at) VALUES ('fdv-other-v1', 'fd-other', 'pt-other', 'pts-other-v1', 'Other rating', 'integer', 'single', 0, 1, 1, 1, '2026-08-25T00:00:00Z');");
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-cross-post-type', 'er-v1', 'fdv-other-v1', 0, 'integer', 1, '2026-08-25T00:00:00Z');", 'cross-Post-Type field version');
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-single-ordinal', 'er-v1', 'fdv-v1', 1, 'integer', 1, '2026-08-25T00:00:00Z');", 'single second ordinal');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, canonical_path, reserved_key, created_at, updated_at) VALUES ('duplicate-route', 'reserved', '/one/', 'duplicate', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'duplicate route');
  expectFailure(db, "UPDATE entry_revisions SET title = 'mutated' WHERE id = 'er-v1';", 'revision update');
  expectFailure(db, "DELETE FROM entry_revisions WHERE id = 'er-v1';", 'revision delete');
  db.exec("INSERT INTO terms (id, taxonomy_id, resource_version, created_at, updated_at) VALUES ('term-other', 'tax-topic', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO term_revisions (id, term_id, taxonomy_version_id, revision_number, name, slug, created_at) VALUES ('tr-other', 'term-other', 'tax-v1', 1, 'Other', 'other', '2026-08-25T00:00:00Z');");
  expectFailure(db, "INSERT INTO revision_terms (entry_revision_id, term_id, term_revision_id, created_at) VALUES ('er-v1', 'term-ai', 'tr-other', '2026-08-25T00:00:00Z');", 'term revision mismatch');
  db.exec("UPDATE media_assets SET archived_at = '2026-08-25T01:00:00Z' WHERE id = 'asset-one';");
  assert(db.prepare("SELECT count(*) AS count FROM media_objects WHERE id = 'obj-one'").get().count === 1, 'historical media archive 不可刪 object');
  expectFailure(db, "INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, expires_at, created_at, updated_at) VALUES ('idem-duplicate', 'entries:create', 'key-one', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'pending', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'idempotency unique');
  const state = db.prepare("SELECT CASE WHEN archived_at IS NOT NULL THEN 'archived' WHEN published_revision_id IS NULL AND first_published_at IS NULL THEN 'draft' WHEN published_revision_id IS NULL AND first_published_at IS NOT NULL THEN 'unpublished' WHEN current_revision_id = published_revision_id THEN 'published' ELSE 'modified' END AS state FROM entries WHERE id = 'entry-one'").get().state;
  assert(state === 'published', 'Entry state precedence 不符');
  assert(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'foreign key check 失敗');
  assert(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'integrity check 失敗');
}

function resolveRef(document, ref) {
  assert(ref.startsWith('#/'), `只允許 local $ref：${ref}`);
  return ref.slice(2).split('/').reduce((value, key) => value?.[key], document);
}
function walkRefs(document, value) {
  if (Array.isArray(value)) return value.forEach((item) => walkRefs(document, item));
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value) assert(resolveRef(document, value.$ref), `無法解析 $ref：${value.$ref}`);
  Object.values(value).forEach((item) => walkRefs(document, item));
}
function assertApi() {
  const api = JSON.parse(readFileSync(openapiPath, 'utf8'));
  assert(api.openapi === '3.1.0', 'OpenAPI 必須是 3.1.0');
  assert(api.info?.title && api.paths && api.components?.schemas, 'OpenAPI root 不完整');
  walkRefs(api, api);
  assert(api.components.parameters.IfMatch?.name === 'If-Match' && api.components.parameters.IfMatch?.in === 'header' && api.components.parameters.IfMatch?.required === true, 'If-Match header contract 不完整');
  assert(api.components.parameters.IdempotencyKey?.name === 'Idempotency-Key' && api.components.parameters.IdempotencyKey?.in === 'header' && api.components.parameters.IdempotencyKey?.required === true, 'Idempotency-Key header contract 不完整');
  const matrix = [
    ['GET','/post-types','listPostTypes'], ['POST','/post-types','createPostType'], ['GET','/post-types/{id}','getPostType'], ['POST','/post-types/{id}/schema-versions','createPostTypeSchemaVersion'], ['GET','/post-types/{id}/schema-versions/{versionId}','getPostTypeSchemaVersion'], ['POST','/post-types/{id}/publish','publishPostType'], ['POST','/post-types/{id}/archive','archivePostType'], ['POST','/post-types/{id}/unarchive','unarchivePostType'],
    ['GET','/taxonomies','listTaxonomies'], ['POST','/taxonomies','createTaxonomy'], ['GET','/taxonomies/{id}','getTaxonomy'], ['POST','/taxonomies/{id}/versions','createTaxonomyVersion'], ['GET','/taxonomies/{id}/versions/{versionId}','getTaxonomyVersion'], ['POST','/taxonomies/{id}/publish','publishTaxonomy'], ['POST','/taxonomies/{id}/archive','archiveTaxonomy'], ['POST','/taxonomies/{id}/unarchive','unarchiveTaxonomy'],
    ['GET','/taxonomies/{id}/terms','listTerms'], ['POST','/taxonomies/{id}/terms','createTerm'], ['GET','/taxonomies/{id}/terms/{termId}','getTerm'], ['POST','/taxonomies/{id}/terms/{termId}/revisions','createTermRevision'], ['GET','/taxonomies/{id}/terms/{termId}/revisions/{revisionId}','getTermRevision'], ['POST','/taxonomies/{id}/terms/{termId}/publish','publishTermRevision'], ['POST','/taxonomies/{id}/terms/{termId}/archive','archiveTerm'], ['POST','/taxonomies/{id}/terms/{termId}/unarchive','unarchiveTerm'],
    ['GET','/entries','listEntries'], ['POST','/entries','createEntry'], ['GET','/entries/{id}','getEntry'], ['POST','/entries/{id}/revisions','createEntryRevision'], ['GET','/entries/{id}/revisions/{revisionId}','getEntryRevision'], ['POST','/entries/{id}/preview','previewEntry'], ['POST','/entries/{id}/publish','publishEntry'], ['POST','/entries/{id}/unpublish','unpublishEntry'], ['POST','/entries/{id}/archive','archiveEntry'], ['POST','/entries/{id}/unarchive','unarchiveEntry'],
    ['GET','/media','listMedia'], ['POST','/media','createMedia'], ['GET','/media/{id}','getMedia'], ['PATCH','/media/{id}','updateMedia'], ['POST','/media/{id}/archive','archiveMedia'], ['POST','/media/{id}/unarchive','unarchiveMedia']
  ];
  for (const [method, path, operationId] of matrix) {
    const operation = api.paths[path]?.[method.toLowerCase()];
    assert(operation?.operationId === operationId, `缺少 ${method} ${path} 或 operationId 不符`);
    assert(operation.responses?.['400']?.$ref === '#/components/responses/ValidationError', `${operationId} 缺少統一 validation error`);
    if (method === 'POST') assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKey'), `${operationId} 缺少 Idempotency-Key`);
    if (['POST','PATCH'].includes(method) && !['createPostType','createTaxonomy','createTerm','createEntry','createMedia','previewEntry'].includes(operationId)) assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IfMatch'), `${operationId} 缺少 If-Match`);
    if (method === 'GET' && path !== '/post-types/{id}' && path !== '/taxonomies/{id}' && path !== '/taxonomies/{id}/terms/{termId}' && path !== '/entries/{id}' && path !== '/entries/{id}/revisions/{revisionId}' && path !== '/media/{id}' && !path.includes('schema-versions/{') && !path.includes('versions/{') && !path.includes('revisions/{')) assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/Cursor'), `${operationId} 缺少 cursor`);
  }
  for (const [path, item] of Object.entries(api.paths)) for (const method of Object.keys(item)) assert(method !== 'delete', `V1 禁止 DELETE：${path}`);
  const source = JSON.stringify(api);
  for (const forbidden of ['/deploy', '/public', '/navigation', '/settings']) assert(!source.toLowerCase().includes(forbidden), `V1 禁止 API surface：${forbidden}`);
}

function assertMutationResistance() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'sql-cms-contract-'));
  try {
    cpSync(root, tempRoot, { recursive: true });
    const mutationCases = [
      ['required header', join(tempRoot, 'openapi.json'), (value) => value.replace('"If-Match"', '"If-Modified"')],
      ['foreign key', join(tempRoot, 'migrations/0001_initial.sql'), (value) => value.replace('post_type_id TEXT NOT NULL REFERENCES post_types(id)', 'post_type_id TEXT NOT NULL')],
      ['membership trigger', join(tempRoot, 'migrations/0001_initial.sql'), (value) => value.replace(/CREATE TRIGGER field_definition_versions_membership_insert[\s\S]*?END;\n/, '')],
      ['typed index', join(tempRoot, 'migrations/0001_initial.sql'), (value) => value.replace(/CREATE INDEX entry_field_values_integer_idx[^\n]*\n/, '')]
    ];
    for (const [label, file, mutate] of mutationCases) {
      const original = readFileSync(file, 'utf8');
      writeFileSync(file, mutate(original));
      const result = spawnSync(process.execPath, [join(tempRoot, basename(import.meta.url)), '--root', tempRoot, '--no-mutation-tests'], { encoding: 'utf8' });
      assert(result.status !== 0, `mutation test 應失敗：${label}`);
      writeFileSync(file, original);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const migrationFiles = migrations();
  const db = openDatabase(migrationFiles);
  const renderedSnapshot = assertSchema(db, migrationFiles);
  assertLedger(db, migrationFiles);
  if (writeSnapshot) {
    writeFileSync(schemaPath, renderedSnapshot);
    console.log(`generated ${schemaPath}`);
  } else {
    assert(existsSync(schemaPath), '缺少 generated schema.sql；請使用 --write-snapshot 生成');
    assert(readFileSync(schemaPath, 'utf8') === renderedSnapshot, 'schema.sql 與 migration result 不等價或遭手改');
  }
  assertFixtures(db);
  assertApi();
  db.close();
  if (!noMutationTests && !writeSnapshot) assertMutationResistance();
  console.log('PASS: migration/schema, SQLite constraints, OpenAPI matrix, and mutation resistance');
} catch (error) {
  console.error(`CONTRACT_ERROR: ${error.message}`);
  process.exit(1);
}
