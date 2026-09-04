import { lstatSync, readdirSync, realpathSync, type Dirent } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

export type ArchitectureRule =
  | "ROOT_TREE"
  | "PUBLIC_ENTRYPOINT"
  | "DEEP_IMPORT"
  | "FOUNDATION_ISOLATION"
  | "OWNER_DIRECTION"
  | "APP_COMPOSITION"
  | "HOST_EXTENSION_ISOLATION"
  | "RENDERER_THEME_ISOLATION"
  | "EXTENSION_TYPE_ONLY"
  | "RUNTIME_SELF_CONTAINED"
  | "CATCH_ALL_ROOT"
  | "LEGACY_FLAT_ROOT"
  | "NAMING"
  | "EMPTY_PRODUCTION_SOURCE"
  | "UNRESOLVED_IMPORT"
  | "SYMLINK_ESCAPE"
  | "PARSE_ERROR";

export type ArchitectureOwner =
  | "core/foundation"
  | "core/content"
  | "core/persistence"
  | "core/application"
  | "core/site-definition"
  | "core/media"
  | "core/plugin-host"
  | "core/theme-host"
  | "core/projection"
  | "core/renderer"
  | "core/delivery"
  | "apps"
  | "extension-plugin"
  | "extension-theme"
  | "tests"
  | "scripts"
  | "db-migrations"
  | "external"
  | "unknown";

export type ArchitectureViolation = Readonly<{
  ruleId: ArchitectureRule;
  file: string;
  line: number;
  column: number;
  specifier: string | null;
  importer: ArchitectureOwner | null;
  imported: ArchitectureOwner | null;
}>;

export type ArchitectureCheckInput = Readonly<{
  rootDir: string;
  include?: readonly string[];
  exclude?: readonly string[];
}>;

export type ArchitectureCheckOutput = Readonly<{
  ok: boolean;
  filesScanned: number;
  violations: readonly ArchitectureViolation[];
}>;

export type DiagnosticFormat = "text" | "json";

export type ArchitectureIo = Readonly<{
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}>;

// 掃描整個 repository，否則 semantic root 以外的檔案不會被讀到，
// ROOT_TREE／LEGACY_FLAT_ROOT／CATCH_ALL_ROOT 將永遠無法觸發。
const defaultIncludes = ["**/*.ts", "**/*.sql"];

const defaultExcludes = [
  "node_modules",
  "dist",
  "logs",
  "draft",
  "source-drafts",
  "dev-hub-*",
  "project-*",
  ".planning",
  ".dev-hub",
];

const catchAllRoots = new Set(["common", "utils", "services", "repositories"]);
const legacyFlatRoots = new Set(["plugin-host", "plugins", "themes", "renderer"]);

const coreOwners = new Set<ArchitectureOwner>([
  "core/foundation",
  "core/content",
  "core/persistence",
  "core/application",
  "core/site-definition",
  "core/media",
  "core/plugin-host",
  "core/theme-host",
  "core/projection",
  "core/renderer",
  "core/delivery",
]);

/** contracts/README.md §6 的 owner 依賴矩陣；每個 owner 額外隱含可依賴自身與 Foundation。 */
const ownerDependencies: Readonly<Record<string, readonly ArchitectureOwner[]>> = {
  "core/foundation": [],
  "core/content": [],
  "core/persistence": [],
  "core/site-definition": [],
  "core/media": [],
  "core/plugin-host": [],
  "core/theme-host": [],
  "core/application": [
    "core/content",
    "core/persistence",
    "core/site-definition",
    "core/media",
    "core/plugin-host",
    "core/theme-host",
  ],
  "core/projection": [
    "core/content",
    "core/persistence",
    "core/site-definition",
    "core/media",
    "core/plugin-host",
    "core/theme-host",
  ],
  "core/renderer": ["core/projection"],
  "core/delivery": ["core/projection", "core/renderer"],
};

/** Foundation 唯一允許的外部 runtime 套件。 */
const foundationExternals = new Set(["json-canonicalize"]);

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const migrationName = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function relative(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}

export function ownerOf(file: string): ArchitectureOwner {
  const parts = file.split("/");
  if (parts[0] === "core" && parts[1] !== undefined) {
    const owner = `core/${parts[1]}` as ArchitectureOwner;
    return coreOwners.has(owner) ? owner : "unknown";
  }
  if (parts[0] === "apps") return "apps";
  if (parts[0] === "extensions") {
    return parts[1] === "plugins" ? "extension-plugin" : parts[1] === "themes" ? "extension-theme" : "unknown";
  }
  if (parts[0] === "tests") return "tests";
  if (parts[0] === "scripts") return "scripts";
  if (parts[0] === "db") return "db-migrations";
  return "unknown";
}

