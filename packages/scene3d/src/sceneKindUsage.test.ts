import { createBlinnPhongMaterial, createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResourceReference } from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceReferenceKind,
  MeshKind,
  Node3DKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { createScene3D } from './scene';
import { createScene3DKindUsage, getScene3DKindUsage } from './sceneKindUsage';
import { createNode3D } from './sceneNode';

function embeddedRef(mimeType: string | null = 'image/png'): ImageResourceReference {
  return {
    [EntityRuntimeKey]: undefined,
    alphaType: 'straight',
    bytes: new Uint8Array([1, 2, 3]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType,
    state: ResourceResolutionState.Unresolved,
  };
}

describe('createScene3DKindUsage', () => {
  it('starts empty so a caller can reuse one record across scenes', () => {
    const usage = createScene3DKindUsage();
    expect(Object.hasOwn(usage, EntityRuntimeKey)).toBe(true);
    expect(usage).toMatchObject({
      materialKinds: [],
      modifierKinds: [],
      nodeKinds: [],
      resourceMimeTypes: [],
      textureSourceKinds: [],
    });
  });
});

describe('getScene3DKindUsage', () => {
  it('collects distinct material kinds across meshes, sorted and deduped', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial()]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.materialKinds).toEqual(['BlinnPhongMaterial', 'UnlitMaterial']);
  });

  it('reports node kinds including non-mesh groups, leaving the render rule to the consumer', () => {
    const scene = createScene3D();
    const group = createNode3D(Node3DKind);
    addNodeChild(group, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));
    addNodeChild(scene.root, group);

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.nodeKinds).toEqual([MeshKind, Node3DKind]);
  });

  it('reads modifier kinds structurally, off any material carrying a stack', () => {
    const rim = createRimModifier({ color: 0x49d8ffff, intensity: 0.72, power: 2.4 });
    const material = createShadedMaterial();
    material.modifiers = [rim];
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [material]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.modifierKinds).toEqual([rim.kind]);
    expect(usage.materialKinds).toEqual(['ShadedMaterial']);
  });

  it('leaves modifier kinds empty for a material family that has no stack', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.modifierKinds).toEqual([]);
  });

  it('skips null material slots', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [null, createUnlitMaterial()]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.materialKinds).toEqual(['UnlitMaterial']);
  });

  it('reports the image source kind and MIME type of a consumed resource', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.textureSourceKinds).toEqual(['image']);
    expect(usage.resourceMimeTypes).toEqual(['image/png']);
  });

  it('ignores a resource no texture consumes, since nothing will ever fetch it', () => {
    const scene = createScene3D();
    scene.resources.push(embeddedRef());

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.textureSourceKinds).toEqual([]);
    expect(usage.resourceMimeTypes).toEqual([]);
  });

  it('omits the MIME type when the container declared none, but still needs the resolver', () => {
    const ref = embeddedRef(null);
    createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    expect(usage.resourceMimeTypes).toEqual([]);
    expect(usage.textureSourceKinds).toEqual(['image']);
  });

  it('clears every list, so a reused record does not accumulate', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));

    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, scene);
    getScene3DKindUsage(usage, scene);
    expect(usage.materialKinds).toEqual(['UnlitMaterial']);
    expect(usage.nodeKinds).toEqual([MeshKind, Node3DKind]);
  });
});
