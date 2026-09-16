CREATE TABLE current_content_types (
  type_id TEXT PRIMARY KEY,
  definition_bytes BLOB NOT NULL,
  definition_digest TEXT NOT NULL,
  legacy_schema_id TEXT UNIQUE
) STRICT;

CREATE TABLE global_slug_claims (
  namespace_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('content-type', 'taxonomy', 'entry', 'media')),
  entity_id TEXT NOT NULL,
  UNIQUE (entity_kind, entity_id)
) STRICT;

INSERT INTO taxonomies (taxonomy_id, label)
VALUES ('00000000-0000-4000-8000-000000000002', '分類')
ON CONFLICT (taxonomy_id) DO UPDATE SET label = CASE WHEN taxonomies.label = excluded.label THEN taxonomies.label ELSE NULL END;

INSERT INTO taxonomies (taxonomy_id, label)
VALUES ('00000000-0000-4000-8000-000000000003', '標籤')
ON CONFLICT (taxonomy_id) DO UPDATE SET label = CASE WHEN taxonomies.label = excluded.label THEN taxonomies.label ELSE NULL END;

INSERT INTO current_content_types (type_id, definition_bytes, definition_digest, legacy_schema_id)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  CAST('{"contract":"content-type-definition/v1","fieldGroups":[],"help":"","label":"文章","order":0,"showInMenu":true,"slug":"articles","systemFields":["title","body","slug","excerpt","featuredMedia","categories","tags","seo","status","publishedAt"],"taxonomyAttachments":[{"allowTermCreation":true,"cardinality":"one","required":false,"taxonomyId":"00000000-0000-4000-8000-000000000002"},{"allowTermCreation":true,"cardinality":"many","required":false,"taxonomyId":"00000000-0000-4000-8000-000000000003"}],"typeId":"00000000-0000-4000-8000-000000000001"}' AS BLOB),
  'sha256:0a346767a7d094ab172f5ead3adefae8a875cf018f8c7a1d7ad3f2b689365f01',
  'site-content'
)
ON CONFLICT (type_id) DO UPDATE SET
  definition_bytes = CASE WHEN current_content_types.definition_bytes = excluded.definition_bytes AND current_content_types.definition_digest = excluded.definition_digest AND current_content_types.legacy_schema_id = excluded.legacy_schema_id THEN current_content_types.definition_bytes ELSE NULL END;

INSERT INTO global_slug_claims (namespace_key, slug, entity_kind, entity_id)
VALUES
  ('articles', 'articles', 'content-type', '00000000-0000-4000-8000-000000000001'),
  ('categories', 'categories', 'taxonomy', '00000000-0000-4000-8000-000000000002'),
  ('tags', 'tags', 'taxonomy', '00000000-0000-4000-8000-000000000003')
ON CONFLICT (namespace_key) DO UPDATE SET
  slug = CASE WHEN global_slug_claims.slug = excluded.slug AND global_slug_claims.entity_kind = excluded.entity_kind AND global_slug_claims.entity_id = excluded.entity_id THEN global_slug_claims.slug ELSE NULL END;
