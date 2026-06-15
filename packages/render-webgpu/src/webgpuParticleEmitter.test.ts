import { getSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createParticleEmitter } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUParticleEmitterRenderer, drawWebGPUParticleEmitter } from './webgpuParticleEmitter';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUParticleEmitterRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGPUParticleEmitterRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGPUParticleEmitterRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUParticleEmitter', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const emitter = createParticleEmitter();
    prepareSpriteRender(state, emitter);
    const renderNode = getSpriteRenderNode(state, emitter)!;

    expect(() => drawWebGPUParticleEmitter(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
