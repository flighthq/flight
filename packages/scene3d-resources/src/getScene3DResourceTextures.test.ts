import { createBlinnPhongMaterial, createStandardPbrMaterial, createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResourceReference, Texture } from '@flighthq/types/contract';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';
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
    const rootRef = embeddedRef();
    const childRef = embeddedRef();
    const rootMap = createTexture({ resource: rootRef });
    const childMap = createTexture({ resource: childRef });
    const root = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: rootMap })]);
    const child = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: childMap })]);
    addNodeChild(root, child);
    const scene = createScene3D();
    scene.resources.push(rootRef, childRef);
    addNodeChild(scene.root, root);

    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toContain(rootMap);
    expect(out).toContain(childMap);
    expect(out).toHaveLength(2);
    expect(getScene3DTextureResourceReference(scene, rootMap)).toBe(rootRef);
  });

  it('walks a group scene root that is not itself a mesh', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    addNodeChild(scene.root, mesh);

    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([map]);
  });

  it('dedupes a texture shared across meshes and materials', () => {
    const ref = embeddedRef();
    const shared = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    const a = createMesh(createBoxMeshGeometry(), [
      createUnlitMaterial({ baseColorMap: shared }),
      createStandardPbrMaterial({ baseColorMap: shared }),
    ]);
    const b = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: shared })]);
    addNodeChild(scene.root, a);
    addNodeChild(scene.root, b);

    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([shared]);
  });

  it('ignores a texture that carries no resource ref', () => {
    const bound = createTexture();
    const ref = embeddedRef();
    const pending = createTexture({ resource: ref });
    const mesh = createMesh(createBoxMeshGeometry(), [
      createStandardPbrMaterial({ baseColorMap: bound, normalMap: pending }),
    ]);

    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, mesh);
    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([pending]);
  });

  it('skips null material slots', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const mesh = createMesh(createBoxMeshGeometry(), [null, createUnlitMaterial({ baseColorMap: map })]);
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, mesh);
    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([map]);
  });

  it('widens to every resource-backed texture when a material kind has no lister', () => {
    // The regression this guards: an unlisted kind used to append nothing and be indistinguishable
    // from "no maps", so the map was never requested and the model rendered untextured in silence.
    // BlinnPhongMaterial has no built-in lister, so its specularMap is unreachable through the walk.
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial({ specularMap: map })]));

    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([map]);
  });

  it('keeps narrowing when every material kind is known, dropping an unattached texture', () => {
    // The optimization the lister buys: a resource whose consuming material hangs off no mesh is not
    // requested. This only holds while every kind in the scene is describable.
    const attachedRef = embeddedRef();
    const orphanRef = embeddedRef();
    const attached = createTexture({ resource: attachedRef });
    createTexture({ resource: orphanRef });
    const scene = createScene3D();
    scene.resources.push(attachedRef, orphanRef);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: attached })]));

    const out: Texture[] = [];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([attached]);
  });

  it('clears out before filling it', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, mesh);
    const out: Texture[] = [createTexture(), createTexture()];
    getScene3DResourceTextures(scene, registry(), out);
    expect(out).toEqual([map]);
  });
});

describe('getScene3DTextureResourceReference', () => {
  it('returns null for a texture outside the scene resource sidecar', () => {
    expect(getScene3DTextureResourceReference(createScene3D(), createTexture())).toBeNull();
  });
});
