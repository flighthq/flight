import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ImageResourceFailureKind, ImageResourceReferenceKind, ResourceResolutionState } from '@flighthq/types';
import { describe, expect, it, vi } from 'vitest';

import { resolveSceneResourcesAndWait } from './resolveSceneResourcesAndWait';
import { waitForSceneResourceResolver } from './resolveSceneResourcesAndWait';
import {
  explainImageResourceReferenceResolution,
  resetFailedImageResourceReference,
  retryFailedSceneResources,
} from './sceneResourceRecovery';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as ImageResource;

function externalRef(state: ResourceResolutionState = ResourceResolutionState.Unresolved): ImageResourceReference {
  return {
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state,
    uri: 'leaf.png',
  };
}

describe('explainImageResourceReferenceResolution', () => {
  it('returns detached plain data with retry eligibility and the preserved cause', () => {
    const ref = externalRef(ResourceResolutionState.Failed);
    ref.failure = { kind: ImageResourceFailureKind.Error, message: 'decode failed', name: 'CodecError' };
    const explanation = explainImageResourceReferenceResolution(ref);
    expect(explanation).toEqual({
      failure: { kind: ImageResourceFailureKind.Error, message: 'decode failed', name: 'CodecError' },
      kind: ImageResourceReferenceKind.External,
      retryable: true,
      state: ResourceResolutionState.Failed,
    });
    expect(explanation.failure).not.toBe(ref.failure);
  });
});

describe('resetFailedImageResourceReference', () => {
  it('clears a failed cause and returns the reference to Unresolved', () => {
    const ref = externalRef(ResourceResolutionState.Failed);
    ref.failure = { kind: ImageResourceFailureKind.Unavailable, message: 'missing', name: null };
    expect(resetFailedImageResourceReference(ref)).toBe(true);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(ref.failure).toBeNull();
  });

  it('does not invalidate a non-failed reference', () => {
    const ref = externalRef(ResourceResolutionState.Resolved);
    expect(resetFailedImageResourceReference(ref)).toBe(false);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
  });
});

describe('retryFailedSceneResources', () => {
  it('resets one shared failed identity and re-requests it for every subscriber', async () => {
    const fetch = vi.fn<() => Promise<ImageResource | null>>().mockResolvedValueOnce(null).mockResolvedValue(fakeImage);
    const ref = externalRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInSceneResourceResolver({ fetch });

    await resolveSceneResourcesAndWait(scene.root, resolver);
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure?.kind).toBe(ImageResourceFailureKind.Unavailable);

    expect(retryFailedSceneResources(scene.root, resolver)).toBe(1);
    await waitForSceneResourceResolver(resolver);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ref.failure).toBeNull();
    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    disposeSceneResourceResolver(resolver);
  });

  it('honors selection and leaves an excluded failure untouched', () => {
    const ref = externalRef(ResourceResolutionState.Failed);
    ref.failure = { kind: ImageResourceFailureKind.Unavailable, message: 'missing', name: null };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    const resolver = createBuiltInSceneResourceResolver();
    expect(retryFailedSceneResources(scene.root, resolver, { select: () => false })).toBe(0);
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    disposeSceneResourceResolver(resolver);
  });
});
