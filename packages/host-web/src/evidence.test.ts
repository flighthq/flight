import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { OutputChunk, RollupOutput } from 'rollup';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';

const ROOT = resolve(__dirname, '../../..');
const EVIDENCE_DIR = resolve(__dirname, '../evidence');
const FIXTURES = ['control', 'capability', 'cursor', 'glyph', 'both'] as const;

type FixtureName = (typeof FIXTURES)[number];

interface FixtureResult {
  modules: string[];
  rawBytes: number;
  gzipBytes: number;
  code: string;
}

function resolveWorkspaceAliases(): Record<string, string> {
  const packagesDir = resolve(ROOT, 'packages');
  const alias: Record<string, string> = {};
  const entries = require('fs').readdirSync(packagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = resolve(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (typeof pkgJson.name === 'string') {
      alias[pkgJson.name] = resolve(packagesDir, entry.name, 'src');
    }
  }
  return alias;
}

async function buildFixture(name: FixtureName): Promise<FixtureResult> {
  const entry = resolve(EVIDENCE_DIR, `${name}.ts`);
  const alias = resolveWorkspaceAliases();

  const result = (await build({
    configFile: false,
    root: EVIDENCE_DIR,
    logLevel: 'silent',
    resolve: { alias },
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      sourcemap: false,
      rollupOptions: {
        input: entry,
        output: { format: 'es' },
      },
    },
  })) as RollupOutput;

  const chunks = result.output.filter((o): o is OutputChunk => o.type === 'chunk');
  const mainChunk = chunks.find((c) => c.isEntry) ?? chunks[0];
  const allModules = new Set<string>();
  for (const chunk of chunks) {
    for (const id of Object.keys(chunk.modules)) {
      allModules.add(id);
    }
  }

  const code = mainChunk.code;
  const rawBytes = Buffer.byteLength(code, 'utf-8');
  const gzipBytes = gzipSync(code).byteLength;

  return {
    code,
    gzipBytes,
    modules: [...allModules].map((id) => id.replace(ROOT + '/', '')),
    rawBytes,
  };
}

function sourceModules(modules: string[]): string[] {
  return modules.filter((m) => !m.includes('/evidence/'));
}

function hasHostWebModule(modules: string[]): boolean {
  return sourceModules(modules).some((m) => m.includes('packages/host-web/'));
}

function hasGlyphModule(modules: string[]): boolean {
  return sourceModules(modules).some((m) => m.includes('webGlyphRasterizer'));
}

function hasCursorModule(modules: string[]): boolean {
  return sourceModules(modules).some((m) => m.includes('webCursor'));
}

describe('evidence: tree-shaking isolation', () => {
  const results = new Map<FixtureName, FixtureResult>();

  async function getFixture(name: FixtureName): Promise<FixtureResult> {
    let result = results.get(name);
    if (result === undefined) {
      result = await buildFixture(name);
      results.set(name, result);
    }
    return result;
  }

  it('control fixture contains zero host-web modules', async () => {
    const { modules } = await getFixture('control');
    expect(hasHostWebModule(modules)).toBe(false);
  });

  it('capability fixture contains zero host-web modules', async () => {
    const { modules } = await getFixture('capability');
    expect(hasHostWebModule(modules)).toBe(false);
  });

  it('cursor fixture excludes glyph rasterizer modules', async () => {
    const { modules } = await getFixture('cursor');
    expect(hasHostWebModule(modules)).toBe(true);
    expect(hasGlyphModule(modules)).toBe(false);
  });

  it('glyph fixture excludes cursor modules', async () => {
    const { modules } = await getFixture('glyph');
    expect(hasHostWebModule(modules)).toBe(true);
    expect(hasCursorModule(modules)).toBe(false);
  });

  it('both module set is within the union of cursor and glyph', async () => {
    const [cursorResult, glyphResult, bothResult] = await Promise.all([
      getFixture('cursor'),
      getFixture('glyph'),
      getFixture('both'),
    ]);
    const union = new Set([...sourceModules(cursorResult.modules), ...sourceModules(glyphResult.modules)]);
    const outsideUnion = sourceModules(bothResult.modules).filter((m) => !union.has(m));
    expect(outsideUnion).toEqual([]);
  });

  it('reports control-normalized sizes', async () => {
    const control = await getFixture('control');
    const names: FixtureName[] = ['capability', 'cursor', 'glyph', 'both'];
    for (const name of names) {
      const fixture = await getFixture(name);
      const rawDelta = fixture.rawBytes - control.rawBytes;
      const gzipDelta = fixture.gzipBytes - control.gzipBytes;
      console.log(
        `${name}: raw=${fixture.rawBytes} (${rawDelta >= 0 ? '+' : ''}${rawDelta}), ` +
          `gzip=${fixture.gzipBytes} (${gzipDelta >= 0 ? '+' : ''}${gzipDelta})`,
      );
    }
    console.log(`control: raw=${control.rawBytes}, gzip=${control.gzipBytes}`);
  });
});
