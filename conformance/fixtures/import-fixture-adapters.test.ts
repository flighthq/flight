import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConformanceFixtureInput, ConformanceFixtureTree } from '../core/fixture-conformance';
import { createImportFixtureAdapters } from './import-fixture-adapters';

let workspace = '';

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'flight-import-fixture-adapters-'));
});

afterEach(() => {
  rmSync(workspace, { force: true, recursive: true });
});

describe('createImportFixtureAdapters', () => {
  it('declares each not-yet-supported 3D family as its own implementation slot', () => {
    const adapters = createImportFixtureAdapters();

    expect(
      adapters.filter((adapter) => adapter.implementation.state === 'unavailable').map((adapter) => adapter.id),
    ).toEqual([
      'alembic',
      'blender',
      'bvh',
      'collada',
      'directx-x',
      'fbx',
      'lightwave',
      'ply',
      'stl',
      'three-ds-max',
      'usd',
      'woff2',
    ]);
  });

  it('publishes only the ten exact reviewed intentional-choice kinds', () => {
    const adapters = createImportFixtureAdapters();
    const choices = Object.fromEntries(
      adapters
        .filter((adapter) => adapter.diagnosticKindDispositions.length > 0)
        .map((adapter) => [adapter.id, adapter.diagnosticKindDispositions.map((disposition) => disposition.kind)]),
    );

    expect(choices).toEqual({
      'md5-animation': ['md5anim.bounds-unsupported'],
      svg: [
        'svg.unsupported-animate',
        'svg.unsupported-animateMotion',
        'svg.unsupported-animateTransform',
        'svg.unsupported-filter',
        'svg.unsupported-foreignObject',
        'svg.unsupported-script',
        'svg.unsupported-set',
      ],
      swf: ['swf.define-binary-data', 'swf.frame-script-declined'],
    });
    expect(adapters.find((adapter) => adapter.id === 'skeleton2d-json')?.diagnosticKindDispositions).toEqual([]);
  });

  it('routes current and future fixture families without cross-claiming ambiguous JSON', () => {
    const adapters = createImportFixtureAdapters();
    const selected = (tree: ConformanceFixtureTree, reference: string): string[] =>
      adapters.filter((adapter) => adapter.selects(tree, reference)).map((adapter) => adapter.id);

    expect(selected(tree('spine-fixtures'), 'hero/skeleton.json')).toEqual(['skeleton2d-json']);
    expect(selected(tree('particle-fixtures'), 'unity/smoke.json')).toEqual(['particle-config']);
    expect(selected(tree('dragonbones-fixtures'), 'hero_ske.json')).toEqual(['skeleton2d-json']);
    expect(selected(tree('mesh-legacy-fixtures'), 'models/source.fbx')).toEqual(['fbx']);
    expect(selected(tree('unrelated-fixtures'), 'bytecode.abc')).toEqual([]);
    expect(selected(tree('font-fixtures'), 'fonts/source.woff2')).toEqual(['woff2']);
    expect(selected(tree('gltf-khronos'), 'textures/source.ktx2')).toEqual(['ktx2']);
  });

  it('supplies an OBJ material sidecar to the scene importer path', async () => {
    const directory = join(workspace, 'tree');
    write(directory, 'model.obj', 'mtllib model.mtl\nusemtl body\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    write(directory, 'model.mtl', 'newmtl body\nKd invalid\n');
    const adapter = createImportFixtureAdapters().find((candidate) => candidate.id === 'obj')!;
    if (adapter.implementation.state !== 'available') throw new Error('OBJ fixture adapter must be available');

    const observation = await adapter.implementation.run(input(directory, 'model.obj', ['model.mtl', 'model.obj']));

    expect(observation.diagnostics.map((diagnostic) => diagnostic.kind)).toContain('mtl.color-malformed');
  });
});

function input(directory: string, reference: string, references: readonly string[]): ConformanceFixtureInput {
  return {
    absolutePath: join(directory, reference),
    reference,
    references,
    tree: tree('mesh-legacy-fixtures', directory),
  };
}

function tree(id: string, directory = workspace): ConformanceFixtureTree {
  return {
    directory,
    packs: [{ id, verifiedFixtureFiles: 1, verifiedFixturePaths: ['fixture.asset'] }],
    release: 'fixture-release',
    tree: id,
    variant: 'full',
  };
}

function write(root: string, reference: string, text: string): void {
  const path = join(root, ...reference.split('/'));
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text, 'utf8');
}
