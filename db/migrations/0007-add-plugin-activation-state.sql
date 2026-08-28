CREATE TABLE plugin_activation_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO plugin_activation_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22616374697665223a5b5d2c22636f6e7472616374223a22706c7567696e2d61637469766174696f6e2d73746174652f7632222c22726561637469766174696f6e5265717569726564223a5b5d7d',
  'sha256:985e60b44ed61f591efd0bc40828adf42164e10c05892a88860896899d40c7a7'
);

CREATE TRIGGER prevent_plugin_activation_state_delete
BEFORE DELETE ON plugin_activation_state
BEGIN
  SELECT RAISE(ABORT, 'plugin activation singleton is immutable');
END;
