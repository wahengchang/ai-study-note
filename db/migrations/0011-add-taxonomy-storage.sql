CREATE TABLE taxonomies (
  taxonomy_id TEXT PRIMARY KEY,
  label TEXT NOT NULL
) STRICT;

-- 保留所有曾建立 term 的 identity，即使 term 已刪除，term ID 也不得重用。
CREATE TABLE taxonomy_term_identities (
  taxonomy_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (taxonomy_id, term_id),
  FOREIGN KEY (taxonomy_id) REFERENCES taxonomies (taxonomy_id)
) STRICT;

CREATE TABLE taxonomy_terms (
  taxonomy_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  label TEXT NOT NULL,
  slug TEXT NOT NULL,
  term_order INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('live', 'retired')),
  PRIMARY KEY (taxonomy_id, term_id),
  FOREIGN KEY (taxonomy_id, term_id) REFERENCES taxonomy_term_identities (taxonomy_id, term_id)
) STRICT;

-- Retired terms remain historical catalog records, so only live terms constrain selection.
CREATE UNIQUE INDEX taxonomy_terms_live_slug_unique
  ON taxonomy_terms (taxonomy_id, slug)
  WHERE state = 'live';
CREATE UNIQUE INDEX taxonomy_terms_live_order_unique
  ON taxonomy_terms (taxonomy_id, term_order)
  WHERE state = 'live';

CREATE TABLE revision_taxonomy_bindings (
  entry_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  taxonomy_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  evidence_bytes BLOB NOT NULL,
  evidence_digest TEXT NOT NULL,
  PRIMARY KEY (entry_id, revision_id, taxonomy_id, term_id),
  FOREIGN KEY (entry_id, revision_id) REFERENCES revisions (entry_id, revision_id),
  FOREIGN KEY (taxonomy_id, term_id) REFERENCES taxonomy_terms (taxonomy_id, term_id)
) STRICT;

CREATE INDEX revision_taxonomy_bindings_term_idx
  ON revision_taxonomy_bindings (taxonomy_id, term_id);

CREATE TRIGGER immutable_revision_taxonomy_bindings_update
BEFORE UPDATE ON revision_taxonomy_bindings
BEGIN
  SELECT RAISE(ABORT, 'immutable_revision_taxonomy_bindings_update');
END;

CREATE TRIGGER immutable_revision_taxonomy_bindings_delete
BEFORE DELETE ON revision_taxonomy_bindings
BEGIN
  SELECT RAISE(ABORT, 'immutable_revision_taxonomy_bindings_delete');
END;
