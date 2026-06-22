import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createParticleEmitter } from '@flighthq/sprite';

import { defaultWgpuParticleEmitterRenderer, drawWgpuParticleEmitter } from './webgpuParticleEmitter';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuParticleEmitterRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuParticleEmitterRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuParticleEmitterRenderer.submit).toBe('function');
  });
});

describe('drawWgpuParticleEmitter', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const emitter = createParticleEmitter();
    prepareDisplayObjectRender(state, emitter);
    const renderProxy = getRenderProxy2D(state, emitter)!;

    expect(() => drawWgpuParticleEmitter(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
