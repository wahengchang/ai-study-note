export type MessageRemediation = Readonly<{
  kind: "message";
  message: string;
}>;

export type CommandRemediation = Readonly<{
  kind: "command";
  command: string;
  subjectIds: readonly string[];
}>;

export type CoreFailure = Readonly<{
  code: "INVALID_CANONICAL_JSON";
  owner: "CoreFoundation";
  subjectIds: readonly string[];
  remediation: MessageRemediation | CommandRemediation;
}>;

export type CoreResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: CoreFailure }>;

export function invalidCanonicalJsonFailure(): CoreFailure {
  return {
    code: "INVALID_CANONICAL_JSON",
    owner: "CoreFoundation",
    subjectIds: [],
    remediation: {
      kind: "message",
      message: "請提供有效的 I-JSON 值。",
    },
  };
}
