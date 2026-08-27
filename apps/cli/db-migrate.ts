import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { migrateDatabase } from "../../core/persistence/index.js";

export type CliIo = Readonly<{
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}>;

export function runDbMigrate(argv: readonly string[], io: CliIo): number {
  let databasePath: string | undefined;
  try {
    const parsed = parseArgs({
      args: argv,
      options: { database: { type: "string" } },
      allowPositionals: false,
      strict: true,
    });
    databasePath = parsed.values.database;
  } catch {
    io.stderr("DB_MIGRATE_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }

  if (databasePath === undefined || databasePath.trim().length === 0 || databasePath === ":memory:") {
    io.stderr("DB_MIGRATE_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }

  const result = migrateDatabase({ databasePath });
  if (!result.ok) {
    io.stderr(`DB_MIGRATE_FAILED code=${result.error.code}\n`);
    return 1;
  }
  io.stdout(`DB_MIGRATE_OK applied=${result.value.appliedMigrationIds.length} current=${result.value.currentMigrationId}\n`);
  return 0;
}

export function main(): void {
  process.exitCode = runDbMigrate(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main();
