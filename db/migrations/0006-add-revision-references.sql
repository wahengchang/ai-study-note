CREATE TABLE revision_refs (
  entry_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  PRIMARY KEY (entry_id, revision_id, asset_id, asset_version_id),
  FOREIGN KEY (entry_id, revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (asset_id, asset_version_id) REFERENCES asset_versions (asset_id, asset_version_id)
) STRICT;
CREATE TRIGGER immutable_revision_refs_update BEFORE UPDATE ON revision_refs BEGIN SELECT RAISE(ABORT, 'immutable_revision_refs_update'); END;
CREATE TRIGGER immutable_revision_refs_delete BEFORE DELETE ON revision_refs BEGIN SELECT RAISE(ABORT, 'immutable_revision_refs_delete'); END;
