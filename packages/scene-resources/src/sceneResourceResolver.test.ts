import { createTexture } from '@flighthq/texture';
import {
  ResourceResolutionState,
  ImageResourceReferenceKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createSceneMaterialTextureRegistry } from './sceneMaterialTextureRegistry';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';
import type { SceneResourceInFlight } from './sceneResourceResolver';

describe('createSceneResourceResolver', () => {
  it('defaults to a built-in-populated registry, a web fetch, empty in-flight, and no signals', () => {
    const resolver = createSceneResourceResolver();
    expect(resolver.registry.listers.has(StandardPbrMaterialKind)).toBe(true);
    expect(resolver.registry.listers.has(UnlitMaterialKind)).toBe(true);
    expect(typeof resolver.fetch).toBe('function');
    expect(resolver.inFlight.size).toBe(0);
    expect(resolver.signals).toBeNull();
    expect(resolver.loader).toBeDefined();
    disposeSceneResourceResolver(resolver);
  });

  it('uses a caller-supplied registry and fetch wholesale', () => {
    const registry = createSceneMaterialTextureRegistry();
    const fetch = async () => null;
    const resolver = createSceneResourceResolver({ fetch, registry });
    expect(resolver.registry).toBe(registry);
    expect(resolver.registry.listers.has(UnlitMaterialKind)).toBe(false);
    expect(resolver.fetch).toBe(fetch);
    disposeSceneResourceResolver(resolver);
  });
});

describe('disposeSceneResourceResolver', () => {
  it('aborts every in-flight controller and clears the map', () => {
    const resolver = createSceneResourceResolver();
    const controller = new AbortController();
    const texture = createTexture({
      resource: {
        bytes: new Uint8Array(0),
        kind: ImageResourceReferenceKind.Embedded,
        mimeType: null,
        state: ResourceResolutionState.Loading,
      },
    });
    const entry: SceneResourceInFlight = {
      controller,
      key: 'k',
      promise: Promise.resolve(),
      subscribers: new Set([texture]),
    };
    resolver.inFlight.set(texture.resource!, entry);

    disposeSceneResourceResolver(resolver);
    expect(controller.signal.aborted).toBe(true);
    expect(resolver.inFlight.size).toBe(0);
  });
});
