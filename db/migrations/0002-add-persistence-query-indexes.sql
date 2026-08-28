CREATE INDEX revisions_schema_identity_idx ON revisions (schema_id, schema_version, entry_id, revision_id);
CREATE INDEX operation_lineage_operation_idx ON operation_lineage (operation_id, entry_id, revision_id);
