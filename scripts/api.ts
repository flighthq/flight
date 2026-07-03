import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import type { FunctionDeclaration } from 'ts-morph';
import { Node, Project } from 'ts-morph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

const rawArgs = process.argv.slice(2);
const options = parseArgs(rawArgs);
const colors = (pc as typeof pc & { createColors: (enabled?: boolean) => typeof pc }).createColors(!options.noColor);

interface PackageInfo {
  name: string;
  description: string;
  dir: string;
  indexPath: string;
  deps: string[];
}

interface ApiFunction {
  name: string;
  signatures: string[];
  source: string;
}

interface ApiPackage {
  name: string;
  description: string;
  functions: ApiFunction[];
}

function findPackages(): Map<string, PackageInfo> {
  const found = new Map<string, PackageInfo>();

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const pkgDir = join(packagesDir, entry.name);
    const pkgPath = join(pkgDir, 'package.json');
    const indexPath = join(pkgDir, 'src', 'index.ts');
    if (!existsSync(pkgPath) || !existsSync(indexPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    if (!pkg.name?.startsWith('@flighthq/') || pkg.name === '@flighthq/sdk') continue;

    const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies };
    const deps = Object.keys(allDeps).filter((dep) => dep.startsWith('@flighthq/') && dep !== '@flighthq/sdk');
    found.set(pkg.name, { name: pkg.name, description: pkg.description ?? '', dir: pkgDir, indexPath, deps });
  }

  return found;
}

function topoSort(pkgMap: Map<string, PackageInfo>): PackageInfo[] {
  const sorted: PackageInfo[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const pkg = pkgMap.get(name);
    if (!pkg) return;
    for (const dep of [...pkg.deps].sort()) visit(dep);
    sorted.push(pkg);
  }

  for (const name of [...pkgMap.keys()].sort()) visit(name);
  return sorted;
}

function getRelativeSourcePath(node: Node): string {
  return relative(root, node.getSourceFile().getFilePath()).replaceAll('\\', '/');
}

function getFunctionName(_node: Node, exportedName: string): string {
  return exportedName;
}

function getFunctionSignatures(node: Node, fallback: string): string[] {
  if (Node.isFunctionDeclaration(node)) {
    const allDecls = node.getSymbol()?.getDeclarations().filter(Node.isFunctionDeclaration) ?? [node];
    const overloads = allDecls.filter((d) => !d.hasBody());
    const declarations = overloads.length > 0 ? overloads : allDecls;
    return [...new Set(declarations.map((decl) => formatFunctionDeclaration(decl, fallback)))];
  }

  if (Node.isVariableDeclaration(node)) {
    const name = node.getName();
    const initializer = node.getInitializer();
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      const params = initializer.getParameters().map((param) => param.getText());
      const returnType = initializer.getReturnTypeNode()?.getText() ?? initializer.getReturnType().getText(initializer);
      return [`${name}(${params.join(', ')}): ${returnType}`];
    }
  }

  const type = node.getType().getText(node);
  return [`${fallback}: ${type}`];
}

function formatFunctionDeclaration(node: FunctionDeclaration, exportedName: string): string {
  const name = exportedName;
  const typeParameters = node.getTypeParameters().map((param) => param.getText());
  const params = node.getParameters().map((param) => param.getText());
  const returnType = node.getReturnTypeNode()?.getText() ?? node.getReturnType().getText(node);
  const typeParamText = typeParameters.length > 0 ? `<${typeParameters.join(', ')}>` : '';
  return `${name}${typeParamText}(${params.join(', ')}): ${returnType}`;
}

function isExportedFunctionLike(node: Node): boolean {
  if (Node.isFunctionDeclaration(node)) return true;
  if (!Node.isVariableDeclaration(node)) return false;

  const initializer = node.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));
}

