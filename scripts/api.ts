import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import type { FunctionDeclaration } from 'ts-morph';
import { Node, Project } from 'ts-morph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');
const args = new Set(process.argv.slice(2));
const colors = (pc as typeof pc & { createColors: (enabled?: boolean) => typeof pc }).createColors(
  !args.has('--no-color'),
);

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

function getFunctionName(node: Node, fallback: string): string {
  if (Node.isFunctionDeclaration(node)) return node.getName() ?? fallback;
  if (Node.isVariableDeclaration(node)) return node.getName();
  return fallback;
}

function getFunctionSignatures(node: Node, fallback: string): string[] {
  if (Node.isFunctionDeclaration(node)) {
    const declarations = node.getSymbol()?.getDeclarations().filter(Node.isFunctionDeclaration) ?? [node];
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

function formatFunctionDeclaration(node: FunctionDeclaration, fallback: string): string {
  const name = node.getName() ?? fallback;
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

const asJson = args.has('--json');

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});

const api = topoSort(findPackages()).map((pkg) => collectPackageApi(project, pkg));

if (asJson) {
  console.log(JSON.stringify({ packages: api }, null, 2));
} else {
  printConsole(api);
}
