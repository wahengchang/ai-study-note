CREATE TABLE theme_activation_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO theme_activation_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22636f6e7472616374223a227468656d652d61637469766174696f6e2d73746174652f7631227d',
  'sha256:2d3bd9fd385ef0f4dad9d7026da41a3a39fa04850e0e05ea98322cf5d0230430'
);

CREATE TRIGGER prevent_theme_activation_state_delete
BEFORE DELETE ON theme_activation_state
BEGIN
  SELECT RAISE(ABORT, 'theme activation singleton is immutable');
END;
