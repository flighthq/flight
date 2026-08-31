import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { getCaptureEntryRoute } from '../packages/tool-capture/src/captureEntries';
import { readCaptureManifest } from '../packages/tool-capture/src/captureManifest';
import type { SizeResult } from './size-runner';
import {
  collectSizeCases,
  didSizeChecksPass,
  formatSizeResult,
  getFlightDiagnosticsSizeDelta,
  getSizeCaseKey,
  parseSizeBaselineOrigins,
  readBaseline,
} from './size-runner';

// These read the size-case declarations off disk and assert nothing that requires a bundle, so they
// belong in the ordinary suite rather than in `tools/size`, whose config exists to buy a node
// environment and a 300s timeout for real builds. The build-dependent assertions stay there.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDirectory = resolve(root, 'tools', 'size', 'fixtures');

describe('collectSizeCases', () => {
  test('every scene2d pipeline aggregate has a sprite comparator', () => {
    const pipelineKeys = new Set(
      collectSizeCases(fixturesDirectory)
        .map(getSizeCaseKey)
        .filter((key) => key.startsWith('scene2d-') && key.includes('-pipeline')),
    );
    const aggregates = [...pipelineKeys].filter((key) => !key.includes('-sprite'));
    expect(aggregates.length).toBeGreaterThan(0);
    for (const aggregate of aggregates) {
      const spriteKey = aggregate.replace('-pipeline:', '-pipeline-sprite:');
      expect(pipelineKeys, `missing sprite comparator for ${aggregate}`).toContain(spriteKey);
    }
  });

  test('orders the canonical release target before its diagnostics variant', () => {
    const diagnosticsCases = collectSizeCases(fixturesDirectory).filter((item) => item.name === 'flight-diagnostics');
    expect(diagnosticsCases.map((item) => item.variant)).toEqual([null, 'diagnostics']);
  });

  test('discovers at least one dom fixture', () => {
    const domKeys = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => key.startsWith('scene2d-dom-'));
    expect(domKeys.length).toBeGreaterThan(0);
  });

  test('does not discover example packages outside the fixture directory', () => {
    const keys = collectSizeCases(fixturesDirectory).map(getSizeCaseKey);

    expect(keys).not.toContain('adjustments:canvas');
    expect(keys).not.toContain('shapes:webgl');
  });
});

function extractImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf-8');
  return [...source.matchAll(/from\s+'(@flighthq\/[^']+)'/g)].map((m) => m[1]!);
}

describe('dom fixture import structure', () => {
  test('dom-sprite imports no aggregate webHost or unrelated renderer packages', () => {
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-sprite/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers.filter((s) => s === '@flighthq/host-web')).toHaveLength(0);
    expect(specifiers).not.toContain('@flighthq/scene2d-canvas');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });

  test('dom-shape imports webCanvasRenderSurfaceCreator but not aggregate webHost', () => {
    const source = readFileSync(resolve(fixturesDirectory, 'scene2d-dom-shape/src/render.dom.ts'), 'utf-8');
    expect(source).toContain('webCanvasRenderSurfaceCreator');
    expect(source).not.toContain('webHost');
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-shape/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });

  test('dom-text imports no host-web, no texture resolver, no canvas or gpu packages', () => {
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-text/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers).not.toContain('@flighthq/host-web');
    expect(specifiers).not.toContain('@flighthq/texture');
    expect(specifiers).not.toContain('@flighthq/image');
    expect(specifiers).not.toContain('@flighthq/scene2d-canvas');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });
});

describe('dedicated size fixture gate', () => {
  test('every fixture has a baseline entry', () => {
    const fixtureKeys = collectSizeCases(fixturesDirectory).map(getSizeCaseKey).sort();
    expect(fixtureKeys.length).toBeGreaterThan(0);

    for (const name of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const baselineKeys = new Set(Object.keys(readBaseline(resolve(fixturesDirectory, '..', name))));
      for (const key of fixtureKeys) {
        expect(baselineKeys, `${name} missing entry for ${key}`).toContain(key);
      }
    }
  });
});

