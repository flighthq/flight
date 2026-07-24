import {
  createAnimatedNormalModifier,
  createDissolveModifier,
  createEmissiveModifier,
  createEnvReflectModifier,
  createFogModifier,
  createRimModifier,
  createShadedMaterial,
  createToonModifier,
  createVertexDisplaceModifier,
} from '@flighthq/shading';
import { createTexture } from '@flighthq/texture';
import { FogModifierMode, VertexDisplaceModifierSource } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import {
  bindWgpuShadedSurface,
  buildWgpuShadedCacheKey,
  ensureWgpuShadedPipeline,
  getWgpuShadedModuleSource,
} from './wgpuShadedPrelude';

describe('bindWgpuShadedSurface', () => {
  it('uploads the base and modifier uniform block and binds group resources', () => {
    const { fake, state } = makeWgpuSceneState();
    const material = createShadedMaterial({ modifiers: [createRimModifier({ color: 0xffffffff })] });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.some((call) => call.name === 'createBindGroup')).toBe(true);
    expect(fake.calls.some((call) => call.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuShadedCacheKey', () => {
  it('canonicalizes cross-slot order and captures modifier structural variants', () => {
    const rim = createRimModifier({ color: 0xffffffff });
    const emissive = createEmissiveModifier({ color: 0xffffffff, strength: 1 });
    const a = createShadedMaterial({ modifiers: [rim, emissive] });
    const b = createShadedMaterial({ modifiers: [emissive, rim] });
    expect(buildWgpuShadedCacheKey(a)).toBe(buildWgpuShadedCacheKey(b));

    const masked = createShadedMaterial({
      modifiers: [createEmissiveModifier({ color: 0xffffffff, mask: createTexture(), strength: 1 })],
    });
    expect(buildWgpuShadedCacheKey(masked)).not.toBe(buildWgpuShadedCacheKey(a));
  });
});

describe('ensureWgpuShadedPipeline', () => {
  it('caches shaded opaque and blended variants separately', () => {
    const { state } = makeWgpuSceneState();
    const material = createShadedMaterial({ modifiers: [createRimModifier({ color: 0xffffffff })] });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    getWgpuSceneRuntime(state).activeBlendedRun = true;
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const keys = [...getWgpuSceneRuntime(state).pipelineCache.keys()];
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|opaque'))).toBe(true);
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|blend'))).toBe(true);
  });
});

describe('getWgpuShadedModuleSource', () => {
  it('composes all built-in fragment modifier families into one shader', () => {
    const texture = createTexture();
    const material = createShadedMaterial({
      modifiers: [
        createAnimatedNormalModifier({ map: texture, scroll: { x: 0.1, y: 0.2 } }),
        createEmissiveModifier({ color: 0xff0000ff, mask: texture, strength: 2 }),
        createRimModifier({ color: 0x00ffffff }),
        createDissolveModifier({ threshold: 0.2 }),
        createEnvReflectModifier(),
        createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential2 }),
        createToonModifier({ steps: 3 }),
      ],
    });
    const source = getWgpuShadedModuleSource(material);
    expect(source).toContain('animatedNormal');
    expect(source).toContain('emissiveTerm');
    expect(source).toContain('rimFactor');
    expect(source).toContain('shadedValueNoise');
    expect(source).toContain('iblPrefiltered');
    expect(source).toContain('exp(-pow(');
    expect(source).toContain('toonQuant');
  });

  it('injects vertex displacement before the world transform', () => {
    const material = createShadedMaterial({
      modifiers: [
        createVertexDisplaceModifier({
          amplitude: 0.25,
          source: VertexDisplaceModifierSource.Sine,
        }),
      ],
    });
    const source = getWgpuShadedModuleSource(material);
    expect(source.indexOf('localPosition = vec4f(localPosition.xyz')).toBeLessThan(
      source.indexOf('let world = draw.world * localPosition'),
    );
  });
});
