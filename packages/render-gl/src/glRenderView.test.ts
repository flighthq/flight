import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { GlRenderViewResources } from '@flighthq/types/contract';

import { createEmptyGlRenderRegistries } from './glPipeline';
import { createGlRenderViewResources, destroyGlRenderViewResources, resizeGlRenderViewResources } from './glRenderView';
import { makeGL } from './glTestHelper';

function makeResources(width = 640, height = 480, devicePixelRatio = 1): GlRenderViewResources {
  return createGlRenderViewResources(makeGL(), createEmptyGlRenderRegistries(), width, height, devicePixelRatio);
}

describe('createGlRenderViewResources', () => {
  it('allocates Entity-backed state, storage and a viewport at the requested extent', () => {
    const resources = makeResources(640, 480, 2);

    expect(EntityRuntimeKey in resources.renderState).toBe(true);
    expect(EntityRuntimeKey in resources.renderTarget).toBe(true);
    expect(EntityRuntimeKey in resources.viewport).toBe(true);
    expect(resources.renderTarget.width).toBe(640);
    expect(resources.renderTarget.height).toBe(480);
    expect(resources.viewport.width).toBe(640);
    expect(resources.viewport.height).toBe(480);
    expect(resources.viewport.devicePixelRatio).toBe(2);
    expect(resources.renderState.pixelRatio).toBe(2);
  });
});

describe('destroyGlRenderViewResources', () => {
  it('releases the storage and state this builder allocated', () => {
    const resources = makeResources();

    expect(() => destroyGlRenderViewResources(resources)).not.toThrow();
  });
});

describe('resizeGlRenderViewResources', () => {
  it('reallocates storage for a new device-pixel extent', () => {
    const resources = makeResources(640, 480);

    resizeGlRenderViewResources(resources, 800, 600);

    expect(resources.renderTarget.width).toBe(800);
    expect(resources.renderTarget.height).toBe(600);
  });

  it('is idempotent at the extent storage already holds', () => {
    const resources = makeResources(640, 480);

    resizeGlRenderViewResources(resources, 640, 480);

    expect(resources.renderTarget.width).toBe(640);
    expect(resources.renderTarget.height).toBe(480);
  });
});
