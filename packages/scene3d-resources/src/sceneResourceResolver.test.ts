import { createTexture } from '@flighthq/texture/contract';
import {
  ResourceResolutionState,
  EntityRuntimeKey,
  ImageResourceReferenceKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';
import type { ImageResourceReference, Scene3DResourceInFlight } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene3DMaterialTextureRegistry } from './sceneMaterialTextureRegistry';
import {
  createBuiltInScene3DResourceResolver,
  createScene3DResourceResolver,
  disposeScene3DResourceResolver,
} from './sceneResourceResolver';

describe('createBuiltInScene3DResourceResolver', () => {
  it('assembles Standard PBR and Unlit discovery only through the explicit built-in constructor', () => {
    const resolver = createBuiltInScene3DResourceResolver();
    expect(resolver.registry.listers.has(StandardPbrMaterialKind)).toBe(true);
    expect(resolver.registry.listers.has(UnlitMaterialKind)).toBe(true);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('createScene3DResourceResolver', () => {
  it('creates an Entity with an empty registry and private runtime machinery', () => {
    const resolver = createScene3DResourceResolver();
    const runtime = resolver[Scene3DResourceResolverRuntimeKey];
    expect(EntityRuntimeKey in resolver).toBe(true);
    expect(resolver.registry.listers.size).toBe(0);
    expect(typeof resolver.fetch).toBe('function');
    expect(runtime.inFlight.size).toBe(0);
    expect(runtime.signals).toBeNull();
    expect(runtime.loader).toBeDefined();
    disposeScene3DResourceResolver(resolver);
  });
});

describe('createScene3DResourceResolver options', () => {
  it('uses a caller-supplied registry and fetch wholesale', () => {
    const registry = createScene3DMaterialTextureRegistry();
    const fetch = async () => null;
    const resolver = createScene3DResourceResolver({ fetch, registry });
    expect(resolver.registry).toBe(registry);
    expect(resolver.registry.listers.has(UnlitMaterialKind)).toBe(false);
    expect(resolver.fetch).toBe(fetch);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('disposeScene3DResourceResolver', () => {
  it('aborts every in-flight controller and clears the map', () => {
    const resolver = createScene3DResourceResolver();
    const controller = new AbortController();
    const ref = {
      alphaType: 'straight',
      bytes: new Uint8Array(0),
      failure: null,
      kind: ImageResourceReferenceKind.Embedded,
      mimeType: null,
      state: ResourceResolutionState.Loading,
    } as ImageResourceReference;
    const texture = createTexture({ resource: ref });
    const entry: Scene3DResourceInFlight = {
      controller,
      promise: Promise.resolve(),
      subscribers: new Set([texture]),
    };
    const runtime = resolver[Scene3DResourceResolverRuntimeKey];
    runtime.inFlight.set(ref, entry);

    disposeScene3DResourceResolver(resolver);
    expect(controller.signal.aborted).toBe(true);
    expect(runtime.inFlight.size).toBe(0);
  });
});