describe('minimal size fixture harness', () => {
  const fixtures = collectMinimalCaptureFixtures(fixturesDirectory);

  test('discovers every non-aggregate feature fixture', () => {
    expect(fixtures.map((fixture) => fixture.name)).toEqual(
      expect.arrayContaining([
        'host-web-window-only',
        'scene2d-canvas-pipeline-sprite',
        'scene2d-gl-pipeline-sprite',
        'scene2d-wgpu-pipeline-sprite',
      ]),
    );
  });

  test('has one feature-oriented entry per fixture', () => {
    const violations = fixtures
      .filter((fixture) => fixture.kind === 'feature')
      .flatMap((fixture) => {
        const entryNames = fixture.manifest?.entries.map((entry) => entry.name) ?? [];
        return entryNames.length === 1 && entryNames[0] === fixture.name
          ? []
          : [
              `${fixture.name}: expected one capture entry named '${fixture.name}', found ${JSON.stringify(entryNames)}`,
            ];
      });

    expect(violations).toEqual([]);
  });

  test('maps the sole render entry through a valid tool-capture route', () => {
    const violations = fixtures
      .filter((fixture) => fixture.kind === 'feature')
      .flatMap((fixture) => {
        if (fixture.renderers.length !== 1) {
          return [`${fixture.name}: expected one render.<renderer>.ts entry, found ${fixture.renderers.join(', ')}`];
        }
        const renderer = fixture.renderers[0];
        const entry = fixture.manifest?.entries[0];
        if (entry === undefined || entry.renderers.length !== 1 || entry.renderers[0] !== renderer) {
          return [
            `${fixture.name}: capture renderer ${JSON.stringify(entry?.renderers ?? [])} does not match render.${renderer}.ts`,
          ];
        }
        const route = getCaptureEntryRoute(entry, renderer, fixture.manifest?.subject ?? 'size-fixture');
        return route === '/' ? [] : [`${fixture.name}: expected renderer route '/', found '${route}'`];
      });

    expect(violations).toEqual([]);
  });

  test('keeps declared size-only controls renderer-free as comparator floors', () => {
    const violations = fixtures.flatMap((fixture) => {
      if (fixture.kind === 'invalid') {
        return [`${fixture.name}: flightSize.kind must be omitted or equal 'size-only-control'`];
      }
      if (fixture.kind !== 'size-only-control') return [];
      const problems: string[] = [];
      if (fixture.manifest !== null) problems.push('must not have tool-capture.json');
      if (fixture.renderers.length !== 1) {
        problems.push(`expected one size entry, found ${fixture.renderers.join(', ')}`);
      }
      if (fixture.rendererBindingCalls.length > 0) {
        problems.push(`binds renderer through ${fixture.rendererBindingCalls.join(', ')}`);
      }
      return problems.map((problem) => `${fixture.name}: ${problem}`);
    });

    expect(violations).toEqual([]);
  });

  test('does not import the aggregate webHost', () => {
    const violations = fixtures.flatMap((fixture) =>
      fixture.imports
        .filter(
          (item) =>
            (item.specifier === '@flighthq/host-web' || item.specifier.startsWith('@flighthq/host-web/')) &&
            (item.importedNames.includes('webHost') || item.importedNames.includes('*')),
        )
        .map((item) => `${fixture.name}: ${item.file} imports ${item.importedNames.join(', ')} from ${item.specifier}`),
    );

    expect(violations).toEqual([]);
  });

  test('limits DOM shape Canvas bridge fixtures to their exact rasterization symbols', () => {
    const expectedBridge = [
      '@flighthq/host-web:webCanvasRenderSurfaceCreator',
      '@flighthq/scene2d-canvas:createCanvasShapeRasterizer',
      '@flighthq/scene2d-canvas:createCanvasTextureResolvers',
      '@flighthq/scene2d-canvas:defaultCanvasShapeCommands',
      '@flighthq/scene2d-canvas:registerCanvasShapeCommands',
    ];
    for (const name of domShapeCanvasBridgeFixtures) {
      const fixture = fixtures.find((item) => item.name === name);
      const bridgeImports = (fixture?.imports ?? [])
        .filter((item) => item.specifier === '@flighthq/host-web' || item.specifier === '@flighthq/scene2d-canvas')
        .flatMap((item) => item.importedNames.map((n) => `${item.specifier}:${n}`))
        .sort();

      expect(bridgeImports, `${name} canvas bridge`).toEqual(expectedBridge);
    }
  });

  test('keeps DOM, Canvas, WebGL and WebGPU renderer families isolated', () => {
    const violations = fixtures.flatMap((fixture) => {
      if (fixture.renderers.length !== 1) return [];
      const renderer = fixture.renderers[0];
      const forbidden = forbiddenImportFamilies(renderer);
      return fixture.imports
        .map((item) => ({ ...item, family: importFamily(item.specifier) }))
        .filter(
          (item) =>
            item.family !== null && forbidden.includes(item.family) && !isAllowedDomShapeCanvasBridge(fixture, item),
        )
        .map(
          (item) => `${fixture.name}: render.${renderer}.ts corpus imports ${item.family} package ${item.specifier}`,
        );
    });

    expect(violations).toEqual([]);
  });
});

