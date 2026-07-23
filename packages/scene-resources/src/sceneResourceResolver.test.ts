import { createTexture } from '@flighthq/texture';
import {
  ResourceResolutionState,
  EntityRuntimeKey,
  ImageResourceReferenceKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types';
import { SceneResourceResolverRuntimeKey } from '@flighthq/types';
import type { SceneResourceInFlight, SceneResourceResolverWithRuntime } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createSceneMaterialTextureRegistry } from './sceneMaterialTextureRegistry';
import {
  createBuiltInSceneResourceResolver,
  createSceneResourceResolver,
  disposeSceneResourceResolver,
} from './sceneResourceResolver';

describe('createBuiltInSceneResourceResolver', () => {
  it('assembles Standard PBR and Unlit discovery only through the explicit built-in constructor', () => {
    const resolver = createBuiltInSceneResourceResolver();
    expect(resolver.registry.listers.has(StandardPbrMaterialKind)).toBe(true);
    expect(resolver.registry.listers.has(UnlitMaterialKind)).toBe(true);
    disposeSceneResourceResolver(resolver);
  });
});

describe('createSceneResourceResolver', () => {
  it('creates an Entity with an empty registry and private runtime machinery', () => {
    const resolver = createSceneResourceResolver();
    const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
    expect(EntityRuntimeKey in resolver).toBe(true);
    expect(resolver.registry.listers.size).toBe(0);
    expect(typeof resolver.fetch).toBe('function');
    expect(runtime.inFlight.size).toBe(0);
    expect(runtime.signals).toBeNull();
    expect(runtime.loader).toBeDefined();
    disposeSceneResourceResolver(resolver);
  });
});

describe('createSceneResourceResolver options', () => {
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
        failure: null,
        kind: ImageResourceReferenceKind.Embedded,
        mimeType: null,
        state: ResourceResolutionState.Loading,
      },
    });
    const entry: SceneResourceInFlight = {
      controller,
      promise: Promise.resolve(),
      subscribers: new Set([texture]),
    };
    const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
    runtime.inFlight.set(texture.resource!, entry);

    disposeSceneResourceResolver(resolver);
    expect(controller.signal.aborted).toBe(true);
    expect(runtime.inFlight.size).toBe(0);
  });
});
