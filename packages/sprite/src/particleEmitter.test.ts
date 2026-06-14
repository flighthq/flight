import { createRectangle } from '@flighthq/geometry';
import { getLocalBoundsRectangle, getLocalBoundsRevision } from '@flighthq/node';
import type { ParticleEmitter, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { ParticleEmitterKind } from '@flighthq/types';

import {
  computeParticleEmitterLocalBoundsRectangle,
  createParticleEmitter,
  createParticleEmitterData,
  createParticleEmitterRuntime,
  getParticleEmitterCapacity,
  getParticleEmitterRuntime,
  reserveParticleEmitter,
  setParticleEmitterLocalBoundsRectangle,
} from './particleEmitter';

function makeAtlasRegion(id = 0, x = 0, y = 0, width = 32, height = 32): TextureAtlasRegion {
  return { id, x, y, width, height, pivotX: null, pivotY: null } as TextureAtlasRegion;
}

function makeAtlas(...regions: TextureAtlasRegion[]): TextureAtlas {
  return { image: null, regions } as TextureAtlas;
}

describe('computeParticleEmitterLocalBoundsRectangle', () => {
  it('returns zero bounds when atlas is null', () => {
    const emitter = createParticleEmitter();
    const out = createRectangle(1, 2, 3, 4);
    computeParticleEmitterLocalBoundsRectangle(out, emitter);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('returns zero bounds when particleCount is 0', () => {
    const atlas = makeAtlas(makeAtlasRegion());
    const emitter = createParticleEmitter({ data: { atlas } });
    const out = createRectangle(1, 2, 3, 4);
    computeParticleEmitterLocalBoundsRectangle(out, emitter);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes AABB for a single axis-aligned particle', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 20));
    const emitter = createParticleEmitter({ data: { atlas, particleCount: 1 } });
    emitter.data.ids = new Uint16Array([0]);
    // [x=5, y=10, rotation=0, scale=1]
    emitter.data.transforms = new Float32Array([5, 10, 0, 1]);
    const out = createRectangle();
    computeParticleEmitterLocalBoundsRectangle(out, emitter);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(10);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('computes AABB over multiple particles', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter({ data: { atlas, particleCount: 2 } });
    emitter.data.ids = new Uint16Array([0, 0]);
    // particle 0 at (0,0), particle 1 at (50,50)
    emitter.data.transforms = new Float32Array([0, 0, 0, 1, 50, 50, 0, 1]);
    const out = createRectangle();
    computeParticleEmitterLocalBoundsRectangle(out, emitter);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(60);
    expect(out.height).toBeCloseTo(60);
  });

  it('skips particles with out-of-range region ids', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter({ data: { atlas, particleCount: 2 } });
    emitter.data.ids = new Uint16Array([0, 99]);
    emitter.data.transforms = new Float32Array([0, 0, 0, 1, 1000, 1000, 0, 1]);
    const out = createRectangle();
    computeParticleEmitterLocalBoundsRectangle(out, emitter);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(10);
  });

  it('does not store the result on the emitter', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter({ data: { atlas, particleCount: 1 } });
    emitter.data.ids = new Uint16Array([0]);
    emitter.data.transforms = new Float32Array([0, 0, 0, 1]);
    const revisionBefore = getLocalBoundsRevision(emitter);
    computeParticleEmitterLocalBoundsRectangle(createRectangle(), emitter);
    expect(getLocalBoundsRevision(emitter)).toBe(revisionBefore);
    expect(getLocalBoundsRectangle(emitter).width).toBe(0);
  });
});

describe('createParticleEmitter', () => {
  let emitter: ParticleEmitter;

  beforeEach(() => {
    emitter = createParticleEmitter();
  });

  it('initializes default values', () => {
    expect(emitter.data.alphas).toStrictEqual(new Float32Array());
    expect(emitter.data.atlas).toBeNull();
    expect(emitter.data.ids).toStrictEqual(new Uint16Array());
    expect(emitter.data.particleCount).toBe(0);
    expect(emitter.data.transforms).toStrictEqual(new Float32Array());
    expect(emitter.kind).toBe(ParticleEmitterKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        atlas: {} as TextureAtlas,
        ids: new Uint16Array([1, 2]),
        particleCount: 2,
        transforms: new Float32Array([0, 0, 0, 1, 10, 10, 0, 1]),
        alphas: new Float32Array([1, 0.5]),
      },
    };
    const obj = createParticleEmitter(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.particleCount).toBe(2);
  });

  it('returns a new object', () => {
    const base = {};
    const obj = createParticleEmitter(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createParticleEmitterData', () => {
  it('returns default values', () => {
    const data = createParticleEmitterData();
    expect(data.alphas).toBeInstanceOf(Float32Array);
    expect(data.atlas).toBeNull();
    expect(data.ids).toBeInstanceOf(Uint16Array);
    expect(data.particleCount).toBe(0);
    expect(data.transforms).toBeInstanceOf(Float32Array);
  });

  it('allows pre-defined values', () => {
    const data = createParticleEmitterData({ particleCount: 5 });
    expect(data.particleCount).toBe(5);
  });
});

describe('createParticleEmitterRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createParticleEmitterRuntime();
    expect(runtime).not.toBeNull();
  });

  it('initializes localBoundsRectangle to null', () => {
    const runtime = createParticleEmitterRuntime();
    expect(runtime.localBoundsRectangle).toBeNull();
  });
});

describe('getParticleEmitterCapacity', () => {
  it('returns 0 for a new emitter', () => {
    const emitter = createParticleEmitter();
    expect(getParticleEmitterCapacity(emitter)).toBe(0);
  });

  it('returns the minimum across all arrays', () => {
    const emitter = createParticleEmitter();
    emitter.data.ids = new Uint16Array(10);
    emitter.data.alphas = new Float32Array(20);
    emitter.data.transforms = new Float32Array(10 * 4); // 10 particles at stride 4
    expect(getParticleEmitterCapacity(emitter)).toBe(10);
  });
});

describe('getParticleEmitterRuntime', () => {
  it('returns the runtime for a ParticleEmitter', () => {
    const emitter = createParticleEmitter();
    const runtime = getParticleEmitterRuntime(emitter);
    expect(runtime).not.toBeNull();
  });

  it('returns the same object on repeated calls', () => {
    const emitter = createParticleEmitter();
    expect(getParticleEmitterRuntime(emitter)).toBe(getParticleEmitterRuntime(emitter));
  });
});

describe('reserveParticleEmitter', () => {
  it('allocates all arrays when capacity is larger', () => {
    const emitter = createParticleEmitter();
    reserveParticleEmitter(emitter, 50);
    expect(emitter.data.ids.length).toBe(50);
    expect(emitter.data.alphas.length).toBe(50);
    expect(emitter.data.transforms.length).toBe(50 * 4);
  });

  it('does not reallocate when capacity is already sufficient', () => {
    const emitter = createParticleEmitter();
    reserveParticleEmitter(emitter, 50);
    const { ids, alphas, transforms } = emitter.data;
    reserveParticleEmitter(emitter, 50);
    expect(emitter.data.ids).toBe(ids);
    expect(emitter.data.alphas).toBe(alphas);
    expect(emitter.data.transforms).toBe(transforms);
  });
});

describe('setParticleEmitterLocalBoundsRectangle', () => {
  it('makes getLocalBoundsRectangle reflect the new bounds', () => {
    const emitter = createParticleEmitter();
    setParticleEmitterLocalBoundsRectangle(emitter, createRectangle(10, 20, 32, 16));
    const local = getLocalBoundsRectangle(emitter);
    expect(local.x).toBe(10);
    expect(local.y).toBe(20);
    expect(local.width).toBe(32);
    expect(local.height).toBe(16);
  });

  it('copies the rect so later mutations do not affect stored bounds', () => {
    const emitter = createParticleEmitter();
    const rect = createRectangle(10, 20, 32, 16);
    setParticleEmitterLocalBoundsRectangle(emitter, rect);
    rect.width = 999;
    expect(getLocalBoundsRectangle(emitter).width).toBe(32);
  });

  it('invalidates local bounds', () => {
    const emitter = createParticleEmitter();
    const before = getLocalBoundsRevision(emitter);
    setParticleEmitterLocalBoundsRectangle(emitter, createRectangle());
    expect(getLocalBoundsRevision(emitter)).not.toBe(before);
  });
});