/**
 * 回傳檔案所屬的 public unit 根目錄（core owner、app、Plugin／Theme package）。
 * `tests/`、`scripts/`、`db/` 不是 public unit，回傳 null。
 */
export function unitOf(file: string): string | null {
  const parts = file.split("/");
  if (parts[0] === "core" && parts[1] !== undefined) return `core/${parts[1]}`;
  if (parts[0] === "apps" && parts[1] !== undefined) return `apps/${parts[1]}`;
  if (parts[0] === "extensions" && parts[1] !== undefined && parts[2] !== undefined) {
    return `extensions/${parts[1]}/${parts[2]}`;
  }
  return null;
}

function isExtension(owner: ArchitectureOwner): boolean {
  return owner === "extension-plugin" || owner === "extension-theme";
}

function violation(
  ruleId: ArchitectureRule,
  file: string,
  specifier: string | null,
  importer: ArchitectureOwner | null,
  imported: ArchitectureOwner | null,
  source?: ts.SourceFile,
  start?: number,
): ArchitectureViolation {
  const position =
    source !== undefined && start !== undefined
      ? source.getLineAndCharacterOfPosition(start)
      : { line: 0, character: 0 };
  return { ruleId, file, line: position.line + 1, column: position.character + 1, specifier, importer, imported };
}

/** import／export 宣告是否完全 type-only（含逐項 `import { type X }`）。 */
function isTypeOnlyEdge(node: ts.Node): boolean {
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const bindings = node.exportClause;
    return (
      bindings !== undefined &&
      ts.isNamedExports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((item) => item.isTypeOnly)
    );
  }
  if (!ts.isImportDeclaration(node)) return false;
  const clause = node.importClause;
  if (clause === undefined) return false; // side-effect import 一定是 runtime value 邊
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((item) => item.isTypeOnly)
  );
}

function checkNaming(file: string): boolean {
  const parts = file.split("/");
  const basename = parts[parts.length - 1] ?? "";
  for (const segment of parts.slice(0, -1)) {
    if (!kebabCase.test(segment)) return false;
  }
  if (basename.endsWith(".sql")) return migrationName.test(basename);
  if (parts[0] === "tests") return /^[a-z0-9]+(?:-[a-z0-9]+)*\.test\.ts$/.test(basename);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(basename);
}

