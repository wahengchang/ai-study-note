-- Seed fixture used by verify-contract.mjs. Negative cases are executed by the verifier
-- because each must independently fail without aborting this valid seed.
INSERT INTO post_types (id, key, resource_version, created_at, updated_at)
VALUES ('pt-page', 'page', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO post_type_schema_versions (id, post_type_id, version_number, route_base, has_archive, hierarchical, created_at)
VALUES ('pts-v1', 'pt-page', 1, '', 0, 1, '2026-08-25T00:00:00Z');
UPDATE post_types SET current_schema_version_id = 'pts-v1', published_schema_version_id = 'pts-v1', resource_version = resource_version + 1 WHERE id = 'pt-page';
INSERT INTO field_definitions (id, post_type_id, key, created_at)
VALUES ('fd-title', 'pt-page', 'rating', '2026-08-25T00:00:00Z');
INSERT INTO field_definition_versions (id, field_definition_id, post_type_id, post_type_schema_version_id, label, field_type, cardinality, required, public_visible, filterable, sortable, created_at)
VALUES ('fdv-v1', 'fd-title', 'pt-page', 'pts-v1', 'Rating', 'integer', 'single', 0, 1, 1, 1, '2026-08-25T00:00:00Z');
INSERT INTO taxonomies (id, key, resource_version, created_at, updated_at)
VALUES ('tax-topic', 'topic', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO taxonomy_versions (id, taxonomy_id, version_number, hierarchical, route_base, has_term_archive, created_at)
VALUES ('tax-v1', 'tax-topic', 1, 1, 'topics', 1, '2026-08-25T00:00:00Z');
UPDATE taxonomies SET current_version_id = 'tax-v1', published_version_id = 'tax-v1', resource_version = resource_version + 1 WHERE id = 'tax-topic';
INSERT INTO taxonomy_version_post_types (taxonomy_version_id, post_type_id) VALUES ('tax-v1', 'pt-page');
INSERT INTO terms (id, taxonomy_id, resource_version, created_at, updated_at)
VALUES ('term-ai', 'tax-topic', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO term_revisions (id, term_id, taxonomy_version_id, revision_number, name, slug, created_at)
VALUES ('tr-v1', 'term-ai', 'tax-v1', 1, 'AI', 'ai', '2026-08-25T00:00:00Z');
UPDATE terms SET current_revision_id = 'tr-v1', published_revision_id = 'tr-v1', first_published_at = '2026-08-25T00:00:00Z', resource_version = resource_version + 1 WHERE id = 'term-ai';
INSERT INTO entries (id, post_type_id, resource_version, created_at, updated_at)
VALUES ('entry-one', 'pt-page', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO entry_revisions (id, entry_id, post_type_schema_version_id, revision_number, title, slug, body_source, body_format, body_schema_version, created_at)
VALUES ('er-v1', 'entry-one', 'pts-v1', 1, 'One', 'one', '# One', 'gfm', 1, '2026-08-25T00:00:00Z');
UPDATE entries SET current_revision_id = 'er-v1', published_revision_id = 'er-v1', first_published_at = '2026-08-25T00:00:00Z', resource_version = resource_version + 1 WHERE id = 'entry-one';
INSERT INTO entry_field_values (id, entry_revision_id, field_definition_version_id, ordinal, kind, integer_value, created_at)
VALUES ('efv-v1', 'er-v1', 'fdv-v1', 0, 'integer', 5, '2026-08-25T00:00:00Z');
INSERT INTO revision_terms (entry_revision_id, term_id, term_revision_id, created_at)
VALUES ('er-v1', 'term-ai', 'tr-v1', '2026-08-25T00:00:00Z');
INSERT INTO route_claims (id, owner_kind, owner_id, canonical_path, current_source_id, published_source_id, created_at, updated_at)
VALUES ('route-entry-one', 'entry', 'entry-one', '/one/', 'er-v1', 'er-v1', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO route_claims (id, owner_kind, canonical_path, reserved_key, created_at, updated_at)
VALUES ('route-reserved-api', 'reserved', '/api/', 'api', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO idempotency_keys (id, operation_scope, key, request_hash, state, expires_at, created_at, updated_at)
VALUES ('idem-one', 'entries.create', 'key-one', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'pending', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO operation_log (id, idempotency_key_id, operation_scope, outcome_kind, outcome_id, created_at)
VALUES ('op-one', 'idem-one', 'entries.create', 'entry', 'entry-one', '2026-08-25T00:00:00Z');
UPDATE idempotency_keys
SET state = 'completed', lease_expires_at = NULL, response_status = 201,
    response_headers_json = '{"content-type":"application/json","etag":"\"entry-one:2\""}',
    response_body_json = '{"resource":{"id":"entry-one","resourceVersion":2},"outcome":"created"}',
    outcome_kind = 'entry', outcome_id = 'entry-one', operation_log_id = 'op-one',
    updated_at = '2026-08-25T00:00:01Z'
WHERE id = 'idem-one';
INSERT INTO media_objects (id, sha256, storage_key, mime_type, byte_size, state, final_path, resource_version, created_at, updated_at)
VALUES ('obj-one', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'media/originals/bb/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg', 'image/jpeg', 10, 'ready', 'media/originals/bb/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
INSERT INTO media_assets (id, object_id, title, original_filename, resource_version, ever_referenced_at, created_at, updated_at)
VALUES ('asset-one', 'obj-one', 'Example', 'example.jpg', 1, '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z');
