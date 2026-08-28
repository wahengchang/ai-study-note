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
const writeOpenApi = args.includes('--write-openapi');
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
  for (const trigger of [
    'field_definition_versions_membership_insert','entry_field_values_membership_insert','revision_terms_membership_insert',
    'route_claims_validate_insert','route_claims_validate_update','route_claims_require_source_insert','route_claims_require_source_update','route_claims_pointer_alignment_insert','route_claims_pointer_alignment_update',
    'immutable_entry_revisions_update','immutable_entry_revisions_delete','immutable_term_revisions_update','immutable_field_definition_versions_update',
    'post_types_resource_version_update','taxonomies_resource_version_update','terms_resource_version_update','entries_resource_version_update','media_assets_resource_version_update',
    'post_types_pointer_owner_update','taxonomies_pointer_owner_update','terms_pointer_owner_update','entries_pointer_owner_update',
    'terms_identity_owner_update','entries_identity_owner_update',
    'immutable_taxonomy_version_post_types_update','immutable_taxonomy_version_post_types_delete',
    'operation_log_validate_insert','immutable_operation_log_update','immutable_operation_log_delete',
    'idempotency_completed_validate_insert','idempotency_completed_validate_update','immutable_completed_idempotency_update','immutable_completed_idempotency_delete',
    'media_assets_no_hard_delete','media_objects_delete_guard'
  ]) assert(triggers.has(trigger), `缺少 contract trigger：${trigger}`);
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
  for (const table of ['post_types', 'taxonomies', 'terms', 'entries', 'media_assets']) {
    expectFailure(db, `UPDATE ${table} SET updated_at = '2026-08-25T02:00:00Z' WHERE id = '${table === 'post_types' ? 'pt-page' : table === 'taxonomies' ? 'tax-topic' : table === 'terms' ? 'term-ai' : table === 'entries' ? 'entry-one' : 'asset-one'}';`, `${table} resource version unchanged`);
    expectFailure(db, `UPDATE ${table} SET resource_version = resource_version + 2 WHERE id = '${table === 'post_types' ? 'pt-page' : table === 'taxonomies' ? 'tax-topic' : table === 'terms' ? 'term-ai' : table === 'entries' ? 'entry-one' : 'asset-one'}';`, `${table} resource version skips`);
  }
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-route-kind', 'entry', 'entry-one', '/bad-kind/', 'tr-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, canonical_path, reserved_key, current_source_id, created_at, updated_at) VALUES ('bad-reserved', 'reserved', '/bad-reserved/', 'reserved', 'er-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'reserved route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-route-owner', 'entry', 'entry-one', '/bad-owner/', 'other-entry-revision', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'cross-owner route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-post-type-source', 'post_type_archive', 'pt-page', '/pages/', 'tax-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'post type wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-taxonomy-source', 'taxonomy_archive', 'tax-topic', '/topics/', 'pts-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'taxonomy wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, created_at, updated_at) VALUES ('bad-term-source', 'term_archive', 'term-ai', '/topics/ai/', 'pts-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'term wrong-kind route source');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, created_at, updated_at) VALUES ('bad-no-source', 'entry', 'entry-one', '/no-source/', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'nonreserved route without source');
  expectFailure(db, "UPDATE route_claims SET current_source_id = NULL, published_source_id = NULL WHERE id = 'route-entry-one';", 'nonreserved route loses all sources');
  db.exec("INSERT INTO post_type_schema_versions (id, post_type_id, version_number, route_base, has_archive, hierarchical, created_at) VALUES ('pts-v2', 'pt-page', 2, '', 0, 1, '2026-08-25T00:00:00Z'); INSERT INTO field_definition_versions (id, field_definition_id, post_type_id, post_type_schema_version_id, label, field_type, cardinality, required, public_visible, filterable, sortable, created_at) VALUES ('fdv-v2', 'fd-title', 'pt-page', 'pts-v2', 'Rating', 'integer', 'single', 0, 1, 1, 1, '2026-08-25T00:00:00Z');");
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-cross-schema', 'er-v1', 'fdv-v2', 0, 'integer', 1, '2026-08-25T00:00:00Z');", 'cross-schema field version');
  db.exec("INSERT INTO entry_revisions (id, entry_id, post_type_schema_version_id, revision_number, title, slug, body_source, body_format, body_schema_version, created_at) VALUES ('er-v2', 'entry-one', 'pts-v1', 2, 'Two', 'two', '', 'gfm', 1, '2026-08-25T00:00:00Z');");
  expectFailure(db, "UPDATE route_claims SET current_source_id = 'er-v2' WHERE id = 'route-entry-one';", 'route current source must equal owner pointer');
  db.exec("INSERT INTO post_types (id, key, resource_version, created_at, updated_at) VALUES ('pt-other', 'other', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO post_type_schema_versions (id, post_type_id, version_number, route_base, has_archive, hierarchical, created_at) VALUES ('pts-other-v1', 'pt-other', 1, 'other', 0, 0, '2026-08-25T00:00:00Z'); INSERT INTO field_definitions (id, post_type_id, key, created_at) VALUES ('fd-other', 'pt-other', 'other-rating', '2026-08-25T00:00:00Z'); INSERT INTO field_definition_versions (id, field_definition_id, post_type_id, post_type_schema_version_id, label, field_type, cardinality, required, public_visible, filterable, sortable, created_at) VALUES ('fdv-other-v1', 'fd-other', 'pt-other', 'pts-other-v1', 'Other rating', 'integer', 'single', 0, 1, 1, 1, '2026-08-25T00:00:00Z'); INSERT INTO entries (id, post_type_id, resource_version, created_at, updated_at) VALUES ('entry-other', 'pt-other', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO entry_revisions (id, entry_id, post_type_schema_version_id, revision_number, title, slug, body_source, body_format, body_schema_version, created_at) VALUES ('er-other', 'entry-other', 'pts-other-v1', 1, 'Other', 'other', '', 'gfm', 1, '2026-08-25T00:00:00Z'); INSERT INTO taxonomies (id, key, resource_version, created_at, updated_at) VALUES ('tax-other', 'other-tax', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO taxonomy_versions (id, taxonomy_id, version_number, hierarchical, route_base, has_term_archive, created_at) VALUES ('tax-other-v1', 'tax-other', 1, 0, 'other-tax', 0, '2026-08-25T00:00:00Z');");
  db.exec("INSERT INTO terms (id, taxonomy_id, resource_version, created_at, updated_at) VALUES ('term-other', 'tax-topic', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO term_revisions (id, term_id, taxonomy_version_id, revision_number, name, slug, created_at) VALUES ('tr-other', 'term-other', 'tax-v1', 1, 'Other', 'other', '2026-08-25T00:00:00Z');");
  expectFailure(db, "UPDATE post_types SET current_schema_version_id = 'pts-other-v1', resource_version = resource_version + 1 WHERE id = 'pt-page';", 'post type cross-owner pointer');
  expectFailure(db, "UPDATE taxonomies SET published_version_id = 'tax-other-v1', resource_version = resource_version + 1 WHERE id = 'tax-topic';", 'taxonomy cross-owner pointer');
  expectFailure(db, "UPDATE terms SET current_revision_id = 'tr-other', resource_version = resource_version + 1 WHERE id = 'term-ai';", 'term cross-owner pointer');
  expectFailure(db, "UPDATE entries SET published_revision_id = 'er-other', resource_version = resource_version + 1 WHERE id = 'entry-one';", 'entry cross-owner pointer');
  expectFailure(db, "UPDATE terms SET taxonomy_id = 'tax-other', resource_version = resource_version + 1 WHERE id = 'term-ai';", 'term identity FK redirect');
  expectFailure(db, "UPDATE entries SET post_type_id = 'pt-other', resource_version = resource_version + 1 WHERE id = 'entry-one';", 'entry identity FK redirect');
  expectFailure(db, "UPDATE taxonomy_version_post_types SET post_type_id = 'pt-other' WHERE taxonomy_version_id = 'tax-v1' AND post_type_id = 'pt-page';", 'taxonomy version relationship update');
  expectFailure(db, "DELETE FROM taxonomy_version_post_types WHERE taxonomy_version_id = 'tax-v1' AND post_type_id = 'pt-page';", 'taxonomy version relationship delete');
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-cross-post-type', 'er-v1', 'fdv-other-v1', 0, 'integer', 1, '2026-08-25T00:00:00Z');", 'cross-Post-Type field version');
  expectFailure(db, "INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at) VALUES ('bad-single-ordinal', 'er-v1', 'fdv-v1', 1, 'integer', 1, '2026-08-25T00:00:00Z');", 'single second ordinal');
  expectFailure(db, "INSERT INTO route_claims (id, owner_kind, canonical_path, reserved_key, created_at, updated_at) VALUES ('duplicate-route', 'reserved', '/one/', 'duplicate', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'duplicate route');
  expectFailure(db, "UPDATE entry_revisions SET title = 'mutated' WHERE id = 'er-v1';", 'revision update');
  expectFailure(db, "DELETE FROM entry_revisions WHERE id = 'er-v1';", 'revision delete');
  expectFailure(db, "INSERT INTO revision_terms (entry_revision_id, term_id, term_revision_id, created_at) VALUES ('er-v1', 'term-ai', 'tr-other', '2026-08-25T00:00:00Z');", 'term revision mismatch');
  db.exec("UPDATE media_assets SET archived_at = '2026-08-25T01:00:00Z', resource_version = resource_version + 1 WHERE id = 'asset-one';");
  assert(db.prepare("SELECT count(*) AS count FROM media_objects WHERE id = 'obj-one'").get().count === 1, 'historical media archive 不可刪 object');
  expectFailure(db, "DELETE FROM media_assets WHERE id = 'asset-one';", 'media asset hard delete');
  db.exec("INSERT INTO media_objects (id, sha256, storage_key, mime_type, byte_size, state, final_path, resource_version, created_at, updated_at) VALUES ('obj-unowned-ready', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'media/unowned-ready', 'image/jpeg', 1, 'ready', 'media/unowned-ready', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');");
  expectFailure(db, "DELETE FROM media_objects WHERE id = 'obj-unowned-ready';", 'ready media object delete');
  db.exec("UPDATE media_objects SET state = 'deleting' WHERE id = 'obj-one';");
  expectFailure(db, "DELETE FROM media_objects WHERE id = 'obj-one';", 'referenced media object delete');
  db.exec("INSERT INTO media_objects (id, sha256, storage_key, mime_type, byte_size, state, final_path, resource_version, created_at, updated_at) VALUES ('obj-unowned-error', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'media/unowned-error', 'image/jpeg', 1, 'error', 'media/unowned-error', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); DELETE FROM media_objects WHERE id = 'obj-unowned-error';");
  expectFailure(db, "INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, expires_at, created_at, updated_at) VALUES ('idem-duplicate', 'entries.create', 'key-one', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'pending', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'idempotency unique');
  expectFailure(db, "INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, response_status, response_headers_json, response_body_json, outcome_kind, outcome_id, operation_log_id, expires_at, created_at, updated_at) VALUES ('idem-direct-completed', 'entries.create', 'direct', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'completed', 201, '{}', '{}', 'entry', 'entry-one', 'missing', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');", 'direct completed idempotency');
  expectFailure(db, "UPDATE idempotency_keys SET response_status = 200 WHERE id = 'idem-one';", 'completed idempotency update');
  expectFailure(db, "DELETE FROM idempotency_keys WHERE id = 'idem-one';", 'completed idempotency delete');
  expectFailure(db, "UPDATE operation_log SET outcome_id = 'entry-other' WHERE id = 'op-one';", 'operation log update');
  expectFailure(db, "DELETE FROM operation_log WHERE id = 'op-one';", 'operation log delete');
  db.exec("INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, expires_at, created_at, updated_at) VALUES ('idem-negative', 'entries.create', 'negative', '9999999999999999999999999999999999999999999999999999999999999999', 'pending', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z'); INSERT INTO operation_log (id, idempotency_key_id, operation_scope, outcome_kind, outcome_id, created_at) VALUES ('op-negative', 'idem-negative', 'entries.create', 'entry', 'entry-one', '2026-08-25T00:00:00Z');");
  db.exec("INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, expires_at, created_at, updated_at) VALUES ('idem-wrong-scope', 'entries.create', 'wrong-scope', '8888888888888888888888888888888888888888888888888888888888888888', 'pending', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');");
  expectFailure(db, "INSERT INTO operation_log (id, idempotency_key_id, operation_scope, outcome_kind, outcome_id, created_at) VALUES ('op-wrong-scope', 'idem-wrong-scope', 'entries.update', 'entry', 'entry-one', '2026-08-25T00:00:00Z');", 'operation log scope mismatch');
  const completionBase = "state = 'completed', response_status = 201, response_headers_json = '{}', response_body_json = '{}', outcome_kind = 'entry', outcome_id = 'entry-one', operation_log_id = 'op-negative'";
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace('response_status = 201', 'response_status = NULL')} WHERE id = 'idem-negative';`, 'completed response status missing');
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace("response_headers_json = '{}'", 'response_headers_json = NULL')} WHERE id = 'idem-negative';`, 'completed response headers missing');
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace("response_body_json = '{}'", 'response_body_json = NULL')} WHERE id = 'idem-negative';`, 'completed response body missing');
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace("outcome_kind = 'entry'", 'outcome_kind = NULL')} WHERE id = 'idem-negative';`, 'completed outcome missing');
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace("operation_log_id = 'op-negative'", 'operation_log_id = NULL')} WHERE id = 'idem-negative';`, 'completed operation log missing');
  expectFailure(db, `UPDATE idempotency_keys SET ${completionBase.replace("outcome_id = 'entry-one'", "outcome_id = 'entry-other'")} WHERE id = 'idem-negative';`, 'completed operation outcome mismatch');
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

const apiRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const closedSchema = (required, properties, extra = {}) => ({ type: 'object', required, properties, additionalProperties: false, ...extra });

function buildOpenApi() {
  const id = { type: 'string', minLength: 1 };
  const timestamp = { type: 'string', format: 'date-time' };
  const nullableId = { type: ['string', 'null'], minLength: 1 };
  const nullableTimestamp = { type: ['string', 'null'], format: 'date-time' };
  const lifecycle = {
    definition: { type: 'string', enum: ['draft', 'published', 'modified', 'archived'] },
    content: { type: 'string', enum: ['draft', 'published', 'modified', 'unpublished', 'archived'] },
    media: { type: 'string', enum: ['ready', 'archived'] },
    immutable: { type: 'string', enum: ['current', 'published', 'historical'] }
  };
  const immutableLifecycleStates = { type: 'array', minItems: 1, uniqueItems: true, items: lifecycle.immutable };
  const aggregate = (identityProperties, stateSchema) => closedSchema(
    [...Object.keys(identityProperties), 'resourceVersion', 'lifecycleState', 'archivedAt', 'createdAt', 'updatedAt'],
    { ...identityProperties, resourceVersion: { type: 'integer', minimum: 1 }, lifecycleState: stateSchema, archivedAt: nullableTimestamp, createdAt: timestamp, updatedAt: timestamp }
  );
  const page = (itemName) => closedSchema(['items', 'nextCursor'], {
    items: { type: 'array', items: apiRef(itemName) },
    nextCursor: { type: ['string', 'null'], minLength: 1 }
  });
  const mutationResult = (resourceName, outcomes, extraRequired = [], extraProperties = {}) => closedSchema(
    ['resource', 'outcome', ...extraRequired],
    { resource: apiRef(resourceName), outcome: { type: 'string', enum: outcomes }, ...extraProperties }
  );
  const emptyRequest = () => closedSchema([], {});
  const revisionInputProperties = {
    postTypeSchemaVersionId: id,
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    excerpt: { type: 'string' },
    slug: { type: 'string', minLength: 1 },
    bodySource: { type: 'string' },
    bodyFormat: { type: 'string', enum: ['gfm'] },
    bodySchemaVersion: { type: 'integer', enum: [1] },
    parentEntryRevisionId: nullableId,
    coverMediaAssetId: nullableId,
    fieldValues: { type: 'array', items: apiRef('EntryFieldValueInput') },
    terms: { type: 'array', items: apiRef('EntryTermReferenceInput') }
  };
  const revisionInputRequired = Object.keys(revisionInputProperties);

  const schemas = {
    FieldDefinitionInput: closedSchema(
      ['key', 'label', 'help', 'fieldType', 'cardinality', 'required', 'options', 'editorGroup', 'editorOrder', 'publicVisible', 'filterable', 'sortable'],
      {
        key: id, label: { type: 'string', minLength: 1 }, help: { type: 'string' },
        fieldType: { type: 'string', enum: ['text', 'textarea', 'gfm', 'integer', 'number', 'boolean', 'date', 'datetime', 'url', 'select', 'multiselect', 'media', 'relation'] },
        cardinality: { type: 'string', enum: ['single', 'many'] }, required: { type: 'boolean' },
        options: { type: ['array', 'null'], items: { type: 'string' } }, editorGroup: { type: 'string' }, editorOrder: { type: 'integer' },
        publicVisible: { type: 'boolean' }, filterable: { type: 'boolean' }, sortable: { type: 'boolean' }
      }
    ),
    FieldDefinitionVersion: closedSchema(
      ['id', 'key', 'label', 'help', 'fieldType', 'cardinality', 'required', 'options', 'editorGroup', 'editorOrder', 'publicVisible', 'filterable', 'sortable'],
      {
        id, key: id, label: { type: 'string' }, help: { type: 'string' },
        fieldType: { type: 'string', enum: ['text', 'textarea', 'gfm', 'integer', 'number', 'boolean', 'date', 'datetime', 'url', 'select', 'multiselect', 'media', 'relation'] },
        cardinality: { type: 'string', enum: ['single', 'many'] }, required: { type: 'boolean' },
        options: { type: ['array', 'null'], items: { type: 'string' } }, editorGroup: { type: 'string' }, editorOrder: { type: 'integer' },
        publicVisible: { type: 'boolean' }, filterable: { type: 'boolean' }, sortable: { type: 'boolean' }
      }
    ),
    PostTypeCreateRequest: closedSchema(['key'], { key: id }),
    PostTypeSchemaVersionCreateRequest: closedSchema(['routeBase', 'hasArchive', 'hierarchical', 'fields'], {
      routeBase: { type: 'string' }, hasArchive: { type: 'boolean' }, hierarchical: { type: 'boolean' }, fields: { type: 'array', items: apiRef('FieldDefinitionInput') }
    }),
    PostTypePublishRequest: closedSchema(['schemaVersionId'], { schemaVersionId: id }),
    PostTypeArchiveRequest: emptyRequest(),
    PostTypeUnarchiveRequest: emptyRequest(),
    PostTypeAggregate: aggregate({ id, key: id, currentSchemaVersionId: nullableId, publishedSchemaVersionId: nullableId }, lifecycle.definition),
    PostTypeSchemaVersion: closedSchema(['id', 'postTypeId', 'versionNumber', 'routeBase', 'hasArchive', 'hierarchical', 'fields', 'lifecycleStates', 'createdAt'], {
      id, postTypeId: id, versionNumber: { type: 'integer', minimum: 1 }, routeBase: { type: 'string' }, hasArchive: { type: 'boolean' }, hierarchical: { type: 'boolean' },
      fields: { type: 'array', items: apiRef('FieldDefinitionVersion') }, lifecycleStates: immutableLifecycleStates, createdAt: timestamp
    }),
    PostTypePage: page('PostTypeAggregate'),
    PostTypeMutationResult: mutationResult('PostTypeAggregate', ['created', 'published', 'archived', 'unarchived']),
    PostTypeSchemaVersionResult: mutationResult('PostTypeAggregate', ['schema-version-created'], ['version'], { version: apiRef('PostTypeSchemaVersion') }),

    TaxonomyCreateRequest: closedSchema(['key'], { key: id }),
    TaxonomyVersionCreateRequest: closedSchema(['hierarchical', 'routeBase', 'hasTermArchive', 'postTypeIds'], {
      hierarchical: { type: 'boolean' }, routeBase: { type: 'string' }, hasTermArchive: { type: 'boolean' }, postTypeIds: { type: 'array', items: id, uniqueItems: true }
    }),
    TaxonomyPublishRequest: closedSchema(['versionId'], { versionId: id }),
    TaxonomyArchiveRequest: emptyRequest(),
    TaxonomyUnarchiveRequest: emptyRequest(),
    TaxonomyAggregate: aggregate({ id, key: id, currentVersionId: nullableId, publishedVersionId: nullableId }, lifecycle.definition),
    TaxonomyVersion: closedSchema(['id', 'taxonomyId', 'versionNumber', 'hierarchical', 'routeBase', 'hasTermArchive', 'postTypeIds', 'lifecycleStates', 'createdAt'], {
      id, taxonomyId: id, versionNumber: { type: 'integer', minimum: 1 }, hierarchical: { type: 'boolean' }, routeBase: { type: 'string' }, hasTermArchive: { type: 'boolean' },
      postTypeIds: { type: 'array', items: id, uniqueItems: true }, lifecycleStates: immutableLifecycleStates, createdAt: timestamp
    }),
    TaxonomyPage: page('TaxonomyAggregate'),
    TaxonomyMutationResult: mutationResult('TaxonomyAggregate', ['created', 'published', 'archived', 'unarchived']),
    TaxonomyVersionResult: mutationResult('TaxonomyAggregate', ['version-created'], ['version'], { version: apiRef('TaxonomyVersion') }),

    TermRevisionInput: closedSchema(['taxonomyVersionId', 'name', 'slug', 'description', 'parentTermRevisionId'], {
      taxonomyVersionId: id, name: { type: 'string', minLength: 1 }, slug: { type: 'string', minLength: 1 }, description: { type: 'string' }, parentTermRevisionId: nullableId
    }),
    TermCreateRequest: closedSchema(['revision'], { revision: apiRef('TermRevisionInput') }),
    TermRevisionCreateRequest: closedSchema(['revision'], { revision: apiRef('TermRevisionInput') }),
    TermPublishRequest: closedSchema(['revisionId'], { revisionId: id }),
    TermArchiveRequest: emptyRequest(),
    TermUnarchiveRequest: emptyRequest(),
    TermAggregate: aggregate({ id, taxonomyId: id, currentRevisionId: nullableId, publishedRevisionId: nullableId, firstPublishedAt: nullableTimestamp }, lifecycle.content),
    TermRevision: closedSchema(['id', 'termId', 'taxonomyVersionId', 'revisionNumber', 'name', 'slug', 'description', 'parentTermRevisionId', 'lifecycleStates', 'createdAt'], {
      id, termId: id, taxonomyVersionId: id, revisionNumber: { type: 'integer', minimum: 1 }, name: { type: 'string' }, slug: { type: 'string' }, description: { type: 'string' },
      parentTermRevisionId: nullableId, lifecycleStates: immutableLifecycleStates, createdAt: timestamp
    }),
    TermPage: page('TermAggregate'),
    TermMutationResult: mutationResult('TermAggregate', ['created', 'published', 'archived', 'unarchived']),
    TermRevisionResult: mutationResult('TermAggregate', ['revision-created'], ['revision'], { revision: apiRef('TermRevision') }),

    EntryFieldValueInput: closedSchema(['fieldDefinitionVersionId', 'ordinal', 'kind', 'textValue', 'integerValue', 'numberValue', 'booleanValue', 'dateValue', 'datetimeValue', 'mediaAssetId', 'relationEntryId'], {
      fieldDefinitionVersionId: id, ordinal: { type: 'integer', minimum: 0 }, kind: { type: 'string', enum: ['text', 'integer', 'number', 'boolean', 'date', 'datetime', 'media', 'relation'] },
      textValue: { type: ['string', 'null'] }, integerValue: { type: ['integer', 'null'] }, numberValue: { type: ['number', 'null'] }, booleanValue: { type: ['boolean', 'null'] },
      dateValue: { type: ['string', 'null'], format: 'date' }, datetimeValue: { type: ['string', 'null'], format: 'date-time' }, mediaAssetId: nullableId, relationEntryId: nullableId
    }),
    EntryFieldValue: closedSchema(['fieldDefinitionVersionId', 'ordinal', 'kind', 'textValue', 'integerValue', 'numberValue', 'booleanValue', 'dateValue', 'datetimeValue', 'mediaAssetId', 'relationEntryId'], {
      fieldDefinitionVersionId: id, ordinal: { type: 'integer', minimum: 0 }, kind: { type: 'string', enum: ['text', 'integer', 'number', 'boolean', 'date', 'datetime', 'media', 'relation'] },
      textValue: { type: ['string', 'null'] }, integerValue: { type: ['integer', 'null'] }, numberValue: { type: ['number', 'null'] }, booleanValue: { type: ['boolean', 'null'] },
      dateValue: { type: ['string', 'null'], format: 'date' }, datetimeValue: { type: ['string', 'null'], format: 'date-time' }, mediaAssetId: nullableId, relationEntryId: nullableId
    }),
    EntryTermReferenceInput: closedSchema(['termId', 'termRevisionId'], { termId: id, termRevisionId: id }),
    EntryTermReference: closedSchema(['termId', 'termRevisionId'], { termId: id, termRevisionId: id }),
    EntryRevisionInput: closedSchema(revisionInputRequired, revisionInputProperties),
    EntryCreateRequest: closedSchema(['postTypeId', 'revision'], { postTypeId: id, revision: apiRef('EntryRevisionInput') }),
    EntryRevisionCreateRequest: closedSchema(['revision'], { revision: apiRef('EntryRevisionInput') }),
    EntryPreviewRequest: closedSchema(['revisionId'], { revisionId: nullableId }),
    EntryPublishRequest: closedSchema(['revisionId'], { revisionId: id }),
    EntryUnpublishRequest: emptyRequest(),
    EntryArchiveRequest: emptyRequest(),
    EntryUnarchiveRequest: emptyRequest(),
    EntryAggregate: aggregate({ id, postTypeId: id, currentRevisionId: nullableId, publishedRevisionId: nullableId, firstPublishedAt: nullableTimestamp }, lifecycle.content),
    EntryRevision: closedSchema(['id', 'entryId', ...revisionInputRequired, 'revisionNumber', 'fieldValues', 'terms', 'lifecycleStates', 'createdAt'], {
      id, entryId: id, ...revisionInputProperties, revisionNumber: { type: 'integer', minimum: 1 }, fieldValues: { type: 'array', items: apiRef('EntryFieldValue') },
      terms: { type: 'array', items: apiRef('EntryTermReference') }, lifecycleStates: immutableLifecycleStates, createdAt: timestamp
    }),
    EntryPage: page('EntryAggregate'),
    EntryMutationResult: mutationResult('EntryAggregate', ['created', 'published', 'unpublished', 'archived', 'unarchived']),
    EntryRevisionResult: mutationResult('EntryAggregate', ['revision-created'], ['revision'], { revision: apiRef('EntryRevision') }),
    EntryPreviewResult: closedSchema(['entryId', 'revisionId', 'renderedHtml', 'lifecycleState'], {
      entryId: id, revisionId: id, renderedHtml: { type: 'string' }, lifecycleState: lifecycle.content
    }),

    MediaCreateRequest: closedSchema(['file', 'title', 'description', 'alt', 'caption'], {
      file: { type: 'string', format: 'binary' }, title: { type: 'string' }, description: { type: 'string' }, alt: { type: 'string' }, caption: { type: 'string' }
    }),
    MediaUpdateRequest: closedSchema([], {
      title: { type: 'string' }, description: { type: 'string' }, alt: { type: 'string' }, caption: { type: 'string' }
    }, { minProperties: 1 }),
    MediaArchiveRequest: emptyRequest(),
    MediaUnarchiveRequest: emptyRequest(),
    MediaAggregate: aggregate({
      id, title: { type: 'string' }, description: { type: 'string' }, alt: { type: 'string' }, caption: { type: 'string' }, originalFilename: { type: 'string' },
      sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, mimeType: { type: 'string' }, byteSize: { type: 'integer', minimum: 1, maximum: 26214400 },
      width: { type: ['integer', 'null'], minimum: 1 }, height: { type: ['integer', 'null'], minimum: 1 }
    }, lifecycle.media),
    MediaPage: page('MediaAggregate'),
    MediaMutationResult: mutationResult('MediaAggregate', ['created', 'updated', 'archived', 'unarchived']),

    ErrorDetails: closedSchema([], {
      field: { type: ['string', 'null'] }, reason: { type: ['string', 'null'] }, resourceType: { type: ['string', 'null'] }, resourceId: { type: ['string', 'null'] }, retryable: { type: ['boolean', 'null'] }
    }),
    ListValidationDetails: closedSchema(['reason'], { reason: { type: 'string', enum: ['INVALID_CURSOR', 'INVALID_INCLUDE_ARCHIVED'] } })
  };

  const definitions = [
    ['GET', '/post-types', 'listPostTypes', 'PostTypeApplicationService.listPostTypes', 'PostTypePage', null, null, false, false, []],
    ['POST', '/post-types', 'createPostType', 'PostTypeApplicationService.createPostType', 'PostTypeMutationResult', 'PostTypeCreateRequest', 'post-types.create', false, false, []],
    ['GET', '/post-types/{id}', 'getPostType', 'PostTypeApplicationService.getPostType', 'PostTypeAggregate', null, null, false, true, []],
    ['POST', '/post-types/{id}/schema-versions', 'createPostTypeSchemaVersion', 'PostTypeApplicationService.createSchemaVersion', 'PostTypeSchemaVersionResult', 'PostTypeSchemaVersionCreateRequest', 'post-types.create-schema-version', true, true, ['REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['GET', '/post-types/{id}/schema-versions/{versionId}', 'getPostTypeSchemaVersion', 'PostTypeApplicationService.getSchemaVersion', 'PostTypeSchemaVersion', null, null, false, true, []],
    ['POST', '/post-types/{id}/publish', 'publishPostType', 'PostTypeApplicationService.publishPostType', 'PostTypeMutationResult', 'PostTypePublishRequest', 'post-types.publish', true, true, ['ROUTE_CONFLICT', 'REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['POST', '/post-types/{id}/archive', 'archivePostType', 'PostTypeApplicationService.archivePostType', 'PostTypeMutationResult', 'PostTypeArchiveRequest', 'post-types.archive', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/post-types/{id}/unarchive', 'unarchivePostType', 'PostTypeApplicationService.unarchivePostType', 'PostTypeMutationResult', 'PostTypeUnarchiveRequest', 'post-types.unarchive', true, true, ['ROUTE_CONFLICT']],

    ['GET', '/taxonomies', 'listTaxonomies', 'TaxonomyApplicationService.listTaxonomies', 'TaxonomyPage', null, null, false, false, []],
    ['POST', '/taxonomies', 'createTaxonomy', 'TaxonomyApplicationService.createTaxonomy', 'TaxonomyMutationResult', 'TaxonomyCreateRequest', 'taxonomies.create', false, false, []],
    ['GET', '/taxonomies/{id}', 'getTaxonomy', 'TaxonomyApplicationService.getTaxonomy', 'TaxonomyAggregate', null, null, false, true, []],
    ['POST', '/taxonomies/{id}/versions', 'createTaxonomyVersion', 'TaxonomyApplicationService.createVersion', 'TaxonomyVersionResult', 'TaxonomyVersionCreateRequest', 'taxonomies.create-version', true, true, ['REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['GET', '/taxonomies/{id}/versions/{versionId}', 'getTaxonomyVersion', 'TaxonomyApplicationService.getVersion', 'TaxonomyVersion', null, null, false, true, []],
    ['POST', '/taxonomies/{id}/publish', 'publishTaxonomy', 'TaxonomyApplicationService.publishTaxonomy', 'TaxonomyMutationResult', 'TaxonomyPublishRequest', 'taxonomies.publish', true, true, ['ROUTE_CONFLICT', 'REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['POST', '/taxonomies/{id}/archive', 'archiveTaxonomy', 'TaxonomyApplicationService.archiveTaxonomy', 'TaxonomyMutationResult', 'TaxonomyArchiveRequest', 'taxonomies.archive', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/taxonomies/{id}/unarchive', 'unarchiveTaxonomy', 'TaxonomyApplicationService.unarchiveTaxonomy', 'TaxonomyMutationResult', 'TaxonomyUnarchiveRequest', 'taxonomies.unarchive', true, true, ['ROUTE_CONFLICT']],

    ['GET', '/taxonomies/{id}/terms', 'listTerms', 'TermApplicationService.listTerms', 'TermPage', null, null, false, true, []],
    ['POST', '/taxonomies/{id}/terms', 'createTerm', 'TermApplicationService.createTerm', 'TermMutationResult', 'TermCreateRequest', 'terms.create', false, true, ['REFERENCE_CONFLICT']],
    ['GET', '/taxonomies/{id}/terms/{termId}', 'getTerm', 'TermApplicationService.getTerm', 'TermAggregate', null, null, false, true, []],
    ['POST', '/taxonomies/{id}/terms/{termId}/revisions', 'createTermRevision', 'TermApplicationService.createRevision', 'TermRevisionResult', 'TermRevisionCreateRequest', 'terms.create-revision', true, true, ['REFERENCE_CONFLICT']],
    ['GET', '/taxonomies/{id}/terms/{termId}/revisions/{revisionId}', 'getTermRevision', 'TermApplicationService.getRevision', 'TermRevision', null, null, false, true, []],
    ['POST', '/taxonomies/{id}/terms/{termId}/publish', 'publishTermRevision', 'TermApplicationService.publishRevision', 'TermMutationResult', 'TermPublishRequest', 'terms.publish-revision', true, true, ['ROUTE_CONFLICT', 'REFERENCE_CONFLICT']],
    ['POST', '/taxonomies/{id}/terms/{termId}/archive', 'archiveTerm', 'TermApplicationService.archiveTerm', 'TermMutationResult', 'TermArchiveRequest', 'terms.archive', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/taxonomies/{id}/terms/{termId}/unarchive', 'unarchiveTerm', 'TermApplicationService.unarchiveTerm', 'TermMutationResult', 'TermUnarchiveRequest', 'terms.unarchive', true, true, ['ROUTE_CONFLICT']],

    ['GET', '/entries', 'listEntries', 'EntryApplicationService.listEntries', 'EntryPage', null, null, false, false, []],
    ['POST', '/entries', 'createEntry', 'EntryApplicationService.createEntry', 'EntryMutationResult', 'EntryCreateRequest', 'entries.create', false, true, ['REFERENCE_CONFLICT']],
    ['GET', '/entries/{id}', 'getEntry', 'EntryApplicationService.getEntry', 'EntryAggregate', null, null, false, true, []],
    ['POST', '/entries/{id}/revisions', 'createEntryRevision', 'EntryApplicationService.createRevision', 'EntryRevisionResult', 'EntryRevisionCreateRequest', 'entries.create-revision', true, true, ['REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['GET', '/entries/{id}/revisions/{revisionId}', 'getEntryRevision', 'EntryApplicationService.getRevision', 'EntryRevision', null, null, false, true, []],
    ['POST', '/entries/{id}/preview', 'previewEntry', 'EntryApplicationService.previewEntry', 'EntryPreviewResult', 'EntryPreviewRequest', 'entries.preview', false, true, ['REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['POST', '/entries/{id}/publish', 'publishEntry', 'EntryApplicationService.publishEntry', 'EntryMutationResult', 'EntryPublishRequest', 'entries.publish', true, true, ['ROUTE_CONFLICT', 'REFERENCE_CONFLICT', 'SCHEMA_MIGRATION_REQUIRED']],
    ['POST', '/entries/{id}/unpublish', 'unpublishEntry', 'EntryApplicationService.unpublishEntry', 'EntryMutationResult', 'EntryUnpublishRequest', 'entries.unpublish', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/entries/{id}/archive', 'archiveEntry', 'EntryApplicationService.archiveEntry', 'EntryMutationResult', 'EntryArchiveRequest', 'entries.archive', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/entries/{id}/unarchive', 'unarchiveEntry', 'EntryApplicationService.unarchiveEntry', 'EntryMutationResult', 'EntryUnarchiveRequest', 'entries.unarchive', true, true, ['ROUTE_CONFLICT']],

    ['GET', '/media', 'listMedia', 'MediaApplicationService.listMedia', 'MediaPage', null, null, false, false, []],
    ['POST', '/media', 'createMedia', 'MediaApplicationService.createMedia', 'MediaMutationResult', 'MediaCreateRequest', 'media.create', false, false, []],
    ['GET', '/media/{id}', 'getMedia', 'MediaApplicationService.getMedia', 'MediaAggregate', null, null, false, true, []],
    ['PATCH', '/media/{id}', 'updateMedia', 'MediaApplicationService.updateMedia', 'MediaMutationResult', 'MediaUpdateRequest', 'media.update', true, true, []],
    ['POST', '/media/{id}/archive', 'archiveMedia', 'MediaApplicationService.archiveMedia', 'MediaMutationResult', 'MediaArchiveRequest', 'media.archive', true, true, ['REFERENCE_CONFLICT']],
    ['POST', '/media/{id}/unarchive', 'unarchiveMedia', 'MediaApplicationService.unarchiveMedia', 'MediaMutationResult', 'MediaUnarchiveRequest', 'media.unarchive', true, true, []]
  ];

  const pathParameterName = { id: 'Id', termId: 'TermId', versionId: 'VersionId', revisionId: 'RevisionId' };
  const errorResponse = (status, codes, detailsSchema = 'ErrorDetails') => ({
    description: `${status} ${codes.join(' | ')}`,
    ...(status === 409 ? { headers: { 'Retry-After': { required: false, description: 'Only present for IDEMPOTENCY_IN_PROGRESS.', schema: { type: 'integer', minimum: 1 } } } } : {}),
    content: { 'application/json': { schema: closedSchema(['code', 'message', 'details'], {
      code: { type: 'string', enum: codes }, message: { type: 'string', minLength: 1 }, details: apiRef(detailsSchema)
    }) } }
  });
  const strongEtag = {
    required: true,
    description: 'Required owner aggregate strong ETag; decimal value equals response resource.resourceVersion (or aggregate resourceVersion for GET).',
    schema: { type: 'string', pattern: '^\"[1-9][0-9]*\"$' },
    'x-etag-kind': 'owner-strong',
    'x-owner-precondition': true
  };
  const immutableEtag = {
    required: true,
    description: 'Immutable representation cache validator; never valid as owner If-Match.',
    schema: { type: 'string', minLength: 3 },
    'x-etag-kind': 'immutable-cache-only',
    'x-owner-precondition': false
  };
  const listIds = new Set(['listPostTypes', 'listTaxonomies', 'listTerms', 'listEntries', 'listMedia']);
  const immutableGetIds = new Set(['getPostTypeSchemaVersion', 'getTaxonomyVersion', 'getTermRevision', 'getEntryRevision']);
  const previewIds = new Set(['previewEntry']);
  const paths = {};
  for (const [method, path, operationId, serviceMethod, responseSchema, requestSchema, scope, ifMatch, notFound, domainConflicts] of definitions) {
    const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ $ref: `#/components/parameters/${pathParameterName[match[1]]}` }));
    if (listIds.has(operationId)) parameters.push({ $ref: '#/components/parameters/Cursor' }, { $ref: '#/components/parameters/IncludeArchived' });
    if (ifMatch) parameters.push({ $ref: '#/components/parameters/IfMatch' });
    if (scope) parameters.push({ $ref: '#/components/parameters/IdempotencyKey' });
    if (immutableGetIds.has(operationId)) parameters.push({ $ref: '#/components/parameters/IfNoneMatch' });

    const successStatus = ['createPostType', 'createPostTypeSchemaVersion', 'createTaxonomy', 'createTaxonomyVersion', 'createTerm', 'createTermRevision', 'createEntry', 'createEntryRevision', 'createMedia'].includes(operationId) ? '201' : '200';
    const isMutation = Boolean(scope) && !previewIds.has(operationId);
    const isAggregateGet = method === 'GET' && !listIds.has(operationId) && !immutableGetIds.has(operationId);
    const successResponse = {
      description: `${operationId} success`,
      ...((isMutation || isAggregateGet) ? { headers: { ETag: strongEtag } } : {}),
      ...(immutableGetIds.has(operationId) ? { headers: { ETag: immutableEtag } } : {}),
      content: { 'application/json': { schema: apiRef(responseSchema) } }
    };
    const responses = {
      [successStatus]: successResponse,
      '400': errorResponse(400, ['VALIDATION']),
      ...(notFound ? { '404': errorResponse(404, ['NOT_FOUND']) } : {}),
      ...(scope ? { '409': errorResponse(409, ['IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT', ...domainConflicts]) } : {}),
      ...(ifMatch ? { '412': errorResponse(412, ['PRECONDITION_FAILED']), '428': errorResponse(428, ['PRECONDITION_REQUIRED']) } : {}),
      '503': errorResponse(503, ['STORAGE_FAILED'])
    };
    if (immutableGetIds.has(operationId)) responses['304'] = { description: 'Immutable representation is unchanged.', headers: { ETag: immutableEtag } };
    if (listIds.has(operationId)) responses['400'] = errorResponse(400, ['VALIDATION'], 'ListValidationDetails');
    const contentType = operationId === 'createMedia' ? 'multipart/form-data' : 'application/json';
    const operation = {
      operationId,
      'x-application-service-method': serviceMethod,
      ...(scope ? { 'x-idempotency-scope': scope } : {}),
      parameters,
      ...(requestSchema ? { requestBody: { required: true, content: { [contentType]: { schema: apiRef(requestSchema) } } } } : {}),
      responses
    };
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: { title: 'AI Study Note local CMS API', version: 'api-contract-2026-08-25-07' },
    servers: [{ url: 'http://127.0.0.1:{port}/api/v1', variables: { port: { default: '8787' } } }],
    'x-boundary': { network: 'loopback-only', canonicalStore: 'local-sql-and-media', publishSideEffects: 'local-pointers-route-claims-operation-log-only', excludedCapabilities: ['public-read-api', 'git', 'build', 'deploy', 'navigation', 'settings'] },
    'x-internal-collaborators': ['RouteMigrationService', 'PublishTermRevisionService', 'IdempotencyCoordinator', 'MediaReconciliationService', 'MediaStorageAdapter'],
    'x-idempotency-contract': {
      uniqueness: ['operation_scope', 'key'], completedRetention: 'immutable', pendingLeaseReclaimOnly: true, completedReplayPrecedesIfMatch: true,
      canonicalHashAlgorithm: 'SHA-256', jsonCanonicalization: 'RFC 8785',
      canonicalHashInputs: ['uppercase-method', 'canonical-expanded-path', 'sorted-decoded-route-parameters', 'sorted-query-multimap', 'content-type-header', 'if-match-header', 'canonical-json-or-multipart-fields', 'media-bytes-sha256-and-length-or-null-marker']
    },
    'x-pagination-contract': {
      style: 'opaque-keyset', offsetForbidden: true, nextCursorRequiredNullable: true, defaultArchivedVisibility: 'excluded', invalidCursorStatus: 400, invalidCursorCode: 'VALIDATION', invalidCursorReason: 'INVALID_CURSOR',
      sort: { listPostTypes: ['createdAt', 'id'], listTaxonomies: ['createdAt', 'id'], listTerms: ['createdAt', 'id'], listEntries: ['createdAt', 'id'], listMedia: ['createdAt', 'id'] }
    },
    paths,
    components: {
      parameters: {
        Id: { name: 'id', in: 'path', required: true, schema: id },
        TermId: { name: 'termId', in: 'path', required: true, schema: id },
        VersionId: { name: 'versionId', in: 'path', required: true, schema: id },
        RevisionId: { name: 'revisionId', in: 'path', required: true, schema: id },
        Cursor: { name: 'cursor', in: 'query', required: false, description: 'Opaque signed keyset cursor; invalid/mismatched/expired cursor is 400 VALIDATION with INVALID_CURSOR reason.', schema: { type: 'string', minLength: 1 } },
        IncludeArchived: { name: 'includeArchived', in: 'query', required: false, description: 'Archived aggregates are excluded by default.', schema: { type: 'boolean', default: false } },
        IfMatch: { name: 'If-Match', in: 'header', required: true, description: 'Owner aggregate strong ETag only.', schema: { type: 'string', pattern: '^\"[1-9][0-9]*\"$' } },
        IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 255 } },
        IfNoneMatch: { name: 'If-None-Match', in: 'header', required: false, description: 'Immutable representation cache validator only.', schema: { type: 'string', minLength: 3 } }
      },
      schemas
    }
  };
}

