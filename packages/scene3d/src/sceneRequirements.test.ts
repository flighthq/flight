import { createBlinnPhongMaterial, createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResourceReference, Scene3DRequirement } from '@flighthq/types/contract';
import { ImageResourceReferenceKind, ResourceResolutionState, Scene3DRegistry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { createScene3D } from './scene';
import { getScene3DRequirements } from './sceneRequirements';

function embeddedRef(mimeType: string | null = 'image/png'): ImageResourceReference {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType,
    state: ResourceResolutionState.Unresolved,
  };
}

describe('getScene3DRequirements', () => {
  it('reports a material renderer per distinct material kind, deduped across meshes', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial()]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out).toEqual([
      { key: 'BlinnPhongMaterial', registry: Scene3DRegistry.MaterialRenderer },
      { key: 'UnlitMaterial', registry: Scene3DRegistry.MaterialRenderer },
    ]);
  });

  it('returns an empty list for a scene with no meshes and no resources', () => {
    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(createScene3D(), out);
    expect(out).toEqual([]);
  });

  it('skips null material slots', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [null, createUnlitMaterial()]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out).toEqual([{ key: 'UnlitMaterial', registry: Scene3DRegistry.MaterialRenderer }]);
  });

  it('walks nested descendants, not just the root child', () => {
    const scene = createScene3D();
    const group = createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]);
    addNodeChild(group, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial()]));
    addNodeChild(scene.root, group);

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out.map((r) => r.key)).toEqual(['BlinnPhongMaterial', 'UnlitMaterial']);
  });

  it('reports both modifier registries for each modifier kind, read structurally', () => {
    const rim = createRimModifier({ color: 0x49d8ffff, intensity: 0.72, power: 2.4 });
    const scene = createScene3D();
    const material = createShadedMaterial();
    material.modifiers = [rim];
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [material]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out).toEqual([
      { key: 'ShadedMaterial', registry: Scene3DRegistry.MaterialRenderer },
      { key: rim.kind, registry: Scene3DRegistry.ModifierSnippet },
      { key: rim.kind, registry: Scene3DRegistry.ShadingModifier },
    ]);
  });

  it('omits the material texture lister when the document carries no image resources', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out.some((r) => r.registry === Scene3DRegistry.MaterialTextureLister)).toBe(false);
  });

  it('reports the lister, texture resolver and image decoder for a consumed resource', () => {
    const ref = embeddedRef();
    const map = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: map })]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out).toEqual([
      { key: 'image/png', registry: Scene3DRegistry.ImageDecoder },
      { key: 'UnlitMaterial', registry: Scene3DRegistry.MaterialRenderer },
      { key: 'UnlitMaterial', registry: Scene3DRegistry.MaterialTextureLister },
      { key: 'image', registry: Scene3DRegistry.TextureResolver },
    ]);
  });

  it('ignores a resource no texture consumes, since nothing will ever fetch it', () => {
    const ref = embeddedRef();
    const scene = createScene3D();
    scene.resources.push(ref);

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out.some((r) => r.registry === Scene3DRegistry.ImageDecoder)).toBe(false);
    expect(out.some((r) => r.registry === Scene3DRegistry.TextureResolver)).toBe(false);
  });

  it('omits the image decoder when the container declared no MIME type', () => {
    const ref = embeddedRef(null);
    createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    expect(out).toEqual([{ key: 'image', registry: Scene3DRegistry.TextureResolver }]);
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial()]));

    const out: Scene3DRequirement[] = [];
    getScene3DRequirements(scene, out);
    const first = [...out];
    getScene3DRequirements(scene, out);
    expect(out).toEqual(first);
  });
});
