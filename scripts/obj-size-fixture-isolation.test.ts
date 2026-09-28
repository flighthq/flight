// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const FIXTURES_DIR = resolve(import.meta.dirname, '..', 'tools', 'size', 'fixtures');

function fixtureSource(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts'), 'utf8');
}

function fixtureMetadata(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name, 'package.json'), 'utf8')) as Record<string, unknown>;
}

async function bundleFixture(name: string): Promise<{ code: string; modules: Map<string, number> }> {
  const entry = resolve(FIXTURES_DIR, name, 'src', 'render.canvas.ts');
  const result = await build({
    bundle: true,
    entryPoints: [entry],
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  const modules = new Map<string, number>();
  for (const [file, contribution] of Object.entries(output.inputs)) {
    if (contribution.bytesInOutput <= 0) continue;
    const match = /packages\/scene3d-formats\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (match !== null) modules.set(match[1], contribution.bytesInOutput);
  }
  return { code: result.outputFiles[0].text, modules };
}

function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

describe('OBJ material-path full fixture (obj-import-material)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('obj-import-material');
    expect(metadata).toMatchObject({ flightSize: { kind: 'size-only-control', name: 'obj-import-material' } });
  });

  it('provides a material library so handler dispatch is reachable', () => {
    const source = fixtureSource('obj-import-material');
    expect(source).toContain('parseObj');
    expect(source).toContain('materials');
    expect(source).toContain('usemtl');
  });

  it('reaches both handler modules', async () => {
    const bundle = await bundleFixture('obj-import-material');
    expect(bundle.modules.get('objBlinnPhongMaterialHandler.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('objStandardPbrMaterialHandler.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('objMaterialRegistry.ts')).toBeGreaterThan(0);
  });
});

describe('OBJ material-path selective fixture (obj-import-material-selective)', () => {
  it('declares size-only-control metadata', () => {
    const metadata = fixtureMetadata('obj-import-material-selective');
    expect(metadata).toMatchObject({
      flightSize: { kind: 'size-only-control', name: 'obj-import-material-selective' },
    });
  });

  it('imports only the Blinn-Phong handler', () => {
    const source = fixtureSource('obj-import-material-selective');
    const code = source.replace(/\/\/.*$/gm, '');
    expect(code).toContain('objBlinnPhongMaterialHandler');
    expect(code).toContain('parseObjWithMaterialHandlers');
    expect(code).not.toMatch(/\bparseObj\s*\(/);
    expect(code).not.toContain('objAllMaterialHandlers');
    expect(code).not.toContain('objStandardPbrMaterialHandler');
  });

  it('excludes the StandardPbr handler module', async () => {
    const bundle = await bundleFixture('obj-import-material-selective');
    expect(bundle.modules.get('objBlinnPhongMaterialHandler.ts')).toBeGreaterThan(0);
    expect(bundle.modules.get('objStandardPbrMaterialHandler.ts') ?? 0).toBe(0);
    expect(bundle.modules.get('objMaterialRegistry.ts') ?? 0).toBe(0);
  });
});

describe('OBJ material-path fixture differentiation', () => {
  it('full bundle is larger than selective by the omitted PBR handler', async () => {
    const full = await bundleFixture('obj-import-material');
    const selective = await bundleFixture('obj-import-material-selective');
    expect(full.code.length).toBeGreaterThan(selective.code.length);
    expect(full.code.includes(keptFunctionName('objMaterialToStandardPbr'))).toBe(true);
    expect(selective.code.includes(keptFunctionName('objMaterialToStandardPbr'))).toBe(false);
    expect(full.code.includes(keptFunctionName('objMaterialToBlinnPhong'))).toBe(true);
    expect(selective.code.includes(keptFunctionName('objMaterialToBlinnPhong'))).toBe(true);
  });
});
