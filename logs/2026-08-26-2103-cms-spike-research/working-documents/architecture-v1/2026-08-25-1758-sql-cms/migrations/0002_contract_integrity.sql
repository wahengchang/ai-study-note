PRAGMA foreign_keys = ON;

-- Every mutable API aggregate advances its optimistic-concurrency token once.
CREATE TRIGGER post_types_resource_version_update BEFORE UPDATE ON post_types BEGIN
  SELECT CASE WHEN NEW.resource_version <> OLD.resource_version + 1 THEN RAISE(ABORT, 'post type resource version must increment by one') END;
END;
CREATE TRIGGER taxonomies_resource_version_update BEFORE UPDATE ON taxonomies BEGIN
  SELECT CASE WHEN NEW.resource_version <> OLD.resource_version + 1 THEN RAISE(ABORT, 'taxonomy resource version must increment by one') END;
END;
CREATE TRIGGER terms_resource_version_update BEFORE UPDATE ON terms BEGIN
  SELECT CASE WHEN NEW.resource_version <> OLD.resource_version + 1 THEN RAISE(ABORT, 'term resource version must increment by one') END;
END;
CREATE TRIGGER entries_resource_version_update BEFORE UPDATE ON entries BEGIN
  SELECT CASE WHEN NEW.resource_version <> OLD.resource_version + 1 THEN RAISE(ABORT, 'entry resource version must increment by one') END;
END;
CREATE TRIGGER media_assets_resource_version_update BEFORE UPDATE ON media_assets BEGIN
  SELECT CASE WHEN NEW.resource_version <> OLD.resource_version + 1 THEN RAISE(ABORT, 'media asset resource version must increment by one') END;
END;

-- Mutable owner pointers may only select immutable rows owned by that aggregate.
CREATE TRIGGER post_types_pointer_owner_insert BEFORE INSERT ON post_types BEGIN
  SELECT CASE WHEN NEW.current_schema_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM post_type_schema_versions WHERE id = NEW.current_schema_version_id AND post_type_id = NEW.id) THEN RAISE(ABORT, 'post type current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_schema_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM post_type_schema_versions WHERE id = NEW.published_schema_version_id AND post_type_id = NEW.id) THEN RAISE(ABORT, 'post type published pointer owner mismatch') END;
END;
CREATE TRIGGER post_types_pointer_owner_update BEFORE UPDATE ON post_types BEGIN
  SELECT CASE WHEN NEW.current_schema_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM post_type_schema_versions WHERE id = NEW.current_schema_version_id AND post_type_id = NEW.id) THEN RAISE(ABORT, 'post type current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_schema_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM post_type_schema_versions WHERE id = NEW.published_schema_version_id AND post_type_id = NEW.id) THEN RAISE(ABORT, 'post type published pointer owner mismatch') END;
END;
CREATE TRIGGER taxonomies_pointer_owner_insert BEFORE INSERT ON taxonomies BEGIN
  SELECT CASE WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_versions WHERE id = NEW.current_version_id AND taxonomy_id = NEW.id) THEN RAISE(ABORT, 'taxonomy current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_versions WHERE id = NEW.published_version_id AND taxonomy_id = NEW.id) THEN RAISE(ABORT, 'taxonomy published pointer owner mismatch') END;
END;
CREATE TRIGGER taxonomies_pointer_owner_update BEFORE UPDATE ON taxonomies BEGIN
  SELECT CASE WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_versions WHERE id = NEW.current_version_id AND taxonomy_id = NEW.id) THEN RAISE(ABORT, 'taxonomy current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_versions WHERE id = NEW.published_version_id AND taxonomy_id = NEW.id) THEN RAISE(ABORT, 'taxonomy published pointer owner mismatch') END;
END;
CREATE TRIGGER terms_pointer_owner_insert BEFORE INSERT ON terms BEGIN
  SELECT CASE WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM term_revisions WHERE id = NEW.current_revision_id AND term_id = NEW.id) THEN RAISE(ABORT, 'term current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM term_revisions WHERE id = NEW.published_revision_id AND term_id = NEW.id) THEN RAISE(ABORT, 'term published pointer owner mismatch') END;
END;
CREATE TRIGGER terms_pointer_owner_update BEFORE UPDATE ON terms BEGIN
  SELECT CASE WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM term_revisions WHERE id = NEW.current_revision_id AND term_id = NEW.id) THEN RAISE(ABORT, 'term current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM term_revisions WHERE id = NEW.published_revision_id AND term_id = NEW.id) THEN RAISE(ABORT, 'term published pointer owner mismatch') END;
END;
CREATE TRIGGER entries_pointer_owner_insert BEFORE INSERT ON entries BEGIN
  SELECT CASE WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entry_revisions WHERE id = NEW.current_revision_id AND entry_id = NEW.id) THEN RAISE(ABORT, 'entry current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entry_revisions WHERE id = NEW.published_revision_id AND entry_id = NEW.id) THEN RAISE(ABORT, 'entry published pointer owner mismatch') END;
END;
CREATE TRIGGER entries_pointer_owner_update BEFORE UPDATE ON entries BEGIN
  SELECT CASE WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entry_revisions WHERE id = NEW.current_revision_id AND entry_id = NEW.id) THEN RAISE(ABORT, 'entry current pointer owner mismatch') END;
  SELECT CASE WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entry_revisions WHERE id = NEW.published_revision_id AND entry_id = NEW.id) THEN RAISE(ABORT, 'entry published pointer owner mismatch') END;
END;

