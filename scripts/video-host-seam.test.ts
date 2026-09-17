import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract';
import * as hostWebPublic from '../packages/host-web/src/index';
import * as videoContract from '../packages/video/src/contract';
import * as videoPublic from '../packages/video/src/index';

const ROOT = process.cwd();
const SELF = 'scripts/video-host-seam.test.ts';
const PORTABLE_VIDEO_ROOT = resolve(ROOT, 'packages/video/src');
const PORTABLE_TEXTURE_ROOT = resolve(ROOT, 'packages/texture/src');
const BROWSER_IDENTIFIERS = new Set(['HTMLMediaElement', 'HTMLVideoElement', 'MediaStream']);
const OBJECT_URL_METHODS = new Set(['createObjectURL', 'revokeObjectURL']);
const RETIRED_MEDIA_STREAM_ENTRY = 'createVideoResourceFromMediaStream';
const WEB_MEDIA_STREAM_ENTRY = 'createWebVideoResourceFromMediaStream';
const PROVIDER_FIRST_VIDEO_FUNCTIONS = [
  'canPlayVideoType',
  'destroyVideoResource',
  'disposeVideoResource',
  'getVideoResourceDuration',
  'getVideoResourceHeight',
  'getVideoResourceWidth',
  'isVideoResourceEmpty',
  'isVideoResourceReady',
  'loadVideoResourceFromBlob',
  'loadVideoResourceFromUrl',
  'loadVideoResourceFromUrls',
  'selectVideoResourceUrl',
] as const;
const PROVIDER_FIRST_TEXTURE_FUNCTIONS = [
  'advanceVideoTexture',
  'createVideoTexture',
  'getVideoTextureHeight',
  'getVideoTextureWidth',
  'isVideoTextureFrameReady',
  'setVideoTextureSource',
] as const;
const PROVIDER_FIRST_FUNCTIONS = [...PROVIDER_FIRST_VIDEO_FUNCTIONS, ...PROVIDER_FIRST_TEXTURE_FUNCTIONS] as const;
const MINIMUM_ARGUMENTS: ReadonlyMap<string, number> = new Map(
  PROVIDER_FIRST_FUNCTIONS.map((name) => [name, 2] as const),
);

