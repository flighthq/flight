import { createStandardPbrMaterial, createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { SceneResourceRef, Texture } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { getSceneResourceTextures } from './getSceneResourceTextures';
import {
  createSceneMaterialTextureRegistry,
  registerBuiltInSceneMaterialTextures,
} from './sceneMaterialTextureRegistry';

function embeddedRef(state: ResourceResolutionState = ResourceResolutionState.Unresolved): SceneResourceRef {
  return { bytes: new Uint8Array([1, 2, 3]), kind: SceneResourceRefKind.Embedded, mimeType: 'image/png', state };
}

function registry() {
  const r = createSceneMaterialTextureRegistry();
  registerBuiltInSceneMaterialTextures(r);
  return r;
}

describe('getSceneResourceTextures', () => {
  it('finds pending textures on the root mesh and descendants', () => {
    const rootMap = createTexture({ resource: embeddedRef() });
    const childMap = createTexture({ resource: embeddedRef() });
    const root = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: rootMap })]);
    const child = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: childMap })]);
    addNodeChild(root, child);

    const out: Texture[] = [];
    getSceneResourceTextures(root, registry(), out);
    expect(out).toContain(rootMap);
    expect(out).toContain(childMap);
    expect(out).toHaveLength(2);
  });

  it('walks a group scene root that is not itself a mesh', () => {
    const map = createTexture({ resource: embeddedRef() });
    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    addNodeChild(scene, mesh);

    const out: Texture[] = [];
    getSceneResourceTextures(scene, registry(), out);
    expect(out).toEqual([map]);
  });

  it('dedupes a texture shared across meshes and materials', () => {
    const shared = createTexture({ resource: embeddedRef() });
    const scene = createScene();
    const a = createMesh(createBoxMeshGeometry(), [
      createUnlitMaterial({ baseColorMap: shared }),
      createStandardPbrMaterial({ baseColorMap: shared }),
    ]);
    const b = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: shared })]);
    addNodeChild(scene, a);
    addNodeChild(scene, b);

    const out: Texture[] = [];
    getSceneResourceTextures(scene, registry(), out);
    expect(out).toEqual([shared]);
  });

  it('ignores a texture that carries no resource ref', () => {
    const bound = createTexture();
    const pending = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [
      createStandardPbrMaterial({ baseColorMap: bound, normalMap: pending }),
    ]);

    const out: Texture[] = [];
    getSceneResourceTextures(mesh, registry(), out);
    expect(out).toEqual([pending]);
  });

  it('skips null material slots', () => {
    const map = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [null, createUnlitMaterial({ baseColorMap: map })]);
    const out: Texture[] = [];
    getSceneResourceTextures(mesh, registry(), out);
    expect(out).toEqual([map]);
  });

  it('clears out before filling it', () => {
    const map = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    const out: Texture[] = [createTexture(), createTexture()];
    getSceneResourceTextures(mesh, registry(), out);
    expect(out).toEqual([map]);
  });
});
