CREATE TABLE media_import_intents (
  import_id TEXT PRIMARY KEY CHECK (length(import_id) > 0),
  asset_id TEXT NOT NULL CHECK (length(asset_id) > 0),
  asset_version_id TEXT NOT NULL CHECK (length(asset_version_id) > 0),
  object_digest TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  metadata_bytes BLOB NOT NULL,
  metadata_digest TEXT NOT NULL,
  UNIQUE (asset_id, asset_version_id)
) STRICT;

CREATE TABLE media_objects (
  object_digest TEXT PRIMARY KEY,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0)
) STRICT;
CREATE TABLE media_assets (
  asset_id TEXT PRIMARY KEY CHECK (length(asset_id) > 0)
) STRICT;
CREATE TABLE asset_versions (
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  object_digest TEXT NOT NULL,
  metadata_bytes BLOB NOT NULL,
  metadata_digest TEXT NOT NULL,
  PRIMARY KEY (asset_id, asset_version_id),
  FOREIGN KEY (asset_id) REFERENCES media_assets (asset_id),
  FOREIGN KEY (object_digest) REFERENCES media_objects (object_digest)
) STRICT;
CREATE TABLE asset_version_availability (
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  availability TEXT NOT NULL CHECK (availability IN ('ready', 'archived', 'missing')),
  PRIMARY KEY (asset_id, asset_version_id),
  FOREIGN KEY (asset_id, asset_version_id) REFERENCES asset_versions (asset_id, asset_version_id)
) STRICT;
CREATE TRIGGER immutable_media_objects_update BEFORE UPDATE ON media_objects BEGIN SELECT RAISE(ABORT, 'immutable_media_objects_update'); END;
CREATE TRIGGER immutable_media_objects_delete BEFORE DELETE ON media_objects BEGIN SELECT RAISE(ABORT, 'immutable_media_objects_delete'); END;
CREATE TRIGGER immutable_media_assets_update BEFORE UPDATE ON media_assets BEGIN SELECT RAISE(ABORT, 'immutable_media_assets_update'); END;
CREATE TRIGGER immutable_media_assets_delete BEFORE DELETE ON media_assets BEGIN SELECT RAISE(ABORT, 'immutable_media_assets_delete'); END;
CREATE TRIGGER immutable_asset_versions_update BEFORE UPDATE ON asset_versions BEGIN SELECT RAISE(ABORT, 'immutable_asset_versions_update'); END;
CREATE TRIGGER immutable_asset_versions_delete BEFORE DELETE ON asset_versions BEGIN SELECT RAISE(ABORT, 'immutable_asset_versions_delete'); END;