// Several of these tests scan every TypeScript file in the repository synchronously. Alone they finish
// in about a second, but under the aggregate run they share the CPU with every other worker, and a
// busy host has pushed one past vitest's 5s default. The budget is contention headroom, not a deadline.
describe('video host-seam closure', { timeout: 30_000 }, () => {
  it('recognizes every forbidden portable browser fixture', () => {
    const source = parseSource(
      'fixture.ts',
      `
        const element = handle as HTMLVideoElement;
        let media: HTMLMediaElement;
        function attach(stream: MediaStream): void {}
        URL.createObjectURL(blob);
        URL.revokeObjectURL(url);
      `,
    );

    expect(new Set(findPortableViolations(source).map(({ rule }) => rule))).toEqual(
      new Set([
        'HTMLMediaElement',
        'HTMLVideoElement',
        'MediaStream',
        'URL.createObjectURL',
        'URL.revokeObjectURL',
        'type assertion',
      ]),
    );
  });

  it('keeps portable video production free of browser media details and opaque-handle assertions', () => {
    const violations = productionVideoSources().flatMap(findPortableViolations);

    expect(violations).toEqual([]);
  });

  it('implements every declared HostVideoCapability operation in the web provider', () => {
    const declaration = findHostVideoProviderDeclaration();
    const declared = declaration.members
      .map(memberName)
      .filter((name) => name !== '')
      .sort();
    const implemented = Object.entries(hostWebContract.webHostVideo)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();

    // Removing an operation is an API change that `npm run api:check` names and every caller's typecheck
    // catches; this test owns the other direction, that the web provider implements exactly what is declared.
    expect(declared.length).toBeGreaterThan(0);
    expect(implemented).toEqual(declared);
    expect(hostWebPublic.webHostVideo).toBe(hostWebContract.webHostVideo);
    expect(hostWebContract.webHost.video.playback).toBe(hostWebContract.webHostVideo);
  });

  it('makes every host-touching portable operation explicitly provider-first', () => {
    const signatures = exportedVideoFunctions();
    const violations = PROVIDER_FIRST_VIDEO_FUNCTIONS.flatMap((name) => {
      const declaration = signatures.get(name);
      if (declaration === undefined) return [`${name}: missing`];
      const first = declaration.parameters[0];
      const type = first?.type?.getText(declaration.getSourceFile()) ?? '<missing>';
      return type === 'Readonly<HostVideoCapability>' ? [] : [`${name}: ${type}`];
    });

    expect(violations).toEqual([]);
  });

  it('keeps portable texture video-state access provider-first', () => {
    const signatures = exportedTextureFunctions();
    const violations = PROVIDER_FIRST_TEXTURE_FUNCTIONS.flatMap((name) => {
      const declaration = signatures.get(name);
      if (declaration === undefined) return [`${name}: missing`];
      const first = declaration.parameters[0];
      const type = first?.type?.getText(declaration.getSourceFile()) ?? '<missing>';
      return type === 'Readonly<HostVideoCapability>' ? [] : [`${name}: ${type}`];
    });

    expect(violations).toEqual([]);
  });

  it('leaves no legacy providerless call arity in repository TypeScript', () => {
    expect(findLegacyCallArities()).toEqual([]);
  });

  it('keeps the Web MediaStream entry in host-web only and retires the portable spelling', () => {
    expect(findIdentifierReferences(RETIRED_MEDIA_STREAM_ENTRY)).toEqual([]);
    expect(Object.hasOwn(videoPublic, RETIRED_MEDIA_STREAM_ENTRY)).toBe(false);
    expect(Object.hasOwn(videoContract, RETIRED_MEDIA_STREAM_ENTRY)).toBe(false);
    expect(Object.hasOwn(hostWebPublic, WEB_MEDIA_STREAM_ENTRY)).toBe(true);
    expect(Object.hasOwn(hostWebContract, WEB_MEDIA_STREAM_ENTRY)).toBe(true);
    expect(findExportedDeclarations(WEB_MEDIA_STREAM_ENTRY)).toEqual(['packages/host-web/src/webVideoResource.ts']);
  });

  it('keeps HostImageSource as the unchanged web drawable-source alias', () => {
    const path = resolve(ROOT, 'packages/types/src/HostImageSource.ts');
    const source = parseSource(path, readFileSync(path, 'utf8'));
    const aliases = source.statements
      .filter(ts.isTypeAliasDeclaration)
      .filter(({ name }) => name.text === 'HostImageSource');

    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.type.getText(source)).toBe('CanvasImageSource');
  });
});

interface PortableViolation {
  file: string;
  line: number;
  rule: string;
}

function findPortableViolations(source: ts.SourceFile): PortableViolation[] {
  const violations: PortableViolation[] = [];
  visit(source, (node) => {
    if (ts.isIdentifier(node) && BROWSER_IDENTIFIERS.has(node.text)) {
      violations.push(violation(source, node, node.text));
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'URL' &&
      OBJECT_URL_METHODS.has(node.name.text)
    ) {
      violations.push(violation(source, node, `URL.${node.name.text}`));
    }
    if ((ts.isAsExpression(node) && node.type.getText(source) !== 'const') || ts.isTypeAssertionExpression(node)) {
      violations.push(violation(source, node, 'type assertion'));
    }
  });
  return violations;
}

function findHostVideoProviderDeclaration(): ts.InterfaceDeclaration {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === 'HostVideoCapability') return statement;
    }
  }
  throw new Error('HostVideoCapability declaration not found');
}

function exportedVideoFunctions(): ReadonlyMap<string, ts.FunctionDeclaration> {
  return exportedFunctions(productionVideoSources());
}

function exportedTextureFunctions(): ReadonlyMap<string, ts.FunctionDeclaration> {
  return exportedFunctions(productionTextureSources());
}

function exportedFunctions(sources: readonly ts.SourceFile[]): ReadonlyMap<string, ts.FunctionDeclaration> {
  const declarations = new Map<string, ts.FunctionDeclaration>();
  for (const source of sources) {
    for (const statement of source.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name === undefined || !isExported(statement)) continue;
      declarations.set(statement.name.text, statement);
    }
  }
  return declarations;
}

