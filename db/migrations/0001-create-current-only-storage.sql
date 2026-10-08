-- Fresh-install current-only schema. No Revision, Version, or legacy media lineage.
CREATE TABLE storage_migrations (
  sequence INTEGER PRIMARY KEY,
  migration_id TEXT UNIQUE NOT NULL,
  filename TEXT UNIQUE NOT NULL,
  digest TEXT NOT NULL CHECK (
    length(digest) = 71
    AND substr(digest, 1, 7) = 'sha256:'
    AND substr(digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
) STRICT;

CREATE TRIGGER immutable_storage_migrations_update BEFORE UPDATE ON storage_migrations BEGIN SELECT RAISE(ABORT, 'immutable_storage_migrations_update'); END;
CREATE TRIGGER immutable_storage_migrations_delete BEFORE DELETE ON storage_migrations BEGIN SELECT RAISE(ABORT, 'immutable_storage_migrations_delete'); END;

CREATE TABLE current_content_types (
  type_id TEXT PRIMARY KEY,
  definition_bytes BLOB NOT NULL,
  definition_digest TEXT NOT NULL
) STRICT;

CREATE TABLE global_slug_claims (
  namespace_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('content-type', 'taxonomy', 'term', 'entry', 'media')),
  entity_id TEXT NOT NULL,
  UNIQUE (entity_kind, entity_id)
) STRICT;

CREATE TABLE current_entries (
  entry_id TEXT PRIMARY KEY,
  type_id TEXT NOT NULL,
  authoring_route TEXT NOT NULL CHECK (
    length(authoring_route) > 1 AND substr(authoring_route, 1, 1) = '/'
    AND instr(substr(authoring_route, 2), '/') = 0
    AND instr(authoring_route, char(37)) = 0
    AND instr(authoring_route, '?') = 0
    AND instr(authoring_route, '#') = 0
    AND instr(authoring_route, ' ') = 0
    AND instr(authoring_route, char(9)) = 0 AND instr(authoring_route, char(10)) = 0 AND instr(authoring_route, char(13)) = 0
  ),
  content_bytes BLOB NOT NULL,
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 71
    AND substr(content_digest, 1, 7) = 'sha256:'
    AND substr(content_digest, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TEXT CHECK (
    published_at IS NULL OR (
      length(published_at) = 24
      AND published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 days') IS published_at
    )
  ),
  last_published_digest TEXT CHECK (
    last_published_digest IS NULL OR (
      length(last_published_digest) = 71
      AND substr(last_published_digest, 1, 7) = 'sha256:'
      AND substr(last_published_digest, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CHECK ((published_at IS NULL) = (last_published_digest IS NULL)),
  CHECK (status = 'draft' OR published_at IS NOT NULL),
  FOREIGN KEY (type_id) REFERENCES current_content_types (type_id)
) STRICT;

CREATE INDEX current_entries_type ON current_entries (type_id, entry_id);
CREATE TABLE current_media_assets (
  asset_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  alt_text TEXT,
  caption TEXT NOT NULL,
  description TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  checksum TEXT NOT NULL,
  image_width INTEGER,
  image_height INTEGER,
  thumbnail_digest TEXT,
  thumbnail_byte_length INTEGER,
  thumbnail_width INTEGER,
  thumbnail_height INTEGER,
  uploaded_at TEXT NOT NULL,
  CHECK (length(asset_id) > 0),
  CHECK (length(slug) > 0),
  CHECK (length(original_filename) > 0),
  CHECK (length(mime_type) > 0),
  CHECK ((image_width IS NULL) = (image_height IS NULL)),
  CHECK (image_width IS NULL OR image_width > 0),
  CHECK (image_height IS NULL OR image_height > 0),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_byte_length IS NULL)),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_width IS NULL)),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_height IS NULL)),
  CHECK (thumbnail_byte_length IS NULL OR thumbnail_byte_length >= 0),
  CHECK (thumbnail_width IS NULL OR thumbnail_width > 0),
  CHECK (thumbnail_height IS NULL OR thumbnail_height > 0),
  -- 縮圖只可能來自已解析的 raster 尺寸，沒有 image 的 thumbnail 是自我矛盾的 record。
  CHECK (thumbnail_digest IS NULL OR image_width IS NOT NULL)
) STRICT;

CREATE TABLE current_media_references (
  asset_id TEXT NOT NULL,
  entry_id TEXT NOT NULL CHECK (length(entry_id) > 0),
  entry_status TEXT NOT NULL CHECK (entry_status IN ('draft', 'published')),
  PRIMARY KEY (asset_id, entry_id),
  FOREIGN KEY (asset_id) REFERENCES current_media_assets (asset_id),
  FOREIGN KEY (entry_id) REFERENCES current_entries (entry_id)
) STRICT;

-- entry-side 整批覆寫以 entry_id 為主鍵路徑，asset-side usage 讀取則由 PRIMARY KEY 前綴涵蓋。
CREATE INDEX current_media_references_entry ON current_media_references (entry_id, asset_id);
-- Current-only taxonomy registry；舊 revision taxonomy 資料不搬入。
CREATE TABLE current_taxonomies (
  taxonomy_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  slug TEXT NOT NULL,
  hierarchical INTEGER NOT NULL CHECK (hierarchical IN (0, 1))
) STRICT;

