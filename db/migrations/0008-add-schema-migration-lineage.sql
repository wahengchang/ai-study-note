CREATE TABLE schema_migration_executions (
  operation_id TEXT PRIMARY KEY CHECK (length(operation_id) > 0),
  source_schema_id TEXT NOT NULL,
  source_schema_version INTEGER NOT NULL CHECK (source_schema_version > 0),
  target_schema_id TEXT NOT NULL,
  target_schema_version INTEGER NOT NULL CHECK (target_schema_version > 0),
  mapping_identity TEXT NOT NULL CHECK (
    length(mapping_identity) = 71
    AND substr(mapping_identity, 1, 7) = 'sha256:'
    AND substr(mapping_identity, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (source_schema_id = target_schema_id),
  CHECK (target_schema_version > source_schema_version),
  FOREIGN KEY (source_schema_id, source_schema_version) REFERENCES schema_versions (schema_id, version),
  FOREIGN KEY (target_schema_id, target_schema_version) REFERENCES schema_versions (schema_id, version)
) STRICT;

CREATE UNIQUE INDEX operation_lineage_creation_identity
  ON operation_lineage (entry_id, revision_id, operation_id, creates_revision);

CREATE TABLE schema_migration_revision_lineage (
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  replacement_revision_id TEXT NOT NULL,
  replacement_creates_revision INTEGER NOT NULL DEFAULT 1 CHECK (replacement_creates_revision = 1),
  PRIMARY KEY (operation_id, entry_id, source_revision_id),
  UNIQUE (operation_id, entry_id, replacement_revision_id),
  UNIQUE (operation_id, entry_id, source_revision_id, replacement_revision_id),
  FOREIGN KEY (operation_id) REFERENCES schema_migration_executions (operation_id),
  FOREIGN KEY (entry_id, source_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (entry_id, replacement_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (entry_id, replacement_revision_id, operation_id, replacement_creates_revision)
    REFERENCES operation_lineage (entry_id, revision_id, operation_id, creates_revision)
) STRICT;

CREATE TABLE schema_migration_pointer_lineage (
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  pointer TEXT NOT NULL CHECK (pointer IN ('current', 'published')),
  source_revision_id TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy IN ('move', 'pin')),
  result_revision_id TEXT NOT NULL,
  replacement_revision_id TEXT,
  PRIMARY KEY (operation_id, entry_id, pointer),
  FOREIGN KEY (operation_id) REFERENCES schema_migration_executions (operation_id),
  FOREIGN KEY (entry_id, source_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (entry_id, result_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (operation_id, entry_id, source_revision_id, replacement_revision_id)
    REFERENCES schema_migration_revision_lineage (operation_id, entry_id, source_revision_id, replacement_revision_id),
  CHECK (
    (policy = 'pin' AND replacement_revision_id IS NULL AND result_revision_id = source_revision_id)
    OR (policy = 'move' AND replacement_revision_id IS NOT NULL AND replacement_revision_id <> source_revision_id AND result_revision_id = replacement_revision_id)
  )
) STRICT;

CREATE TRIGGER immutable_schema_migration_executions_update BEFORE UPDATE ON schema_migration_executions BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_executions_update'); END;
CREATE TRIGGER immutable_schema_migration_executions_delete BEFORE DELETE ON schema_migration_executions BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_executions_delete'); END;
CREATE TRIGGER immutable_schema_migration_revision_lineage_update BEFORE UPDATE ON schema_migration_revision_lineage BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_revision_lineage_update'); END;
CREATE TRIGGER immutable_schema_migration_revision_lineage_delete BEFORE DELETE ON schema_migration_revision_lineage BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_revision_lineage_delete'); END;
CREATE TRIGGER immutable_schema_migration_pointer_lineage_update BEFORE UPDATE ON schema_migration_pointer_lineage BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_pointer_lineage_update'); END;
CREATE TRIGGER immutable_schema_migration_pointer_lineage_delete BEFORE DELETE ON schema_migration_pointer_lineage BEGIN SELECT RAISE(ABORT, 'immutable_schema_migration_pointer_lineage_delete'); END;
