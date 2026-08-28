CREATE TABLE operation_lineage_next (
  entry_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (length(operation_id) > 0),
  operation_kind TEXT NOT NULL CHECK (length(operation_kind) > 0),
  creates_revision INTEGER NOT NULL CHECK (creates_revision IN (0, 1)),
  PRIMARY KEY (entry_id, revision_id, operation_id),
  FOREIGN KEY (entry_id, revision_id) REFERENCES revisions (entry_id, revision_id)
) STRICT;

INSERT INTO operation_lineage_next (entry_id, revision_id, operation_id, operation_kind, creates_revision)
SELECT entry_id, revision_id, operation_id, operation_kind, 1 FROM operation_lineage;

DROP TRIGGER immutable_operation_lineage_update;
DROP TRIGGER immutable_operation_lineage_delete;
DROP TABLE operation_lineage;
ALTER TABLE operation_lineage_next RENAME TO operation_lineage;
CREATE UNIQUE INDEX operation_lineage_one_creation_per_revision
  ON operation_lineage (entry_id, revision_id) WHERE creates_revision = 1;
CREATE TRIGGER immutable_operation_lineage_update BEFORE UPDATE ON operation_lineage BEGIN SELECT RAISE(ABORT, 'immutable_operation_lineage_update'); END;
CREATE TRIGGER immutable_operation_lineage_delete BEFORE DELETE ON operation_lineage BEGIN SELECT RAISE(ABORT, 'immutable_operation_lineage_delete'); END;

CREATE TABLE entry_pointers (
  entry_id TEXT PRIMARY KEY CHECK (length(entry_id) > 0),
  current_revision_id TEXT NOT NULL,
  published_revision_id TEXT,
  FOREIGN KEY (entry_id, current_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (entry_id, published_revision_id) REFERENCES revisions (entry_id, revision_id)
) STRICT;

CREATE TABLE entry_pointer_lineage (
  entry_id TEXT NOT NULL,
  operation_revision_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  current_revision_id TEXT NOT NULL,
  published_revision_id TEXT,
  PRIMARY KEY (entry_id, operation_revision_id, operation_id),
  FOREIGN KEY (entry_id, operation_revision_id, operation_id)
    REFERENCES operation_lineage (entry_id, revision_id, operation_id),
  FOREIGN KEY (entry_id, current_revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (entry_id, published_revision_id) REFERENCES revisions (entry_id, revision_id),
  CHECK (operation_revision_id = current_revision_id OR published_revision_id IS NOT NULL AND operation_revision_id = published_revision_id)
) STRICT;
CREATE TRIGGER immutable_entry_pointer_lineage_update BEFORE UPDATE ON entry_pointer_lineage BEGIN SELECT RAISE(ABORT, 'immutable_entry_pointer_lineage_update'); END;
CREATE TRIGGER immutable_entry_pointer_lineage_delete BEFORE DELETE ON entry_pointer_lineage BEGIN SELECT RAISE(ABORT, 'immutable_entry_pointer_lineage_delete'); END;
