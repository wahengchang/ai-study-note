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

CREATE TABLE schema_versions (
  schema_id TEXT NOT NULL CHECK (length(schema_id) > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_bytes BLOB NOT NULL,
  schema_digest TEXT NOT NULL CHECK (
    length(schema_digest) = 71
    AND substr(schema_digest, 1, 7) = 'sha256:'
    AND substr(schema_digest, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  PRIMARY KEY (schema_id, version)
) STRICT;

CREATE TABLE revisions (
  entry_id TEXT NOT NULL CHECK (length(entry_id) > 0),
  revision_id TEXT NOT NULL CHECK (length(revision_id) > 0),
  schema_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  content_bytes BLOB NOT NULL,
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 71
    AND substr(content_digest, 1, 7) = 'sha256:'
    AND substr(content_digest, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  restored_from_revision_id TEXT,
  PRIMARY KEY (entry_id, revision_id),
  FOREIGN KEY (schema_id, schema_version) REFERENCES schema_versions (schema_id, version),
  FOREIGN KEY (entry_id, restored_from_revision_id) REFERENCES revisions (entry_id, revision_id)
) STRICT;

CREATE TABLE operation_lineage (
  entry_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (length(operation_id) > 0),
  operation_kind TEXT NOT NULL CHECK (length(operation_kind) > 0),
  PRIMARY KEY (entry_id, revision_id),
  FOREIGN KEY (entry_id, revision_id) REFERENCES revisions (entry_id, revision_id)
) STRICT;

CREATE TRIGGER immutable_storage_migrations_update BEFORE UPDATE ON storage_migrations BEGIN SELECT RAISE(ABORT, 'immutable_storage_migrations_update'); END;
CREATE TRIGGER immutable_storage_migrations_delete BEFORE DELETE ON storage_migrations BEGIN SELECT RAISE(ABORT, 'immutable_storage_migrations_delete'); END;
CREATE TRIGGER immutable_schema_versions_update BEFORE UPDATE ON schema_versions BEGIN SELECT RAISE(ABORT, 'immutable_schema_versions_update'); END;
CREATE TRIGGER immutable_schema_versions_delete BEFORE DELETE ON schema_versions BEGIN SELECT RAISE(ABORT, 'immutable_schema_versions_delete'); END;
CREATE TRIGGER immutable_revisions_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable_revisions_update'); END;
CREATE TRIGGER immutable_revisions_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable_revisions_delete'); END;
CREATE TRIGGER immutable_operation_lineage_update BEFORE UPDATE ON operation_lineage BEGIN SELECT RAISE(ABORT, 'immutable_operation_lineage_update'); END;
CREATE TRIGGER immutable_operation_lineage_delete BEFORE DELETE ON operation_lineage BEGIN SELECT RAISE(ABORT, 'immutable_operation_lineage_delete'); END;