CREATE TABLE current_taxonomy_terms (
  taxonomy_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  label TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_term_id TEXT,
  term_order INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('live', 'retired')),
  PRIMARY KEY (taxonomy_id, term_id),
  FOREIGN KEY (taxonomy_id) REFERENCES current_taxonomies (taxonomy_id),
  FOREIGN KEY (taxonomy_id, parent_term_id) REFERENCES current_taxonomy_terms (taxonomy_id, term_id)
) STRICT;

CREATE INDEX current_taxonomy_terms_parent ON current_taxonomy_terms (taxonomy_id, parent_term_id);

CREATE TABLE current_entry_taxonomy_bindings (
  entry_id TEXT NOT NULL,
  taxonomy_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (entry_id, taxonomy_id, term_id),
  FOREIGN KEY (entry_id) REFERENCES current_entries (entry_id),
  FOREIGN KEY (taxonomy_id, term_id) REFERENCES current_taxonomy_terms (taxonomy_id, term_id)
) STRICT;
CREATE INDEX current_entry_taxonomy_bindings_term ON current_entry_taxonomy_bindings (taxonomy_id, term_id, entry_id);

INSERT INTO current_taxonomies (taxonomy_id, label, slug, hierarchical) VALUES
  ('00000000-0000-4000-8000-000000000002', '分類', 'categories', 1),
  ('00000000-0000-4000-8000-000000000003', '標籤', 'tags', 0);
INSERT INTO current_content_types (type_id, definition_bytes, definition_digest)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  CAST('{"contract":"content-type-definition/v1","fieldGroups":[],"help":"","label":"文章","order":0,"showInMenu":true,"slug":"articles","systemFields":["title","body","slug","excerpt","featuredMedia","categories","tags","seo","status","publishedAt"],"taxonomyAttachments":[{"allowTermCreation":true,"cardinality":"one","required":false,"taxonomyId":"00000000-0000-4000-8000-000000000002"},{"allowTermCreation":true,"cardinality":"many","required":false,"taxonomyId":"00000000-0000-4000-8000-000000000003"}],"typeId":"00000000-0000-4000-8000-000000000001"}' AS BLOB),
  'sha256:0a346767a7d094ab172f5ead3adefae8a875cf018f8c7a1d7ad3f2b689365f01'
)
ON CONFLICT (type_id) DO UPDATE SET
  definition_bytes = CASE WHEN current_content_types.definition_bytes = excluded.definition_bytes AND current_content_types.definition_digest = excluded.definition_digest THEN current_content_types.definition_bytes ELSE NULL END;

INSERT INTO global_slug_claims (namespace_key, slug, entity_kind, entity_id)
VALUES
  ('articles', 'articles', 'content-type', '00000000-0000-4000-8000-000000000001'),
  ('categories', 'categories', 'taxonomy', '00000000-0000-4000-8000-000000000002'),
  ('tags', 'tags', 'taxonomy', '00000000-0000-4000-8000-000000000003')
ON CONFLICT (namespace_key) DO UPDATE SET
  slug = CASE WHEN global_slug_claims.slug = excluded.slug AND global_slug_claims.entity_kind = excluded.entity_kind AND global_slug_claims.entity_id = excluded.entity_id THEN global_slug_claims.slug ELSE NULL END;

CREATE TABLE plugin_activation_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO plugin_activation_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22616374697665223a5b5d2c22636f6e7472616374223a22706c7567696e2d61637469766174696f6e2d73746174652f7632222c22726561637469766174696f6e5265717569726564223a5b5d7d',
  'sha256:985e60b44ed61f591efd0bc40828adf42164e10c05892a88860896899d40c7a7'
);

CREATE TRIGGER prevent_plugin_activation_state_delete
BEFORE DELETE ON plugin_activation_state
BEGIN
  SELECT RAISE(ABORT, 'plugin activation singleton is immutable');
END;

CREATE TABLE theme_activation_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO theme_activation_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22636f6e7472616374223a227468656d652d61637469766174696f6e2d73746174652f7631227d',
  'sha256:2d3bd9fd385ef0f4dad9d7026da41a3a39fa04850e0e05ea98322cf5d0230430'
);

CREATE TRIGGER prevent_theme_activation_state_delete
BEFORE DELETE ON theme_activation_state
BEGIN
  SELECT RAISE(ABORT, 'theme activation singleton is immutable');
END;

CREATE TABLE plugin_settings_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO plugin_settings_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22636f6e7472616374223a22706c7567696e2d73657474696e67732d73746174652f7631222c227265636f726473223a5b5d7d',
  'sha256:c890fac912180a420c855ee7e05adf0dc94d7e8ef0fba033604dc4156f0a013e'
);

CREATE TRIGGER prevent_plugin_settings_state_delete
BEFORE DELETE ON plugin_settings_state
BEGIN
  SELECT RAISE(ABORT, 'plugin settings singleton is immutable');
END;