/** 掃描 semantic root 下的 symlink，回報 realpath 逃出 repository 的項目。 */
function collectSymlinkEscapes(root: string, rootReal: string): ArchitectureViolation[] {
  const found: ArchitectureViolation[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let resolved: string | null = null;
        try {
          resolved = realpathSync(full);
        } catch {
          resolved = null;
        }
        if (resolved === null || !isInside(rootReal, resolved)) {
          found.push(violation("SYMLINK_ESCAPE", relative(root, full), null, ownerOf(relative(root, full)), null));
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (defaultExcludes.some((pattern) => matchesExcludePattern(pattern, entry.name))) continue;
        walk(full);
      }
    }
  };
  for (const semanticRoot of ["core", "apps", "extensions", "tests", "scripts", "db"]) {
    const dir = path.join(root, semanticRoot);
    try {
      if (!lstatSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(dir);
  }
  return found;
}

function matchesExcludePattern(pattern: string, name: string): boolean {
  if (!pattern.includes("*")) return pattern === name;
  const prefix = pattern.slice(0, pattern.indexOf("*"));
  return name.startsWith(prefix);
}

function isInside(rootReal: string, candidate: string): boolean {
  const rel = path.relative(rootReal, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

type EdgeContext = Readonly<{
  importerFile: string;
  importer: ArchitectureOwner;
  importerUnit: string | null;
  importedFile: string;
  imported: ArchitectureOwner;
  importedUnit: string | null;
  typeOnly: boolean;
}>;

/**
 * 依固定 precedence 判斷單一 import edge，最多回報一條規則，讓輸出具決定性。
 */
export function classifyEdge(edge: EdgeContext): ArchitectureRule | null {
  const { importer, imported, importerUnit, importedUnit, typeOnly } = edge;
  const sameUnit = importerUnit !== null && importerUnit === importedUnit;

  // tests／scripts 是驗證工具，允許直接觸及被測實作。
  if (importer === "tests" || importer === "scripts") return null;

  // Foundation 只可依賴自身。
  if (importer === "core/foundation" && imported !== "core/foundation") return "FOUNDATION_ISOLATION";

  // Extension source 只能 type-import 自身 kind 的 public contract entry，且不得跨 package 取 runtime value。
  if (isExtension(importer) && !sameUnit) {
    if (!typeOnly) return "RUNTIME_SELF_CONTAINED";
    const allowedEntry = importer === "extension-plugin" ? "core/plugin-host" : "core/renderer";
    if (importedUnit !== allowedEntry) return "EXTENSION_TYPE_ONLY";
    if (edge.importedFile !== `${allowedEntry}/index.ts`) return "DEEP_IMPORT";
    return null;
  }

  // core 與 extensions 都不得依賴 apps。
  if (imported === "apps" && importer !== "apps") return "APP_COMPOSITION";

  // Host／Renderer 不得反向依賴 repository extension source。
  if (isExtension(imported)) {
    if (importer === "core/plugin-host" || importer === "core/theme-host") return "HOST_EXTENSION_ISOLATION";
    if (importer === "core/renderer") return "RENDERER_THEME_ISOLATION";
    if (coreOwners.has(importer) || importer === "apps") return "OWNER_DIRECTION";
  }

  if (sameUnit) return null; // package-local import 一律允許

  // 跨 unit 只能匯入該 unit 的根 index.ts。
  if (importedUnit !== null && edge.importedFile !== `${importedUnit}/index.ts`) return "DEEP_IMPORT";
  if (importedUnit === null) return "OWNER_DIRECTION"; // 指向 tests/scripts/db 等非 public unit

  if (importer === "apps") {
    return coreOwners.has(imported) ? null : "APP_COMPOSITION";
  }

  if (coreOwners.has(importer)) {
    if (imported === "core/foundation") return null;
    const allowed = ownerDependencies[importer] ?? [];
    return allowed.includes(imported) ? null : "OWNER_DIRECTION";
  }

  return "OWNER_DIRECTION";
}

export async function checkArchitecture(input: ArchitectureCheckInput): Promise<ArchitectureCheckOutput> {
  const root = path.resolve(input.rootDir);
  let rootReal = root;
  try {
    rootReal = realpathSync(root);
  } catch {
    rootReal = root;
  }

  const files = ts.sys
    .readDirectory(root, [".ts", ".sql"], input.exclude ?? defaultExcludes, input.include ?? defaultIncludes)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));

  const violations: ArchitectureViolation[] = [...collectSymlinkEscapes(root, rootReal)];

  const program = ts.createProgram(
    files.filter((file) => file.endsWith(".ts")),
    {
      target: ts.ScriptTarget.ES2024,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
    },
  );

  const scannedUnits = new Map<string, boolean>();

  for (const fileName of files) {
    const file = relative(root, fileName);
    const importer = ownerOf(file);
    const segment = file.split("/")[0] ?? "";

    if (legacyFlatRoots.has(segment)) {
      violations.push(violation("LEGACY_FLAT_ROOT", file, null, importer, null));
      continue;
    }
    if (catchAllRoots.has(segment)) {
      violations.push(violation("CATCH_ALL_ROOT", file, null, importer, null));
      continue;
    }
    const inSemanticRoot =
      segment === "core" || segment === "apps" || segment === "extensions" || segment === "tests" || segment === "scripts";
    if (!(inSemanticRoot || file.startsWith("db/migrations/"))) {
      violations.push(violation("ROOT_TREE", file, null, importer, null));
      continue;
    }
    if (importer === "unknown") {
      // core/<unknown-owner>、extensions/<unknown-group> 等不在契約列舉內的位置。
      violations.push(violation("ROOT_TREE", file, null, importer, null));
      continue;
    }

    if (!checkNaming(file)) violations.push(violation("NAMING", file, null, importer, null));

    const unit = unitOf(file);
    if (unit !== null && file.endsWith(".ts")) {
      scannedUnits.set(unit, (scannedUnits.get(unit) ?? false) || file === `${unit}/index.ts`);
    }

    if (!fileName.endsWith(".ts")) continue;
    const source = program.getSourceFile(fileName);
    if (source === undefined) continue;

    for (const diagnostic of program.getSyntacticDiagnostics(source)) {
      violations.push(violation("PARSE_ERROR", file, null, importer, null, source, diagnostic.start ?? 0));
    }

    const visit = (node: ts.Node): void => {
      const module = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
          ? node.moduleReference.expression
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;

      if (module !== undefined) {
        // PluginHost 與 Renderer 的唯一例外：`url` 由已驗證的 entry bytes 與 manifest hash 組成，
        // 不能以 static specifier 表示，且不得重新開啟 installed pathname。
        const verifiedRuntimeModuleLoad =
          (file === "core/plugin-host/module-loader.ts" || file === "core/renderer/module-loader.ts") &&
          ts.isIdentifier(module) &&
          module.text === "url";
        if (!ts.isStringLiteralLike(module)) {
          if (!verifiedRuntimeModuleLoad) {
            violations.push(violation("UNRESOLVED_IMPORT", file, null, importer, null, source, node.getStart(source)));
          }
        } else {
          const specifier = module.text;
          const start = module.getStart(source);
          const isBare = !specifier.startsWith(".") && !specifier.startsWith("/");
          if (isBare) {
            if (
              importer === "core/foundation" &&
              !specifier.startsWith("node:") &&
              !foundationExternals.has(specifier)
            ) {
              violations.push(violation("FOUNDATION_ISOLATION", file, specifier, importer, "external", source, start));
            }
          } else {
            const resolved = ts.resolveModuleName(specifier, fileName, program.getCompilerOptions(), ts.sys)
              .resolvedModule?.resolvedFileName;
            if (resolved === undefined) {
              violations.push(violation("UNRESOLVED_IMPORT", file, specifier, importer, null, source, start));
            } else {
              let resolvedReal = resolved;
              try {
                resolvedReal = realpathSync(resolved);
              } catch {
                resolvedReal = resolved;
              }
              if (!isInside(rootReal, resolvedReal)) {
                violations.push(violation("SYMLINK_ESCAPE", file, specifier, importer, null, source, start));
              } else {
                const importedFile = relative(root, resolved);
                const imported = ownerOf(importedFile);
                const ruleId = classifyEdge({
                  importerFile: file,
                  importer,
                  importerUnit: unitOf(file),
                  importedFile,
                  imported,
                  importedUnit: unitOf(importedFile),
                  typeOnly: isTypeOnlyEdge(node),
                });
                if (ruleId !== null) {
                  violations.push(violation(ruleId, file, specifier, importer, imported, source, start));
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }

  for (const [unit, hasEntrypoint] of scannedUnits) {
    if (!hasEntrypoint) violations.push(violation("PUBLIC_ENTRYPOINT", unit, null, ownerOf(unit), null));
  }

  const production = files.filter(
    (file) => /^(core|apps|extensions)\//.test(relative(root, file)) && file.endsWith(".ts"),
  );
  if (production.length === 0) violations.push(violation("EMPTY_PRODUCTION_SOURCE", ".", null, null, null));

  violations.sort((a, b) =>
    `${a.file} ${String(a.line).padStart(6, "0")} ${String(a.column).padStart(6, "0")} ${a.ruleId} ${a.specifier}`.localeCompare(
      `${b.file} ${String(b.line).padStart(6, "0")} ${String(b.column).padStart(6, "0")} ${b.ruleId} ${b.specifier}`,
    ),
  );

  return { ok: violations.length === 0, filesScanned: files.length, violations };
}

export function formatDiagnostics(output: ArchitectureCheckOutput, format: DiagnosticFormat): string {
  if (format === "json") return `${JSON.stringify(output, null, 2)}\n`;
  return output.violations
    .map(
      (item) =>
        `${item.file}:${item.line}:${item.column} [${item.ruleId}] specifier=${JSON.stringify(item.specifier)} importer=${JSON.stringify(item.importer)} imported=${JSON.stringify(item.imported)}\n`,
    )
    .join("");
}

export async function main(
  argv: readonly string[],
  io: ArchitectureIo = {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
): Promise<0 | 1 | 2> {
  let format: DiagnosticFormat = "text";
  let rootDir = io.cwd;
  try {
    const parsed = parseArgs({ args: [...argv], options: { root: { type: "string" }, format: { type: "string" } }, strict: true });
    const requested = parsed.values.format ?? "text";
    if (requested !== "text" && requested !== "json") throw new Error(`unsupported --format: ${requested}`);
    format = requested;
    rootDir = parsed.values.root ?? io.cwd;
  } catch (error) {
    io.stderr(`ARCHITECTURE_CHECK_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  try {
    const output = await checkArchitecture({ rootDir });
    const text = formatDiagnostics(output, format);
    (format === "json" ? io.stdout : io.stderr)(text);
    return output.ok ? 0 : 1;
  } catch (error) {
    io.stderr(`ARCHITECTURE_CHECK_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