function collectPackageApi(project: Project, pkg: PackageInfo): ApiPackage {
  const sourceFile = project.addSourceFileAtPathIfExists(pkg.indexPath) ?? project.addSourceFileAtPath(pkg.indexPath);
  const functions: ApiFunction[] = [];
  const seen = new Set<string>();

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const declaration = declarations.find(isExportedFunctionLike);
    if (!declaration) continue;

    const functionName = getFunctionName(declaration, name);
    const signatures = getFunctionSignatures(declaration, name);
    const key = `${functionName}\n${signatures.join('\n')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    functions.push({
      name: functionName,
      signatures,
      source: getRelativeSourcePath(declaration),
    });
  }

  functions.sort((a, b) => a.name.localeCompare(b.name));
  return { name: pkg.name, description: pkg.description, functions };
}

type ColorFn = (s: string) => string;

const PALETTE: Array<{ bg: ColorFn; fg: ColorFn }> = [
  { bg: colors.bgCyan, fg: colors.cyan },
  { bg: colors.bgMagenta, fg: colors.magenta },
  { bg: colors.bgBlue, fg: colors.blue },
  { bg: colors.bgGreen, fg: colors.green },
  { bg: colors.bgYellow, fg: colors.yellow },
];

function printConsole(packages: ApiPackage[]): void {
  let colorIndex = 0;
  for (const pkg of packages) {
    if (pkg.functions.length === 0) continue;

    const color = PALETTE[colorIndex % PALETTE.length];
    colorIndex++;

    console.log(color.bg(` ${pkg.name} `));
    for (const fn of pkg.functions) {
      for (const signature of fn.signatures) {
        console.log(` ${colors.bold(color.fg('-'))} ${colorSignature(signature, color.fg)}`);
      }
    }
    console.log('');
  }
}

function colorSignature(signature: string, nameColor: ColorFn): string {
  const paren = signature.indexOf('(');
  const name = paren === -1 ? signature : signature.slice(0, paren);
  const closeParen = paren === -1 ? -1 : findMatchingParen(signature, paren);
  const params = paren === -1 || closeParen === -1 ? '' : signature.slice(paren + 1, closeParen);
  const returnType =
    closeParen !== -1 && signature.slice(closeParen, closeParen + 3) === '): ' ? signature.slice(closeParen + 3) : '';
  const coloredName = colorFunctionName(name, nameColor);

  if (paren === -1) return coloredName;

  const coloredParams = splitTopLevel(params, ',')
    .map((param) => colorParameter(param, nameColor))
    .join(nameColor(', '));
  const prefix = `${coloredName}${nameColor('(')}${coloredParams}${nameColor(')')}`;
  if (returnType === '') return prefix;

  return `${prefix}${nameColor(':')} ${colors.dim(colors.bold(nameColor(returnType)))}`;
}

function colorFunctionName(name: string, nameColor: ColorFn): string {
  const genericStart = name.indexOf('<');
  if (genericStart === -1) return colors.bold(nameColor(name));

  return colors.bold(nameColor(name.slice(0, genericStart))) + colorTypeParameters(name.slice(genericStart), nameColor);
}

function colorTypeParameters(source: string, nameColor: ColorFn): string {
  return colors.dim(colors.bold(nameColor(source)));
}

function colorParameter(param: string, nameColor: ColorFn): string {
  const trimmed = param.trim();
  if (trimmed === '') return '';

  const colon = findTopLevel(trimmed, ':');
  if (colon === -1) return nameColor(trimmed);

  const name = trimmed.slice(0, colon).trim();
  const typeAndDefault = trimmed.slice(colon + 1).trim();
  const defaultIndex = findTopLevel(typeAndDefault, '=');

  if (defaultIndex === -1) {
    return `${nameColor(name)}${nameColor(':')} ${colors.dim(colors.bold(nameColor(typeAndDefault)))}`;
  }

  const type = typeAndDefault.slice(0, defaultIndex).trimEnd();
  const defaultValue = typeAndDefault.slice(defaultIndex + 1).trimStart();
  return `${nameColor(name)}${nameColor(':')} ${colors.dim(colors.bold(nameColor(type)))} ${nameColor('=')} ${nameColor(defaultValue)}`;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' && source[i - 1] !== '=' && depth > 0) depth--;
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    else if (ch === separator && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function findTopLevel(source: string, needle: string): number {
  let depth = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' && source[i - 1] !== '=' && depth > 0) depth--;
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    else if (needle === '=' && ch === '=' && source[i + 1] === '>') continue;
    else if (ch === needle && depth === 0) return i;
  }

  return -1;
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

interface ParsedArgs {
  json: boolean;
  check: boolean;
  noColor: boolean;
  packageFilters: string[];
  functionFilters: string[];
  queryFilters: string[];
  help: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    json: false,
    check: false,
    noColor: false,
    packageFilters: [],
    functionFilters: [],
    queryFilters: [],
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--check') {
      parsed.check = true;
    } else if (arg === '--no-color') {
      parsed.noColor = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--package' || arg === '--pkg') {
      i++;
      if (i >= args.length) throw new Error('Missing value for --package');
      parsed.packageFilters.push(args[i]);
    } else if (arg.startsWith('--package=')) {
      parsed.packageFilters.push(arg.slice('--package='.length));
    } else if (arg.startsWith('package=')) {
      parsed.packageFilters.push(arg.slice('package='.length));
    } else if (arg.startsWith('pkg=')) {
      parsed.packageFilters.push(arg.slice('pkg='.length));
    } else if (arg.startsWith('package:')) {
      parsed.packageFilters.push(arg.slice('package:'.length));
    } else if (arg.startsWith('pkg:')) {
      parsed.packageFilters.push(arg.slice('pkg:'.length));
    } else if (arg === '--function' || arg === '--fn') {
      i++;
      if (i >= args.length) throw new Error('Missing value for --function');
      parsed.functionFilters.push(args[i]);
    } else if (arg.startsWith('--function=')) {
      parsed.functionFilters.push(arg.slice('--function='.length));
    } else if (arg.startsWith('function=')) {
      parsed.functionFilters.push(arg.slice('function='.length));
    } else if (arg.startsWith('fn=')) {
      parsed.functionFilters.push(arg.slice('fn='.length));
    } else if (arg.startsWith('function:')) {
      parsed.functionFilters.push(arg.slice('function:'.length));
    } else if (arg.startsWith('fn:')) {
      parsed.functionFilters.push(arg.slice('fn:'.length));
    } else if (arg === '--') {
      parsed.queryFilters.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      parsed.queryFilters.push(arg);
    }
    i += 1;
  }

  return parsed;
}

function printUsage(): void {
  console.log('Usage: npm run api [--] [filters...] [--json] [--check] [--no-color]');
  console.log('');
  console.log('Filter examples:');
  console.log('  npm run api application               # show @flighthq/application package');
  console.log('  npm run api app                       # search packages and functions for "app"');
  console.log('  npm run api package=application       # explicit package filter without npm --');
  console.log('  npm run api package:application       # same as package=application');
  console.log('  npm run api fn=register               # explicit function filter without npm --');
  console.log('  npm run api fn:register               # same as fn=register');
  console.log('');
  console.log('Options:');
  console.log('  --json        output API data as JSON');
  console.log('  --check       fail on duplicate exported names and accessor-prefix violations');
  console.log('  --no-color    disable colorized output');
  console.log('  --package     only include matching package names');
  console.log('  --function    only include matching exported functions');
  console.log('  package=...   same as --package');
  console.log('  function=...  same as --function');
  console.log('  pkg=... fn=... synonyms');
  console.log('  --help, -h    show this help message');
}

function normalizeQuery(value: string): string {
  return value.toLowerCase();
}

function matchPackage(pkg: ApiPackage, query: string): boolean {
  const normalized = normalizeQuery(query);
  return normalizeQuery(pkg.name).includes(normalized);
}

function matchFunction(fn: ApiFunction, query: string): boolean {
  const normalized = normalizeQuery(query);
  return normalizeQuery(fn.name).includes(normalized);
}

function filterApi(packages: ApiPackage[], options: ParsedArgs): ApiPackage[] {
  if (
    options.packageFilters.length === 0 &&
    options.functionFilters.length === 0 &&
    options.queryFilters.length === 0
  ) {
    return packages;
  }

  const packageQueries = [...options.packageFilters, ...options.queryFilters];
  const functionQueries = [...options.functionFilters, ...options.queryFilters];

  return packages
    .map((pkg) => {
      const packageMatches = packageQueries.some((query) => matchPackage(pkg, query));
      const functions = pkg.functions.filter((fn) => functionQueries.some((query) => matchFunction(fn, query)));

      if (packageMatches && options.functionFilters.length === 0) {
        return pkg;
      }

      if (functions.length === 0) {
        return null;
      }

      return { ...pkg, functions };
    })
    .filter((pkg): pkg is ApiPackage => pkg !== null);
}

// Packages allowed to export the same function names as each other. A drop-in
// pair is a deliberate mirror: @flighthq/surface-rs is the Rust surface crate
// compiled to wasm and shimmed to @flighthq/surface's exported signatures (the
// "mixing" seam), so an app swaps implementations without call-site changes.
// Identical names across such a pair are the point, not a collision.
const DROP_IN_PACKAGES: ReadonlyArray<ReadonlyArray<string>> = [['@flighthq/surface', '@flighthq/surface-rs']];

// Ratchet allowlist for accessor-prefix violations that predate the check.
// Entries are '<package> <functionName>'. Existing entries are tolerated so
// the check can land without renames; new violations fail. Shrink this list —
// never grow it.
const ACCESSOR_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // get* returning void, delivering results through a visitor callback rather
  // than a return value or an out parameter.
  '@flighthq/input getCoalescedInputPointerEvents',
]);

interface ApiCheckIssue {
  message: string;
  rule: 'accessor' | 'duplicate';
}

function collectAccessorIssues(packages: readonly ApiPackage[]): ApiCheckIssue[] {
  const issues: ApiCheckIssue[] = [];

  for (const pkg of packages) {
    for (const fn of pkg.functions) {
      if (ACCESSOR_ALLOWLIST.has(`${pkg.name} ${fn.name}`)) continue;

      if (/^(?:is|has)[A-Z0-9]/.test(fn.name)) {
        for (const signature of fn.signatures) {
          const returnType = getSignatureReturnType(signature);
          if (returnType !== null && !isBooleanShapedType(returnType)) {
            issues.push({
              message: `${pkg.name} ${fn.name} is named like a boolean accessor but returns ${returnType}`,
              rule: 'accessor',
            });
            break;
          }
        }
      }

      if (/^get[A-Z0-9]/.test(fn.name)) {
        for (const signature of fn.signatures) {
          const returnType = getSignatureReturnType(signature);
          // A void get* is fine when it writes through the documented
          // out-parameter convention (a parameter named `out` or `target`);
          // a void get* with no out parameter returns nothing to anyone.
          if (returnType === 'void' && !hasOutParameter(signature)) {
            issues.push({
              message: `${pkg.name} ${fn.name} is named like a getter but returns void without an out parameter`,
              rule: 'accessor',
            });
            break;
          }
        }
      }
    }
  }

  return issues;
}

function collectDuplicateNameIssues(packages: readonly ApiPackage[]): ApiCheckIssue[] {
  const packagesByFunctionName = new Map<string, string[]>();

  for (const pkg of packages) {
    for (const fn of pkg.functions) {
      const owners = packagesByFunctionName.get(fn.name);
      if (owners === undefined) packagesByFunctionName.set(fn.name, [pkg.name]);
      else owners.push(pkg.name);
    }
  }

  const issues: ApiCheckIssue[] = [];
  for (const [name, owners] of packagesByFunctionName) {
    if (owners.length < 2) continue;
    if (DROP_IN_PACKAGES.some((group) => owners.every((owner) => group.includes(owner)))) continue;
    issues.push({
      message: `${name} is exported by ${owners.join(' and ')} — exported function names must be globally unique`,
      rule: 'duplicate',
    });
  }

  return issues;
}

// Extracts the printed return type from a formatted signature, or null when
// the text cannot be parsed precisely (the check skips it rather than guess).
function getSignatureReturnType(signature: string): string | null {
  let angleDepth = 0;

  for (let i = 0; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === '<') angleDepth++;
    else if (ch === '>' && signature[i - 1] !== '=' && angleDepth > 0) angleDepth--;
    else if (ch === '(' && angleDepth === 0) {
      const close = findMatchingParen(signature, i);
      if (close === -1 || signature.slice(close, close + 3) !== '): ') return null;
      return signature.slice(close + 3).trim();
    }
  }

  return null;
}

// Reports whether the printed parameter list contains a parameter named `out`
// or `target` — the SDK's mutable-output convention for void get* functions.
function hasOutParameter(signature: string): boolean {
  let angleDepth = 0;

  for (let i = 0; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === '<') angleDepth++;
    else if (ch === '>' && signature[i - 1] !== '=' && angleDepth > 0) angleDepth--;
    else if (ch === '(' && angleDepth === 0) {
      const close = findMatchingParen(signature, i);
      if (close === -1) return false;
      return splitTopLevel(signature.slice(i + 1, close), ',').some((param) =>
        // `out`, prefixed outs (`outA`, `outBounds`), or `target`.
        /^(?:out[A-Za-z0-9]*|target)\??$/.test(param.trim().split(':')[0].trim()),
      );
    }
  }

  return false;
}

// boolean-shaped: `boolean`, a union whose every member is boolean-shaped, a
// type predicate (`value is Foo` — boolean at runtime; the canonical guard
// pattern), or a Promise of a boolean-shaped type (async backend accessors).
// Matches printed signature text pragmatically rather than resolving types.
function isBooleanShapedType(returnType: string): boolean {
  return splitTopLevel(returnType, '|').every((part) => {
    const trimmed = part.trim();
    if (trimmed === 'boolean') return true;
    if (/^[\w$]+ is\s/.test(trimmed)) return true;
    const promised = /^Promise<(.+)>$/.exec(trimmed);
    return promised !== null && isBooleanShapedType(promised[1].trim());
  });
}

function runApiCheck(packages: readonly ApiPackage[]): never {
  const issues = [...collectDuplicateNameIssues(packages), ...collectAccessorIssues(packages)];
  const functionCount = packages.reduce((sum, pkg) => sum + pkg.functions.length, 0);

  if (issues.length === 0) {
    console.log(
      `${colors.green('OK')} ${colors.bold(`API names valid`)} ${colors.dim(
        `(${functionCount} exported functions across ${packages.length} packages)`,
      )}`,
    );
    process.exit(0);
  }

  console.log(
    `${colors.yellow('!')} ${colors.bold(`${issues.length} API issue${issues.length === 1 ? '' : 's'} found`)}\n`,
  );
  for (const issue of issues) {
    console.log(`  ${colors.yellow('!')} ${colors.dim(`[${issue.rule}]`)} ${colors.white(issue.message)}`);
  }
  console.log('');
  process.exit(1);
}

const asJson = options.json;

if (options.help) {
  printUsage();
  process.exit(0);
}

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});

if (options.check) {
  // The check gates the whole tree: filters are ignored so a filtered
  // invocation can never green-light a duplicate hiding elsewhere.
  runApiCheck(topoSort(findPackages()).map((pkg) => collectPackageApi(project, pkg)));
}

const api = filterApi(
  topoSort(findPackages()).map((pkg) => collectPackageApi(project, pkg)),
  options,
);

if (asJson) {
  console.log(JSON.stringify({ packages: api }, null, 2));
} else {
  printConsole(api);
}
