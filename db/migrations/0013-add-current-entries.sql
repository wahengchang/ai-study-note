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
