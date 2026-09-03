import { createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { createTexture, getTextureSource } from '@flighthq/texture/contract';
import type { ImageResource, ImageResourceReference } from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { loadScene3DResources, waitForScene3DResourceResolver } from './loadScene3DResources';
import { retryFailedScene3DResources } from './sceneResourceRecovery';
import { createBuiltInScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as ImageResource;

function externalRef(state: ResourceResolutionState = ResourceResolutionState.Unresolved): ImageResourceReference {
  return {
    [EntityRuntimeKey]: undefined,
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state,
    uri: 'leaf.png',
  };
}

describe('retryFailedScene3DResources', () => {
  it('resets one shared failed identity and re-requests it for every subscriber', async () => {
    const fetch = vi.fn<() => Promise<ImageResource | null>>().mockResolvedValueOnce(null).mockResolvedValue(fakeImage);
    const ref = externalRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch });

    await loadScene3DResources(scene, resolver);
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure?.kind).toBe(ImageResourceFailureKind.Unavailable);

    expect(retryFailedScene3DResources(scene, resolver)).toBe(1);
    await waitForScene3DResourceResolver(resolver);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ref.failure).toBeNull();
    expect(getTextureSource(a)).toBe(fakeImage);
    expect(getTextureSource(b)).toBe(fakeImage);
    disposeScene3DResourceResolver(resolver);
  });

  it('honors selection and leaves an excluded failure untouched', () => {
    const ref = externalRef(ResourceResolutionState.Failed);
    ref.failure = {
      [EntityRuntimeKey]: undefined,
      kind: ImageResourceFailureKind.Unavailable,
      message: 'missing',
      name: null,
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene3D();
    scene.resources.push(ref);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    const resolver = createBuiltInScene3DResourceResolver();
    expect(retryFailedScene3DResources(scene, resolver, { select: () => false })).toBe(0);
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    disposeScene3DResourceResolver(resolver);
  });
});