describe('didSizeChecksPass', () => {
  test('fails when no size cases were checked', () => {
    expect(didSizeChecksPass([])).toBe(false);
  });
});

describe('formatSizeResult', () => {
  test('fails a bundle of any size when no baseline exists', () => {
    expect(formatSizeResult(999_999, null)).toMatchObject({
      baselineKB: null,
      baselineKBStr: null,
      delta: null,
      passed: false,
      threshold: null,
    });
  });
});

describe('getFlightDiagnosticsSizeDelta', () => {
  // Recovered coverage, not new coverage. This was the ONE assertion deliberately left in
  // tools/size/size.test.ts because it read the BUILT results; that file was deleted wholesale when the
  // size lane was reworked, taking the only test of this export with it. Constructing the two results
  // directly needs no build, so the assertion belongs here and no longer depends on a five-minute lane.
  const sizeResult = (key: string, gzipSize: number): SizeResult => ({ gzipSize, key }) as unknown as SizeResult;

  test('reports the enabled build as a positive delta over the release stub', () => {
    const delta = getFlightDiagnosticsSizeDelta([
      sizeResult('flight-diagnostics:canvas', 1000),
      sizeResult('flight-diagnostics:canvas:diagnostics', 1750),
    ]);
    expect(delta).toBe(750);
  });

  test('reports null when either side of the pair is absent', () => {
    expect(getFlightDiagnosticsSizeDelta([sizeResult('flight-diagnostics:canvas', 1000)])).toBeNull();
    expect(getFlightDiagnosticsSizeDelta([])).toBeNull();
  });
});

describe('getSizeCaseKey', () => {
  test('uses the canonical release key plus one diagnostics suffix', () => {
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: null })).toBe(
      'flight-diagnostics:canvas',
    );
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: 'diagnostics' })).toBe(
      'flight-diagnostics:canvas:diagnostics',
    );
  });
});

describe('parseSizeBaselineOrigins', () => {
  test('attributes every baseline key to its last committed line change', () => {
    const firstCommit = 'a'.repeat(40);
    const secondCommit = 'b'.repeat(40);
    const blame = [
      `${firstCommit} 1 1 1`,
      'author-time 1785888435',
      'author-tz -0700',
      '\t  "first:canvas": 10,',
      `${secondCommit} 2 2 1`,
      'author-time 1785974835',
      'author-tz -0700',
      '\t  "second:webgl": 20',
    ].join('\n');

    expect(parseSizeBaselineOrigins(blame)).toEqual({
      'first:canvas': { commit: firstCommit, commitDate: '2026-08-04' },
      'second:webgl': { commit: secondCommit, commitDate: '2026-08-05' },
    });
  });

  test('reports an uncommitted baseline line without inventing an origin', () => {
    const blame = [`${'0'.repeat(40)} 1 1 1`, 'author-time 1785888435', '\t  "sample:canvas": 10'].join('\n');
    expect(parseSizeBaselineOrigins(blame)).toEqual({
      'sample:canvas': { commit: null, commitDate: null },
    });
  });
});

const aggregateCaptureFixtures = new Set([
  'host-web-full',
  'scene2d-canvas-pipeline',
  'scene2d-gl-pipeline',
  'scene2d-wgpu-pipeline',
]);

// These predate the visual fixture contract and measure non-rendering or aggregate import subjects. New
// fixtures are deliberately not opt-in: unless named as an aggregate ceiling above, every new directory
// joins the minimal harness and therefore has to supply one renderer entry plus capture evidence.
const legacyNonCaptureFixtures = new Set([
  'flight-diagnostics-enabled',
  'flight-diagnostics-release',
  'layout-all',
  'layout-anchor',
  'log-console',
  'scene2d-embedded-png',
  'swf-import',
]);

type FixtureRenderer = 'canvas' | 'dom' | 'webgl' | 'webgpu';
type ImportFamily = 'canvas' | 'dom' | 'webgl' | 'webgpu';

interface FixtureImport {
  file: string;
  importedNames: string[];
  specifier: string;
}

interface MinimalCaptureFixture {
  imports: FixtureImport[];
  kind: 'feature' | 'invalid' | 'size-only-control';
  manifest: ReturnType<typeof readCaptureManifest> | null;
  name: string;
  rendererBindingCalls: string[];
  renderers: FixtureRenderer[];
}

