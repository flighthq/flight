import { getRenderStateRuntime } from '@flighthq/render';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import {
  BitmapKind,
  DisplayObjectKind,
  ParticleEmitterKind,
  QuadBatchKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import { registerWgpuDisplayObjectRenderers, registerWgpuSpriteRenderers } from './wgpuRegistration';

beforeAll(() => {
  installWgpuMock();
});

describe('registerWgpuDisplayObjectRenderers', () => {
  it('registers bitmap renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(BitmapKind)).not.toBeUndefined();
  });

  it('registers display object renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(DisplayObjectKind)).not.toBeUndefined();
  });

  it('registers particle emitter renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(ParticleEmitterKind)).not.toBeUndefined();
  });

  it('registers quad batch renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(QuadBatchKind)).not.toBeUndefined();
  });

  it('registers rich text renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(RichTextKind)).not.toBeUndefined();
  });

  it('registers scale9 shape renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(Scale9ShapeKind)).not.toBeUndefined();
  });

  it('registers shape renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(ShapeKind)).not.toBeUndefined();
  });

  it('registers sprite renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(SpriteKind)).not.toBeUndefined();
  });

  it('registers text label renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(TextLabelKind)).not.toBeUndefined();
  });

  it('registers tilemap renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(TilemapKind)).not.toBeUndefined();
  });

  it('registers video renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(VideoKind)).not.toBeUndefined();
  });
});

describe('registerWgpuSpriteRenderers', () => {
  it('registers particle emitter renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuSpriteRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(ParticleEmitterKind)).not.toBeUndefined();
  });

  it('registers quad batch renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuSpriteRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(QuadBatchKind)).not.toBeUndefined();
  });

  it('registers sprite renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuSpriteRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(SpriteKind)).not.toBeUndefined();
  });

  it('registers tilemap renderer', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuSpriteRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(TilemapKind)).not.toBeUndefined();
  });
});
