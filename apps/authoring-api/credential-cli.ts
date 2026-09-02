import { pathToFileURL } from "node:url";

import { createLocalAuthoringCredentialAuthority } from "./credential-store.js";

export type CredentialCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

export async function runCredentialCli(argv: readonly string[], io: CredentialCliIo, environment: Readonly<{ homeDirectory: string; xdgConfigHome?: string }>): Promise<number> {
  if (argv.length !== 1 || !["provision", "rotate", "revoke", "reprovision"].includes(argv[0] ?? "")) {
    io.stderr("AUTHORING_CREDENTIAL_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }
  const action = argv[0] as "provision" | "rotate" | "revoke" | "reprovision";
  const result = await createLocalAuthoringCredentialAuthority(environment).transition(action);
  if (!result.ok) {
    io.stderr(`AUTHORING_CREDENTIAL_FAILED code=${result.error.code}\n`);
    return 1;
  }
  io.stdout(`AUTHORING_CREDENTIAL_OK action=${action} generation=${result.value.generation} status=${result.value.status}\n`);
  return 0;
}

export async function main(): Promise<void> {
  process.exitCode = await runCredentialCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  }, {
    homeDirectory: process.env.HOME ?? "",
    ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: process.env.XDG_CONFIG_HOME }),
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