function assertApi() {
  const api = JSON.parse(readFileSync(openapiPath, 'utf8'));
  const expected = buildOpenApi();
  assert(api.openapi === '3.1.0', 'OpenAPI 必須是 3.1.0');
  assert(readFileSync(join(root, 'api.md'), 'utf8').includes(`候選版：\`${api.info.version}\``), 'api.md 與 OpenAPI candidate version 不一致');
  assert(api.info?.title && api.paths && api.components?.schemas, 'OpenAPI root 不完整');
  walkRefs(api, api);
  assert(api.servers?.length === 1 && api.servers[0].url === 'http://127.0.0.1:{port}/api/v1', 'API server 必須固定 loopback /api/v1 boundary');
  assert(api['x-boundary']?.network === 'loopback-only' && api['x-boundary']?.publishSideEffects === 'local-pointers-route-claims-operation-log-only', 'loopback/publish boundary 不完整');
  assert(api.components.parameters.IfMatch?.name === 'If-Match' && api.components.parameters.IfMatch?.in === 'header' && api.components.parameters.IfMatch?.required === true, 'If-Match header contract 不完整');
  assert(api.components.parameters.IdempotencyKey?.name === 'Idempotency-Key' && api.components.parameters.IdempotencyKey?.in === 'header' && api.components.parameters.IdempotencyKey?.required === true, 'Idempotency-Key header contract 不完整');

  const hashContract = api['x-idempotency-contract'];
  for (const input of ['uppercase-method', 'canonical-expanded-path', 'sorted-decoded-route-parameters', 'sorted-query-multimap', 'content-type-header', 'if-match-header', 'canonical-json-or-multipart-fields', 'media-bytes-sha256-and-length-or-null-marker']) {
    assert(hashContract?.canonicalHashInputs?.includes(input), `canonical idempotency hash 缺少 input：${input}`);
  }
  assert(hashContract?.uniqueness?.join(',') === 'operation_scope,key' && hashContract.completedReplayPrecedesIfMatch === true, 'idempotency scope 或 completed replay precedence 不完整');
  const pagination = api['x-pagination-contract'];
  assert(pagination?.style === 'opaque-keyset' && pagination.offsetForbidden === true && pagination.nextCursorRequiredNullable === true, 'stable pagination contract 不完整');
  assert(pagination.defaultArchivedVisibility === 'excluded' && pagination.invalidCursorStatus === 400 && pagination.invalidCursorCode === 'VALIDATION' && pagination.invalidCursorReason === 'INVALID_CURSOR', 'archived/invalid cursor contract 不完整');

  const responseCodes = (response) => response?.content?.['application/json']?.schema?.properties?.code?.enum;
  const serviceMethods = new Set();
  const scopes = new Set();
  const internalCollaborators = api['x-internal-collaborators'] ?? [];
  const listIds = new Set(['listPostTypes', 'listTaxonomies', 'listTerms', 'listEntries', 'listMedia']);
  const immutableGetIds = new Set(['getPostTypeSchemaVersion', 'getTaxonomyVersion', 'getTermRevision', 'getEntryRevision']);
  const previewIds = new Set(['previewEntry']);

  for (const [path, expectedItem] of Object.entries(expected.paths)) {
    const item = api.paths[path];
    assert(item, `缺少 path：${path}`);
    for (const [method, expectedOperation] of Object.entries(expectedItem)) {
      const operation = item[method];
      const operationId = expectedOperation.operationId;
      assert(operation?.operationId === operationId, `缺少 ${method.toUpperCase()} ${path} 或 operationId 不符`);
      const serviceMethod = operation['x-application-service-method'];
      assert(typeof serviceMethod === 'string' && /^[A-Za-z]+ApplicationService\.[A-Za-z]+$/.test(serviceMethod), `${operationId} 缺少唯一 application-service method`);
      assert(!serviceMethods.has(serviceMethod), `application-service method 重複 route owner：${serviceMethod}`);
      assert(!internalCollaborators.some((name) => serviceMethod.includes(name)), `${operationId} 不得以內部協作者作 route owner`);
      serviceMethods.add(serviceMethod);

      assert(JSON.stringify(responseCodes(operation.responses?.['400'])) === JSON.stringify(['VALIDATION']), `${operationId} 400 code 必須精確為 VALIDATION`);
      assert(JSON.stringify(responseCodes(operation.responses?.['503'])) === JSON.stringify(['STORAGE_FAILED']), `${operationId} 缺少精確 STORAGE_FAILED 503`);
      if (expectedOperation.responses['404']) assert(JSON.stringify(responseCodes(operation.responses?.['404'])) === JSON.stringify(['NOT_FOUND']), `${operationId} 缺少精確 NOT_FOUND 404`);
      else assert(!operation.responses?.['404'], `${operationId} 不應宣告無 target/reference 的 404`);

      const scope = operation['x-idempotency-scope'];
      if (scope) {
        assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKey'), `${operationId} 缺少 Idempotency-Key`);
        assert(!scopes.has(scope), `idempotency scope 不唯一：${scope}`);
        scopes.add(scope);
        const conflictCodes = responseCodes(operation.responses?.['409']) ?? [];
        assert(conflictCodes.includes('IDEMPOTENCY_IN_PROGRESS') && conflictCodes.includes('IDEMPOTENCY_CONFLICT'), `${operationId} 409 缺少精確 idempotency codes`);
      } else {
        assert(!operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKey'), `${operationId} read operation 不應需要 Idempotency-Key`);
      }
      if (expectedOperation.parameters.some((parameter) => parameter.$ref === '#/components/parameters/IfMatch')) {
        assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IfMatch'), `${operationId} 缺少 owner If-Match`);
        assert(JSON.stringify(responseCodes(operation.responses?.['412'])) === JSON.stringify(['PRECONDITION_FAILED']), `${operationId} 412 code 不精確`);
        assert(JSON.stringify(responseCodes(operation.responses?.['428'])) === JSON.stringify(['PRECONDITION_REQUIRED']), `${operationId} 428 code 不精確`);
      }

      const successStatus = Object.keys(operation.responses).find((status) => status === '200' || status === '201');
      const success = operation.responses[successStatus];
      const successSchemaName = success?.content?.['application/json']?.schema?.$ref?.split('/').at(-1);
      assert(successSchemaName && !['Resource', 'Command', 'Create', 'List'].includes(successSchemaName), `${operationId} success 必須使用資源專屬 schema`);
      const isMutation = Boolean(scope) && !previewIds.has(operationId);
      if (isMutation) {
        assert(success.headers?.ETag?.required === true && success.headers.ETag['x-etag-kind'] === 'owner-strong', `${operationId} mutation 必須回 required owner strong ETag`);
        const resultSchema = api.components.schemas[successSchemaName];
        assert(resultSchema.required?.includes('resource') && resultSchema.properties?.resource?.$ref, `${operationId} mutation result 必須包含 owner resource`);
        const ownerSchema = resolveRef(api, resultSchema.properties.resource.$ref);
        assert(ownerSchema.required?.includes('resourceVersion') && ownerSchema.properties?.lifecycleState, `${operationId} result 必須回 owner resourceVersion/lifecycleState`);
      }
      if (immutableGetIds.has(operationId)) {
        assert(success.headers?.ETag?.['x-etag-kind'] === 'immutable-cache-only' && success.headers.ETag['x-owner-precondition'] === false, `${operationId} revision/version ETag 只能 cache`);
        assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IfNoneMatch'), `${operationId} immutable GET 缺少 If-None-Match`);
        assert(operation.responses?.['304']?.headers?.ETag?.['x-etag-kind'] === 'immutable-cache-only', `${operationId} immutable GET 缺少 ETag 304`);
      }
      if (listIds.has(operationId)) {
        assert(operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/Cursor') && operation.parameters?.some((parameter) => parameter.$ref === '#/components/parameters/IncludeArchived'), `${operationId} 缺少 cursor/includeArchived`);
        const pageSchema = api.components.schemas[successSchemaName];
        assert(pageSchema.required?.includes('nextCursor') && pageSchema.properties?.nextCursor?.type?.includes('null'), `${operationId} nextCursor 必須 required nullable`);
        assert(operation.responses?.['400']?.content?.['application/json']?.schema?.properties?.details?.$ref === '#/components/schemas/ListValidationDetails', `${operationId} list validation 必須使用具體 details`);
      }
      if (operation.requestBody) {
        const mediaType = Object.values(operation.requestBody.content)[0];
        const requestSchemaName = mediaType?.schema?.$ref?.split('/').at(-1);
        assert(requestSchemaName?.endsWith('Request') && !['CommandRequest', 'CreateRequest'].includes(requestSchemaName), `${operationId} request 必須資源專屬`);
      }
    }
  }
  assert(Object.keys(api.paths).length === Object.keys(expected.paths).length, 'OpenAPI path surface 不得擴張');
  assert(api.paths['/media/{id}']?.patch?.['x-idempotency-scope'] === 'media.update', 'PATCH media 必須 idempotent');

  const inspectSchemas = (value, location = 'components.schemas') => {
    if (Array.isArray(value)) return value.forEach((item, index) => inspectSchemas(item, `${location}[${index}]`));
    if (!value || typeof value !== 'object') return;
    if (value.type === 'object') {
      assert(value.additionalProperties === false, `${location} 不得為 arbitrary/open object`);
      assert(Array.isArray(value.required) && value.properties && typeof value.properties === 'object', `${location} 必須明列 required/properties/type`);
    }
    for (const [key, child] of Object.entries(value)) inspectSchemas(child, `${location}.${key}`);
  };
  inspectSchemas(api.components.schemas);
  for (const forbiddenName of ['Resource', 'Command', 'Create', 'List', 'CreateRequest', 'CommandRequest']) assert(!api.components.schemas[forbiddenName], `禁止 generic schema：${forbiddenName}`);
  for (const name of ['PostTypeAggregate', 'TaxonomyAggregate', 'TermAggregate', 'EntryAggregate', 'MediaAggregate']) {
    const schema = api.components.schemas[name];
    assert(schema?.required?.includes('resourceVersion') && schema.required.includes('lifecycleState'), `${name} 缺少 resourceVersion/lifecycleState`);
  }
  for (const name of ['PostTypeSchemaVersion', 'TaxonomyVersion', 'TermRevision', 'EntryRevision']) {
    const schema = api.components.schemas[name];
    assert(schema?.required?.includes('lifecycleStates') && schema.properties?.lifecycleStates?.type === 'array' && schema.properties.lifecycleStates.items?.enum?.includes('current') && schema.properties.lifecycleStates.items?.enum?.includes('published') && schema.properties.lifecycleStates.minItems === 1 && schema.properties.lifecycleStates.uniqueItems === true, `${name} immutable lifecycleStates 不完整`);
  }

  assert(JSON.stringify(api) === JSON.stringify(expected), 'openapi.json 與機械化候選契約不一致；使用 --write-openapi 重新產生後審核 diff');
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
      ['application service owner', join(tempRoot, 'openapi.json'), (value) => value.replace('PostTypeApplicationService.listPostTypes', 'RouteMigrationService.listPostTypes')],
      ['idempotent media patch', join(tempRoot, 'openapi.json'), (value) => value.replace('"media.update"', '"media.update.removed"')],
      ['required nullable next cursor', join(tempRoot, 'openapi.json'), (value) => value.replace('"nextCursorRequiredNullable": true', '"nextCursorRequiredNullable": false')],
      ['owner strong ETag', join(tempRoot, 'openapi.json'), (value) => value.replace('"x-etag-kind": "owner-strong"', '"x-etag-kind": "immutable-cache-only"')],
      ['exact storage error', join(tempRoot, 'openapi.json'), (value) => value.replace('"STORAGE_FAILED"', '"VALIDATION"')],
      ['closed resource schema', join(tempRoot, 'openapi.json'), (value) => value.replace('"additionalProperties": false', '"additionalProperties": true')],
      ['immutable conditional GET', join(tempRoot, 'openapi.json'), (value) => value.replace('"If-None-Match"', '"If-Modified-Since"')],
      ['list validation details', join(tempRoot, 'openapi.json'), (value) => value.replace('"INVALID_INCLUDE_ARCHIVED"', '"UNSPECIFIED"')],
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
  if (writeOpenApi) writeFileSync(openapiPath, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
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
  if (!noMutationTests && !writeSnapshot && !writeOpenApi) assertMutationResistance();
  console.log(`PASS: migration/schema, SQLite constraints, typed OpenAPI invariants${noMutationTests ? '' : ', and mutation resistance'}`);
} catch (error) {
  console.error(`CONTRACT_ERROR: ${error.message}`);
  process.exit(1);
}
