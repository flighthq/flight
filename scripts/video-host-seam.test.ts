import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract.ts';
import * as hostWebPublic from '../packages/host-web/src/index.ts';
import * as videoContract from '../packages/video/src/contract.ts';
import * as videoPublic from '../packages/video/src/index.ts';

const ROOT = process.cwd();
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
// The repository-wide ratchet scans that justified a 30s budget here have been retired; what remains
// parses fixtures and the `packages/types/src` surface, which is bounded work. The budget stays only as
// contention headroom for the aggregate run, where this file shares the CPU with every other worker.
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

  it('keeps the Web MediaStream entry on the host-web lanes and off the portable ones', () => {
    expect(Object.hasOwn(videoPublic, RETIRED_MEDIA_STREAM_ENTRY)).toBe(false);
    expect(Object.hasOwn(videoContract, RETIRED_MEDIA_STREAM_ENTRY)).toBe(false);
    expect(Object.hasOwn(hostWebPublic, WEB_MEDIA_STREAM_ENTRY)).toBe(true);
    expect(Object.hasOwn(hostWebContract, WEB_MEDIA_STREAM_ENTRY)).toBe(true);
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

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