function collectMinimalCaptureFixtures(directory: string): MinimalCaptureFixture[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !aggregateCaptureFixtures.has(entry.name) && !legacyNonCaptureFixtures.has(entry.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const fixtureDirectory = join(directory, entry.name);
      const sourceDirectory = join(fixtureDirectory, 'src');
      const packageJson = JSON.parse(readFileSync(join(fixtureDirectory, 'package.json'), 'utf8')) as {
        flightSize?: { kind?: unknown };
      };
      const sizeKind = packageJson.flightSize?.kind;
      const renderers = readdirSync(sourceDirectory)
        .map((name) => /^render\.(canvas|dom|webgl|webgpu)\.ts$/.exec(name)?.[1] ?? null)
        .filter((renderer): renderer is FixtureRenderer => renderer !== null)
        .sort();
      return {
        imports: typescriptFiles(fixtureDirectory).flatMap((file) => collectFixtureImports(file, fixtureDirectory)),
        kind: sizeKind === undefined ? 'feature' : sizeKind === 'size-only-control' ? sizeKind : 'invalid',
        manifest: existsSync(join(fixtureDirectory, 'tool-capture.json'))
          ? readCaptureManifest(join(fixtureDirectory, 'tool-capture.json'))
          : null,
        name: entry.name,
        rendererBindingCalls: typescriptFiles(fixtureDirectory).flatMap((file) =>
          collectRendererBindingCalls(file, fixtureDirectory),
        ),
        renderers,
      };
    });
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function collectFixtureImports(file: string, sourceDirectory: string): FixtureImport[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: FixtureImport[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    if (statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const importedNames: string[] = [];
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) importedNames.push('*');
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        importedNames.push(...bindings.elements.map((element) => (element.propertyName ?? element.name).text));
      }
      if (statement.importClause?.name !== undefined) importedNames.push('default');
    } else if (statement.exportClause === undefined) {
      importedNames.push('*');
    } else if (ts.isNamedExports(statement.exportClause)) {
      importedNames.push(
        ...statement.exportClause.elements.map((element) => (element.propertyName ?? element.name).text),
      );
    }
    imports.push({
      file: file.slice(sourceDirectory.length + 1),
      importedNames,
      specifier: statement.moduleSpecifier.text,
    });
  }
  return imports;
}

function collectRendererBindingCalls(file: string, sourceDirectory: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const registrationNames = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (
      statement.moduleSpecifier.text !== '@flighthq/render' &&
      !statement.moduleSpecifier.text.startsWith('@flighthq/render/')
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (importedName === 'registerRenderer' || importedName === 'registerRenderers') {
        registrationNames.add(element.name.text);
      }
    }
  }

  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && registrationNames.has(node.expression.text)) {
      calls.push(`${file.slice(sourceDirectory.length + 1)}:${node.expression.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function importFamily(specifier: string): ImportFamily | null {
  const match = /^@flighthq\/([^/]+)(?:\/|$)/.exec(specifier);
  const packageName = match?.[1];
  if (packageName === undefined) return null;
  if (packageName.endsWith('-dom')) return 'dom';
  if (packageName.endsWith('-canvas')) return 'canvas';
  if (packageName.endsWith('-gl')) return 'webgl';
  if (packageName.endsWith('-wgpu')) return 'webgpu';
  return null;
}

const domShapeCanvasBridgeFixtures = new Set([
  'scene2d-dom-morphshape',
  'scene2d-dom-scale9shape',
  'scene2d-dom-shape',
]);

function isAllowedDomShapeCanvasBridge(
  fixture: Readonly<MinimalCaptureFixture>,
  item: Readonly<FixtureImport & { family: ImportFamily | null }>,
): boolean {
  if (!domShapeCanvasBridgeFixtures.has(fixture.name) || item.specifier !== '@flighthq/scene2d-canvas') return false;
  const allowed = new Set([
    'createCanvasShapeRasterizer',
    'createCanvasTextureResolvers',
    'defaultCanvasShapeCommands',
    'registerCanvasShapeCommands',
  ]);
  return item.importedNames.length > 0 && item.importedNames.every((name) => allowed.has(name));
}

function forbiddenImportFamilies(renderer: FixtureRenderer): ImportFamily[] {
  switch (renderer) {
    case 'dom':
      return ['canvas', 'webgl', 'webgpu'];
    case 'canvas':
      return ['webgl', 'webgpu'];
    case 'webgl':
      return ['canvas', 'webgpu'];
    case 'webgpu':
      return ['canvas', 'webgl'];
  }
}