function findLegacyCallArities(): string[] {
  const findings: string[] = [];
  const candidate = new RegExp(`\\b(?:${[...MINIMUM_ARGUMENTS.keys()].join('|')})\\b`, 'u');
  for (const source of repositorySources(candidate)) {
    const aliases = importedProviderFirstNames(source);
    visit(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      const name = calledProviderFirstName(node.expression, aliases);
      if (name === null) return;
      const minimum = MINIMUM_ARGUMENTS.get(name);
      if (minimum !== undefined && node.arguments.length < minimum) {
        findings.push(`${location(source, node)}: ${name}(${node.arguments.length})`);
      }
    });
  }
  return findings.sort();
}

function findIdentifierReferences(name: string): string[] {
  const findings: string[] = [];
  for (const source of repositorySources(new RegExp(`\\b${name}\\b`, 'u'))) {
    visit(source, (node) => {
      if (ts.isIdentifier(node) && node.text === name) findings.push(location(source, node));
    });
  }
  return findings.sort();
}

function findExportedDeclarations(name: string): string[] {
  const findings: string[] = [];
  for (const source of repositorySources(new RegExp(`\\b${name}\\b`, 'u'))) {
    for (const statement of source.statements) {
      if (
        ((ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
          (ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some(
              ({ name: declarationName }) => ts.isIdentifier(declarationName) && declarationName.text === name,
            ))) &&
        isExported(statement)
      ) {
        findings.push(relative(ROOT, source.fileName));
      }
    }
  }
  return findings.sort();
}

function importedProviderFirstNames(source: ts.SourceFile): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/^@flighthq\/(?:sdk|texture|video)(?:\/contract)?$/u.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (MINIMUM_ARGUMENTS.has(imported)) names.set(element.name.text, imported);
    }
  }
  return names;
}

function calledProviderFirstName(
  expression: ts.LeftHandSideExpression,
  aliases: ReadonlyMap<string, string>,
): string | null {
  if (!ts.isIdentifier(expression)) return null;
  return aliases.get(expression.text) ?? (MINIMUM_ARGUMENTS.has(expression.text) ? expression.text : null);
}

function productionVideoSources(): ts.SourceFile[] {
  return sourcePaths(PORTABLE_VIDEO_ROOT)
    .filter((path) => !path.endsWith('.test.ts'))
    .map((path) => parseSource(path, readFileSync(path, 'utf8')));
}

function productionTextureSources(): ts.SourceFile[] {
  return sourcePaths(PORTABLE_TEXTURE_ROOT)
    .filter((path) => !path.endsWith('.test.ts'))
    .map((path) => parseSource(path, readFileSync(path, 'utf8')));
}

function typeSources(): ts.SourceFile[] {
  return sourcePaths(resolve(ROOT, 'packages/types/src'))
    .filter((path) => !path.endsWith('.test.ts'))
    .map((path) => parseSource(path, readFileSync(path, 'utf8')));
}

function repositorySources(candidate: RegExp): ts.SourceFile[] {
  return ['examples', 'packages', 'scripts', 'tools']
    .flatMap((directory) => sourcePaths(resolve(ROOT, directory)))
    .filter((path) => relative(ROOT, path).replaceAll('\\', '/') !== SELF)
    .flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return candidate.test(source) ? [parseSource(path, source)] : [];
    });
}

function sourcePaths(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return ['build', 'dist', 'node_modules'].includes(entry.name) ? [] : sourcePaths(path);
      return entry.isFile() && /\.tsx?$/u.test(entry.name) ? [path] : [];
    })
    .sort();
}

function parseSource(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}

function memberName(member: ts.TypeElement): string {
  const name = member.name;
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : '';
}

function violation(source: ts.SourceFile, node: ts.Node, rule: string): PortableViolation {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: relative(ROOT, source.fileName).replaceAll('\\', '/'), line: line + 1, rule };
}

function location(source: ts.SourceFile, node: ts.Node): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(ROOT, source.fileName).replaceAll('\\', '/')}:${line + 1}`;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
