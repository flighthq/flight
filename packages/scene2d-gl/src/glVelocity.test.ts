import { createParticleEmitter2D, reserveParticleEmitter2D } from '@flighthq/particleemitter/contract';
import { createQuadBatch, getQuadBatchRuntime } from '@flighthq/quadbatch/contract';
import { createGlOffscreenRenderState, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types/contract';
import { QuadBatchKind } from '@flighthq/types/contract';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity/contract';

import { createGlState } from './glTestHelper';
import {
  createGlVelocityTarget,
  defaultGlNode2DVelocityWriter,
  defaultGlParticleEmitter2DVelocityWriter,
  defaultGlQuadBatchVelocityWriter,
  drawGlVelocityQuad,
  getGlVelocityWriter,
  registerGlVelocityWriter,
  renderGlVelocity,
} from './glVelocity';

describe('createGlVelocityTarget', () => {
  it('allocates an rgba16f target at the requested size', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    expect(target.format).toBe('rgba16f');
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });
});

describe('defaultGlNode2DVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlNode2DVelocityWriter).toBe('function');
  });
});

describe('defaultGlParticleEmitter2DVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlParticleEmitter2DVelocityWriter).toBe('function');
  });

  it('emits per-particle velocity for an emitter with a velocities array without throwing', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 16, height: 16, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { texture: null, regions: [region] } as TextureAtlas;
    const emitter = createParticleEmitter2D();
    reserveParticleEmitter2D(emitter, 2);
    emitter.data.atlas = atlas;
    emitter.data.particleCount = 2;
    emitter.data.ids[0] = 0;
    emitter.data.ids[1] = 0;
    emitter.data.transforms.set([10, 10, 0, 1, 40, 20, 0, 1]);
    emitter.data.velocities.set([3, -2, -1, 4]);

    registerGlVelocityWriter(state, emitter.kind, defaultGlParticleEmitter2DVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, emitter, field, target)).not.toThrow();
  });
});

describe('defaultGlQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { texture: null, regions: [region] } as TextureAtlas;
    // Two vector2 instances at distinct positions, each moving independently.
    const batch = createQuadBatch({
      data: {
        atlas,
        ids: new Uint16Array([0, 0]),
        instanceCount: 2,
        transforms: new Float32Array([0, 0, 40, 10]),
        transformType: 'vector2',
      },
    });
    // The batch owns its per-instance velocity (NOT the VelocityField); whatever drives the quads fills it.
    (getQuadBatchRuntime(batch) as QuadBatchRuntime).instanceVelocities = new Float32Array([3, -2, -1, 4]);

    registerGlVelocityWriter(state, QuadBatchKind, defaultGlQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, batch, field, target)).not.toThrow();
  });

  it('falls back to coarse batch velocity when no instanceVelocities array is present', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { texture: null, regions: [region] } as TextureAtlas;
    const batch = createQuadBatch({
      data: { atlas, ids: new Uint16Array([0]), instanceCount: 1, transforms: new Float32Array([0, 0]) },
    });

    registerGlVelocityWriter(state, QuadBatchKind, defaultGlQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, batch, 5, 1);

    expect(() => renderGlVelocity(state, batch, field, target)).not.toThrow();
  });
});

describe('drawGlVelocityQuad', () => {
  it('is callable', () => {
    expect(typeof drawGlVelocityQuad).toBe('function');
  });
});

describe('getGlVelocityWriter', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = createGlState();
    expect(getGlVelocityWriter(state, 'unregistered')).toBeNull();
  });
});

describe('registerGlVelocityWriter', () => {
  it('registers a writer dispatched by kind', () => {
    const { state } = createGlState();
    const root = createDisplayObject();
    registerGlVelocityWriter(state, root.kind, defaultGlNode2DVelocityWriter);
    expect(getGlVelocityWriter(state, root.kind)).toBe(defaultGlNode2DVelocityWriter);
  });

  it('replaces persistent snapshots and preserves a derived pipeline snapshot', () => {
    const { state } = createGlState();
    const kind = 'acme.Velocity';
    const replacement = vi.fn();
    const before = getGlRenderStateRuntime(state).registries.velocityWriters;

    registerGlVelocityWriter(state, kind, defaultGlNode2DVelocityWriter);
    const registered = getGlRenderStateRuntime(state).registries.velocityWriters;
    const offscreen = createGlOffscreenRenderState(state);
    registerGlVelocityWriter(state, kind, replacement);

    expect(registered).not.toBe(before);
    expect(before.entries.has(kind)).toBe(false);
    expect(registered.entries.get(kind)).toEqual({ state: 'bound', value: defaultGlNode2DVelocityWriter });
    expect(getGlVelocityWriter(state, kind)).toBe(replacement);
    expect(getGlVelocityWriter(offscreen, kind)).toBe(defaultGlNode2DVelocityWriter);
  });
});

describe('renderGlVelocity', () => {
  it('leaves the blend enable bit, viewport, and clear colour as it found them', () => {
    const { state, gl } = createGlState();
    // The shared mock's isEnabled returns undefined, so a capability leak is invisible to a test that
    // does not model the bit. Modelling it is the whole point here: this pass runs mid-frame, and the
    // 2D path enables BLEND once at state creation, so a leak is permanent rather than frame-scoped.
    const enabled = new Set<number>([gl.BLEND]);
    (gl.isEnabled as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.has(cap));
    (gl.enable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.add(cap));
    (gl.disable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.delete(cap));
    let viewport: readonly number[] = [7, 8, 320, 240];
    let clearColor: readonly number[] = [0.25, 0.5, 0.75, 1];
    (gl.getParameter as ReturnType<typeof vi.fn>).mockImplementation((parameter: number) => {
      if (parameter === gl.VIEWPORT) return Int32Array.from(viewport);
      if (parameter === gl.COLOR_CLEAR_VALUE) return Float32Array.from(clearColor);
      return undefined;
    });
    (gl.viewport as ReturnType<typeof vi.fn>).mockImplementation((...v: number[]) => (viewport = v));
    (gl.clearColor as ReturnType<typeof vi.fn>).mockImplementation((...v: number[]) => (clearColor = v));

    const target = createGlVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerGlVelocityWriter(state, root.kind, defaultGlNode2DVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    renderGlVelocity(state, root, field, target);

    expect(enabled.has(gl.BLEND)).toBe(true);
    expect(Array.from(viewport)).toEqual([7, 8, 320, 240]);
    expect(Array.from(clearColor)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(getGlRenderStateRuntime(state).currentShader?.program).toBe(vi.mocked(gl.useProgram).mock.calls.at(-1)?.[0]);
  });

  it('dispatches the registered writer for a moving node without throwing', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerGlVelocityWriter(state, root.kind, defaultGlNode2DVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    expect(() => renderGlVelocity(state, root, field, target)).not.toThrow();
  });

  it('runs without throwing when no writer is registered', () => {
    const { state } = createGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, root, field, target)).not.toThrow();
  });
});
