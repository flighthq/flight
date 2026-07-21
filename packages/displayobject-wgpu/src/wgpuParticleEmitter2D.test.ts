import { createParticleEmitter2D } from '@flighthq/particleemitter';
import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { defaultWgpuParticleEmitter2DRenderer, drawWgpuParticleEmitter2D } from './wgpuParticleEmitter2D';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuParticleEmitter2DRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuParticleEmitter2DRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuParticleEmitter2DRenderer.submit).toBe('function');
  });
});

describe('drawWgpuParticleEmitter2D', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const emitter = createParticleEmitter2D();
    prepareDisplayObjectRender(state, emitter);
    const renderProxy = getRenderProxy2D(state, emitter)!;

    expect(() => drawWgpuParticleEmitter2D(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