CREATE TRIGGER terms_identity_owner_update BEFORE UPDATE ON terms BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.taxonomy_id <> OLD.taxonomy_id THEN RAISE(ABORT, 'term identity owner is immutable') END;
END;
CREATE TRIGGER entries_identity_owner_update BEFORE UPDATE ON entries BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.post_type_id <> OLD.post_type_id THEN RAISE(ABORT, 'entry identity owner is immutable') END;
END;

CREATE TRIGGER immutable_taxonomy_version_post_types_update BEFORE UPDATE ON taxonomy_version_post_types BEGIN SELECT RAISE(ABORT, 'immutable taxonomy version post type'); END;
CREATE TRIGGER immutable_taxonomy_version_post_types_delete BEFORE DELETE ON taxonomy_version_post_types BEGIN SELECT RAISE(ABORT, 'immutable taxonomy version post type'); END;

-- A live route must always be backed by at least one owner history row.
CREATE TRIGGER route_claims_require_source_insert BEFORE INSERT ON route_claims BEGIN
  SELECT CASE WHEN NEW.owner_kind <> 'reserved' AND NEW.current_source_id IS NULL AND NEW.published_source_id IS NULL THEN RAISE(ABORT, 'nonreserved claim requires source') END;
END;
CREATE TRIGGER route_claims_require_source_update BEFORE UPDATE ON route_claims BEGIN
  SELECT CASE WHEN NEW.owner_kind <> 'reserved' AND NEW.current_source_id IS NULL AND NEW.published_source_id IS NULL THEN RAISE(ABORT, 'nonreserved claim requires source') END;
END;

-- The durable log is append-only; completion binds the exact replay envelope and
-- outcome to the same log row in both directions.
CREATE TRIGGER operation_log_validate_insert BEFORE INSERT ON operation_log BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM idempotency_keys i
    WHERE i.id = NEW.idempotency_key_id
      AND i.operation_scope = NEW.operation_scope
      AND i.state = 'pending'
  ) THEN RAISE(ABORT, 'operation log idempotency scope/state mismatch') END;
  SELECT CASE WHEN length(NEW.outcome_kind) = 0 OR length(NEW.outcome_id) = 0 THEN RAISE(ABORT, 'operation log outcome required') END;
END;
CREATE TRIGGER immutable_operation_log_update BEFORE UPDATE ON operation_log BEGIN SELECT RAISE(ABORT, 'immutable operation log'); END;
CREATE TRIGGER immutable_operation_log_delete BEFORE DELETE ON operation_log BEGIN SELECT RAISE(ABORT, 'immutable operation log'); END;

CREATE TRIGGER idempotency_identity_immutable_update BEFORE UPDATE ON idempotency_keys BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.operation_scope <> OLD.operation_scope OR NEW.key <> OLD.key OR NEW.request_hash <> OLD.request_hash OR NEW.created_at <> OLD.created_at THEN RAISE(ABORT, 'idempotency identity is immutable') END;
END;
CREATE TRIGGER idempotency_completed_validate_insert BEFORE INSERT ON idempotency_keys WHEN NEW.state = 'completed' BEGIN
  SELECT RAISE(ABORT, 'completed idempotency must transition from pending after operation log insert');
END;
CREATE TRIGGER idempotency_completed_validate_update BEFORE UPDATE ON idempotency_keys WHEN NEW.state = 'completed' BEGIN
  SELECT CASE WHEN NEW.response_status IS NULL OR NEW.response_status < 100 OR NEW.response_status > 599 THEN RAISE(ABORT, 'completed idempotency response status required') END;
  SELECT CASE WHEN NEW.response_headers_json IS NULL OR json_valid(NEW.response_headers_json) = 0 OR json_type(NEW.response_headers_json) <> 'object' THEN RAISE(ABORT, 'completed idempotency response headers required') END;
  SELECT CASE WHEN NEW.response_body_json IS NULL OR json_valid(NEW.response_body_json) = 0 THEN RAISE(ABORT, 'completed idempotency response body required') END;
  SELECT CASE WHEN NEW.outcome_kind IS NULL OR length(NEW.outcome_kind) = 0 OR NEW.outcome_id IS NULL OR length(NEW.outcome_id) = 0 OR NEW.operation_log_id IS NULL THEN RAISE(ABORT, 'completed idempotency outcome/log required') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM operation_log o
    WHERE o.id = NEW.operation_log_id
      AND o.idempotency_key_id = NEW.id
      AND o.operation_scope = NEW.operation_scope
      AND o.outcome_kind = NEW.outcome_kind
      AND o.outcome_id = NEW.outcome_id
  ) THEN RAISE(ABORT, 'completed idempotency operation log mismatch') END;
END;
CREATE TRIGGER immutable_completed_idempotency_update BEFORE UPDATE ON idempotency_keys WHEN OLD.state = 'completed' BEGIN SELECT RAISE(ABORT, 'immutable completed idempotency'); END;
CREATE TRIGGER immutable_completed_idempotency_delete BEFORE DELETE ON idempotency_keys WHEN OLD.state = 'completed' BEGIN SELECT RAISE(ABORT, 'immutable completed idempotency'); END;

CREATE TRIGGER media_assets_no_hard_delete BEFORE DELETE ON media_assets BEGIN SELECT RAISE(ABORT, 'media asset hard delete forbidden'); END;
CREATE TRIGGER media_objects_delete_guard BEFORE DELETE ON media_objects BEGIN
  SELECT CASE WHEN OLD.state NOT IN ('error','deleting') THEN RAISE(ABORT, 'media object delete state forbidden') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM media_assets WHERE object_id = OLD.id) THEN RAISE(ABORT, 'media object still has asset') END;
END;
