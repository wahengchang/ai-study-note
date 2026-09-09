CREATE TABLE plugin_settings_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_bytes BLOB NOT NULL,
  state_digest TEXT NOT NULL
) STRICT;

INSERT INTO plugin_settings_state (singleton, state_bytes, state_digest) VALUES (
  1,
  X'7b22636f6e7472616374223a22706c7567696e2d73657474696e67732d73746174652f7631222c227265636f726473223a5b5d7d',
  'sha256:c890fac912180a420c855ee7e05adf0dc94d7e8ef0fba033604dc4156f0a013e'
);

CREATE TRIGGER prevent_plugin_settings_state_delete
BEFORE DELETE ON plugin_settings_state
BEGIN
  SELECT RAISE(ABORT, 'plugin settings singleton is immutable');
END;
