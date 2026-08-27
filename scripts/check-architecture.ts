import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

export type ArchitectureRule = "ROOT_TREE" | "PUBLIC_ENTRYPOINT" | "DEEP_IMPORT" | "FOUNDATION_ISOLATION" | "OWNER_DIRECTION" | "APP_COMPOSITION" | "HOST_EXTENSION_ISOLATION" | "RENDERER_THEME_ISOLATION" | "EXTENSION_TYPE_ONLY" | "RUNTIME_SELF_CONTAINED" | "CATCH_ALL_ROOT" | "LEGACY_FLAT_ROOT" | "NAMING" | "EMPTY_PRODUCTION_SOURCE" | "UNRESOLVED_IMPORT" | "SYMLINK_ESCAPE" | "PARSE_ERROR";
export type ArchitectureOwner = "core/foundation" | "core/content" | "core/persistence" | "core/application" | "core/site-definition" | "core/media" | "core/plugin-host" | "core/theme-host" | "core/projection" | "core/renderer" | "core/delivery" | "apps" | "extension-plugin" | "extension-theme" | "tests" | "scripts" | "db-migrations" | "external" | "unknown";
export type ArchitectureViolation = Readonly<{ ruleId: ArchitectureRule; file: string; line: number; column: number; specifier: string | null; importer: ArchitectureOwner | null; imported: ArchitectureOwner | null }>;
export type ArchitectureCheckInput = Readonly<{ rootDir: string; include?: readonly string[]; exclude?: readonly string[] }>;
export type ArchitectureCheckOutput = Readonly<{ ok: boolean; filesScanned: number; violations: readonly ArchitectureViolation[] }>;
export type DiagnosticFormat = "text" | "json";
export type ArchitectureIo = Readonly<{ cwd: string; stdout: (text: string) => void; stderr: (text: string) => void }>;

