import { createStandardPbrMaterial, createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene3D } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { ImageResourceReference, Texture } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { getScene3DResourceTextures } from './getScene3DResourceTextures';
import {
  createScene3DMaterialTextureRegistry,
  registerBuiltInScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

function embeddedRef(state: ResourceResolutionState = ResourceResolutionState.Unresolved): ImageResourceReference {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType: 'image/png',
    state,
  };
}

function registry() {
  const r = createScene3DMaterialTextureRegistry();
  registerBuiltInScene3DMaterialTextures(r);
  return r;
}

describe('getScene3DResourceTextures', () => {
  it('finds pending textures on the root mesh and descendants', () => {
    const rootMap = createTexture({ resource: embeddedRef() });
    const childMap = createTexture({ resource: embeddedRef() });
    const root = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: rootMap })]);
    const child = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: childMap })]);
    addNodeChild(root, child);

    const out: Texture[] = [];
    getScene3DResourceTextures(root, registry(), out);
    expect(out).toContain(rootMap);
    expect(out).toContain(childMap);
    expect(out).toHaveLength(2);
  });

  it('walks a group scene root that is not itself a mesh', () => {
    const map = createTexture({ resource: embeddedRef() });
    const scene = createScene3D();
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    addNodeChild(scene.root, mesh);

    const out: Texture[] = [];
    getScene3DResourceTextures(scene.root, registry(), out);
    expect(out).toEqual([map]);
  });

  it('dedupes a texture shared across meshes and materials', () => {
    const shared = createTexture({ resource: embeddedRef() });
    const scene = createScene3D();
    const a = createMesh(createBoxMeshGeometry(), [
      createUnlitMaterial({ baseColorMap: shared }),
      createStandardPbrMaterial({ baseColorMap: shared }),
    ]);
    const b = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: shared })]);
    addNodeChild(scene.root, a);
    addNodeChild(scene.root, b);

    const out: Texture[] = [];
    getScene3DResourceTextures(scene.root, registry(), out);
    expect(out).toEqual([shared]);
  });

  it('ignores a texture that carries no resource ref', () => {
    const bound = createTexture();
    const pending = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [
      createStandardPbrMaterial({ baseColorMap: bound, normalMap: pending }),
    ]);

    const out: Texture[] = [];
    getScene3DResourceTextures(mesh, registry(), out);
    expect(out).toEqual([pending]);
  });

  it('skips null material slots', () => {
    const map = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [null, createUnlitMaterial({ baseColorMap: map })]);
    const out: Texture[] = [];
    getScene3DResourceTextures(mesh, registry(), out);
    expect(out).toEqual([map]);
  });

  it('clears out before filling it', () => {
    const map = createTexture({ resource: embeddedRef() });
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    const out: Texture[] = [createTexture(), createTexture()];
    getScene3DResourceTextures(mesh, registry(), out);
    expect(out).toEqual([map]);
  });
});
