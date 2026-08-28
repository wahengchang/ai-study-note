CREATE TABLE route_claims (
  graph TEXT NOT NULL CHECK (graph IN ('current', 'published')),
  normalized_route TEXT NOT NULL CHECK (length(normalized_route) > 0),
  owner_entry_id TEXT NOT NULL CHECK (length(owner_entry_id) > 0),
  source_revision_id TEXT NOT NULL CHECK (length(source_revision_id) > 0),
  PRIMARY KEY (graph, normalized_route),
  UNIQUE (graph, owner_entry_id),
  FOREIGN KEY (owner_entry_id, source_revision_id) REFERENCES revisions (entry_id, revision_id)
) STRICT;
