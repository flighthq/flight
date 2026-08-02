import { createImageResource } from '@flighthq/image/contract';
import { enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, RenderRegistry } from '@flighthq/types/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { createCanvasRenderState } from './canvasRenderState';
import {
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  registerCanvasTextureResolver,
  resolveCanvasTexture,
} from './canvasTextureResolver';

// A texture whose source kind nothing has registered a resolver for — the shape a miss is reported for.
function createUnresolvableTexture() {
  const source = { height: 1, kind: BitmapTextureSourceKind, version: 0, width: 1 } as unknown as TextureSource;
  return createTexture({ dimension: '2d', source });
}

describe('connectCanvasTextureResolverMisses', () => {
  it('reports a standalone set’s misses through the connected state', () => {
    // The blind spot this closes: a set built for a DOM or GPU shape rasterizer belongs to no canvas of
    // its own, so nothing wires it and an unresolvable fill goes silently unpainted.
    const state = createCanvasRenderState(document.createElement('canvas'));
    enableRenderRegistryGuards(state);

    const resolvers = createCanvasTextureResolvers();
    connectCanvasTextureResolverMisses(resolvers, state);
    resolveCanvasTexture(resolvers, createUnresolvableTexture());

    expect(explainRenderRegistryMisses(state).misses).toEqual([
      { kind: BitmapTextureSourceKind, registry: RenderRegistry.TextureResolver },
    ]);
  });

  it('reads the emitter at call time, so guards may be enabled after the connection', () => {
    // An example may register its rasterizer before or after enabling diagnostics; neither order may
    // lose a miss, which is why this holds the state rather than the emitter it had when connected.
    const state = createCanvasRenderState(document.createElement('canvas'));
    const resolvers = createCanvasTextureResolvers();
    connectCanvasTextureResolverMisses(resolvers, state);

    enableRenderRegistryGuards(state);
    resolveCanvasTexture(resolvers, createUnresolvableTexture());

    expect(explainRenderRegistryMisses(state).misses).toHaveLength(1);
  });

  it('stays silent when the connected state has no diagnostics enabled', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const resolvers = createCanvasTextureResolvers();
    connectCanvasTextureResolverMisses(resolvers, state);

    expect(() => resolveCanvasTexture(resolvers, createUnresolvableTexture())).not.toThrow();
    expect(explainRenderRegistryMisses(state).status).toBe('complete');
  });

  it('leaves an unconnected set unreported, which is the defect it exists to fix', () => {
    // Guards the value of this function: without the connection the same miss reaches nobody, on a
    // state whose diagnostics are enabled and reporting everything else.
    const state = createCanvasRenderState(document.createElement('canvas'));
    enableRenderRegistryGuards(state);

    resolveCanvasTexture(createCanvasTextureResolvers(), createUnresolvableTexture());

    expect(explainRenderRegistryMisses(state).misses).toEqual([]);
  });
});

describe('createCanvasTextureResolvers', () => {
  it('starts empty, so a set resolves exactly what was registered on it', () => {
    const resolvers = createCanvasTextureResolvers();

    expect(resolvers.registry).toBeNull();
    expect(resolveCanvasTexture(resolvers, createTexture())).toBeNull();
  });

  it('is independent of every other set, so two backends can hold their own', () => {
    const first = createCanvasTextureResolvers();
    const second = createCanvasTextureResolvers();

    registerCanvasTextureResolver(first, BitmapTextureSourceKind, () => null);

    expect(first.registry?.has(BitmapTextureSourceKind)).toBe(true);
    expect(second.registry).toBeNull();
  });
});

describe('registerCanvasTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const textureSource = {
      height: 1,
      kind: 'acme.test',
      version: 0,
      width: 1,
    } as unknown as TextureSource;
    const texture = createTexture({ dimension: '2d', source: textureSource });
    const canvas = document.createElement('canvas');
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.test', () => canvas);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(canvas);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.test', null);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: image }),
      ),
    ).toBeNull();
  });
});