const includes = ["core/**/*.ts", "apps/**/*.ts", "extensions/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "db/migrations/*.sql"];
const catches = new Set(["common", "utils", "services", "repositories"]);
const legacy = new Set(["plugin-host", "plugins", "themes", "renderer"]);
const coreOwners = new Set<ArchitectureOwner>(["core/foundation", "core/content", "core/persistence", "core/application", "core/site-definition", "core/media", "core/plugin-host", "core/theme-host", "core/projection", "core/renderer", "core/delivery"]);

function relative(root: string, file: string): string { return path.relative(root, file).split(path.sep).join("/"); }
function ownerOf(file: string): ArchitectureOwner {
  const parts = file.split("/");
  if (parts[0] === "core" && parts[1] !== undefined) return (`core/${parts[1]}` as ArchitectureOwner);
  if (parts[0] === "apps") return "apps";
  if (parts[0] === "extensions") return parts[1] === "plugins" ? "extension-plugin" : parts[1] === "themes" ? "extension-theme" : "unknown";
  if (parts[0] === "tests") return "tests"; if (parts[0] === "scripts") return "scripts"; if (parts[0] === "db") return "db-migrations"; return "unknown";
}
function violation(ruleId: ArchitectureRule, file: string, specifier: string | null, importer: ArchitectureOwner | null, imported: ArchitectureOwner | null, source?: ts.SourceFile, node?: ts.Node): ArchitectureViolation {
  const position = source !== undefined && node !== undefined ? source.getLineAndCharacterOfPosition(node.getStart(source)) : { line: 0, character: 0 };
  return { ruleId, file, line: position.line + 1, column: position.character + 1, specifier, importer, imported };
}
function extensionTypeOnly(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node) && node.isTypeOnly) return true;
  const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
  return clause?.isTypeOnly === true || (clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((item) => item.isTypeOnly));
}
export async function checkArchitecture(input: ArchitectureCheckInput): Promise<ArchitectureCheckOutput> {
  const root = path.resolve(input.rootDir);
  const files = ts.sys.readDirectory(root, [".ts", ".sql"], ["node_modules", "dist", "logs", "draft", "source-drafts", "dev-hub", "project", ".planning", ".dev-hub"], input.include ?? includes).filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
  const violations: ArchitectureViolation[] = [];
  const program = ts.createProgram(files.filter((file) => file.endsWith(".ts")), { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noEmit: true });
  for (const fileName of files) {
    const file = relative(root, fileName); const importer = ownerOf(file); const segment = file.split("/")[0] ?? "";
    if (legacy.has(segment)) { violations.push(violation("LEGACY_FLAT_ROOT", file, null, importer, null)); continue; }
    if (catches.has(segment)) { violations.push(violation("CATCH_ALL_ROOT", file, null, importer, null)); continue; }
    if (!(segment === "core" || segment === "apps" || segment === "extensions" || segment === "tests" || segment === "scripts" || file.startsWith("db/migrations/"))) { violations.push(violation("ROOT_TREE", file, null, importer, null)); continue; }
    if (!fileName.endsWith(".ts")) continue;
    const source = program.getSourceFile(fileName); if (source === undefined) continue;
    for (const diagnostic of program.getSyntacticDiagnostics(source)) violations.push(violation("PARSE_ERROR", file, null, importer, null, source, { getStart: () => diagnostic.start ?? 0 } as ts.Node));
    const visit = (node: ts.Node): void => {
      const module = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (module !== undefined) {
        if (!ts.isStringLiteralLike(module)) { violations.push(violation("UNRESOLVED_IMPORT", file, null, importer, null, source, node)); }
        else { const specifier = module.text; if (specifier.startsWith("node:") || !specifier.startsWith(".") && !specifier.startsWith("/")) { if (importer === "core/foundation" && !specifier.startsWith("node:") && specifier !== "json-canonicalize") violations.push(violation("FOUNDATION_ISOLATION", file, specifier, importer, "external", source, module)); }
          else { const target = path.resolve(path.dirname(fileName), specifier); const targetFile = ts.resolveModuleName(specifier, fileName, program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName; if (targetFile === undefined) violations.push(violation("UNRESOLVED_IMPORT", file, specifier, importer, null, source, module)); else { const imported = ownerOf(relative(root, targetFile)); if (importer === "core/foundation" && imported !== "core/foundation") violations.push(violation("FOUNDATION_ISOLATION", file, specifier, importer, imported, source, module)); else if ((importer === "extension-plugin" || importer === "extension-theme") && !extensionTypeOnly(node as ts.ImportDeclaration)) violations.push(violation("EXTENSION_TYPE_ONLY", file, specifier, importer, imported, source, module)); else if (importer !== imported && coreOwners.has(importer) && imported !== "core/foundation") violations.push(violation("OWNER_DIRECTION", file, specifier, importer, imported, source, module)); } } }
      } ts.forEachChild(node, visit);
    }; ts.forEachChild(source, visit);
  }
  const production = files.filter((file) => /\/(core|apps|extensions)\//.test(`/${relative(root, file)}`) && file.endsWith(".ts")); if (production.length === 0) violations.push(violation("EMPTY_PRODUCTION_SOURCE", ".", null, null, null));
  violations.sort((a, b) => `${a.file}\0${a.line}\0${a.column}\0${a.ruleId}\0${a.specifier}`.localeCompare(`${b.file}\0${b.line}\0${b.column}\0${b.ruleId}\0${b.specifier}`)); return { ok: violations.length === 0, filesScanned: files.length, violations };
}
export function formatDiagnostics(output: ArchitectureCheckOutput, format: DiagnosticFormat): string { if (format === "json") return `${JSON.stringify(output, null, 2)}\n`; return output.violations.map((item) => `${item.file}:${item.line}:${item.column} [${item.ruleId}] specifier=${JSON.stringify(item.specifier)} importer=${JSON.stringify(item.importer)} imported=${JSON.stringify(item.imported)}\n`).join(""); }
export async function main(argv: readonly string[], io: ArchitectureIo = { cwd: process.cwd(), stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) }): Promise<0 | 1 | 2> { try { const parsed = parseArgs({ args: argv, options: { root: { type: "string" }, format: { type: "string" } }, strict: true }); const format = parsed.values.format ?? "text"; if (format !== "text" && format !== "json") throw new Error(); const output = await checkArchitecture({ rootDir: parsed.values.root ?? io.cwd }); const text = formatDiagnostics(output, format); (format === "json" ? io.stdout : io.stderr)(text); return output.ok ? 0 : 1; } catch { io.stderr("ARCHITECTURE_CHECK_ERROR\n"); return 2; } }
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
