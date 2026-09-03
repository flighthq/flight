import { createBlinnPhongMaterial, createStandardPbrMaterial, createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResourceReference, Texture } from '@flighthq/types/contract';
import { EntityRuntimeKey, ImageResourceReferenceKind, ResourceResolutionState } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';

function embeddedRef(state: ResourceResolutionState = ResourceResolutionState.Unresolved): ImageResourceReference {
  return {
    [EntityRuntimeKey]: undefined,
    alphaType: 'straight',
    bytes: new Uint8Array([1, 2, 3]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType: 'image/png',
    state,
  };
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
    getScene3DResourceTextures(out, scene);
    expect(out).toContain(rootMap);
    expect(out).toContain(childMap);
    expect(out).toHaveLength(2);
    expect(getScene3DTextureResourceReference(scene, rootMap)).toBe(rootRef);
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
    getScene3DResourceTextures(out, scene);
    expect(out).toEqual([shared]);
  });

  it('ignores a texture that carries no resource ref, since nothing needs fetching for it', () => {
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
    getScene3DResourceTextures(out, scene);
    expect(out).toEqual([pending]);
  });

  it('finds a texture on any material kind, with nothing registered', () => {
    // The defect this closes: discovery used to run through a per-kind lister registry, so a kind with
    // no lister — BlinnPhongMaterial here, and every custom kind — was undiscoverable. The map was
    // never requested and the model rendered untextured in silence. Now the resource's own back-edge
    // answers, so no registration exists to forget.
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial({ specularMap: map })]));

    const out: Texture[] = [];
    getScene3DResourceTextures(out, scene);
    expect(out).toEqual([map]);
  });

  it('returns a texture whose material hangs off no mesh, which is the cost of dropping the registry', () => {
    // Honest about the trade: the lister walk used to narrow the set by mesh attachment, so an orphan
    // material's map was not fetched. That narrowing only ever held while every kind in the scene was
    // describable, and it cost a registry the caller had to know to populate. The residue is one
    // over-fetch for a document carrying materials it never attaches.
    const attachedRef = embeddedRef();
    const orphanRef = embeddedRef();
    const attached = createTexture({ resource: attachedRef });
    const orphan = createTexture({ resource: orphanRef });
    const scene = createScene3D();
    scene.resources.push(attachedRef, orphanRef);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: attached })]));

    const out: Texture[] = [];
    getScene3DResourceTextures(out, scene);
    expect(out).toEqual([attached, orphan]);
  });

  it('clears out before filling it', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const mesh = createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]);
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, mesh);
    const out: Texture[] = [createTexture(), createTexture()];
    getScene3DResourceTextures(out, scene);
    expect(out).toEqual([map]);
  });
});

describe('getScene3DTextureResourceReference', () => {
  it('returns null for a texture outside the scene resource sidecar', () => {
    expect(getScene3DTextureResourceReference(createScene3D(), createTexture())).toBeNull();
  });
});
