import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle, getNodeLocalBoundsRevision } from '@flighthq/node';
import type { ParticleEmitter, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { ParticleEmitterKind } from '@flighthq/types';

import {
  appendParticleEmitterParticle,
  clearParticleEmitter,
  cloneParticleEmitter,
  compactParticleEmitter,
  computeParticleEmitterLocalBoundsRectangle,
  createParticleEmitter,
  createParticleEmitterData,
  createParticleEmitterRuntime,
  getParticleEmitterCapacity,
  getParticleEmitterParticleAlpha,
  getParticleEmitterParticleId,
  getParticleEmitterParticleVelocity,
  getParticleEmitterRuntime,
  removeParticleEmitterParticle,
  reserveParticleEmitter,
  setParticleEmitterLocalBoundsRectangle,
  setParticleEmitterParticle,
  setParticleEmitterParticleAlpha,
  setParticleEmitterParticleColor,
  setParticleEmitterParticleVelocity,
} from './particleEmitter';

function makeAtlasRegion(id = 0, x = 0, y = 0, width = 32, height = 32): TextureAtlasRegion {
  return { id, x, y, width, height, pivotX: null, pivotY: null } as TextureAtlasRegion;
}

function makeAtlas(...regions: TextureAtlasRegion[]): TextureAtlas {
  return { image: null, regions } as TextureAtlas;
}

describe('appendParticleEmitterParticle', () => {
  it('appends a particle and returns its index', () => {
    const emitter = createParticleEmitter();
    const idx = appendParticleEmitterParticle(emitter, 2, 10, 20, 0.5, 1.5);
    expect(idx).toBe(0);
    expect(emitter.data.particleCount).toBe(1);
    expect(emitter.data.ids[0]).toBe(2);
    expect(emitter.data.transforms[0]).toBe(10); // x
    expect(emitter.data.transforms[1]).toBe(20); // y
    expect(emitter.data.transforms[2]).toBe(0.5); // rotation
    expect(emitter.data.transforms[3]).toBe(1.5); // scale
  });

  it('initializes alpha to 1 and color to white', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    expect(emitter.data.alphas[0]).toBe(1);
    expect(emitter.data.colors[0]).toBe(1); // r
    expect(emitter.data.colors[1]).toBe(1); // g
    expect(emitter.data.colors[2]).toBe(1); // b
  });

  it('returns sequential indices for multiple appends', () => {
    const emitter = createParticleEmitter();
    expect(appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1)).toBe(0);
    expect(appendParticleEmitterParticle(emitter, 1, 5, 5, 0, 1)).toBe(1);
    expect(emitter.data.particleCount).toBe(2);
  });

  it('auto-grows capacity', () => {
    const emitter = createParticleEmitter();
    for (let i = 0; i < 10; i++) appendParticleEmitterParticle(emitter, i, 0, 0, 0, 1);
    expect(emitter.data.particleCount).toBe(10);
    expect(getParticleEmitterCapacity(emitter)).toBeGreaterThanOrEqual(10);
  });
});

describe('clearParticleEmitter', () => {
  it('sets particleCount to 0 and keeps capacity', () => {
    const emitter = createParticleEmitter();
    reserveParticleEmitter(emitter, 50);
    emitter.data.particleCount = 10;
    const capacityBefore = getParticleEmitterCapacity(emitter);
    clearParticleEmitter(emitter);
    expect(emitter.data.particleCount).toBe(0);
    expect(getParticleEmitterCapacity(emitter)).toBe(capacityBefore);
  });
});

describe('cloneParticleEmitter', () => {
  it('copies count, atlas, and worldSpace into a new emitter', () => {
    const atlas = makeAtlas(makeAtlasRegion(0));
    const source = createParticleEmitter({ data: { atlas, worldSpace: true } });
    appendParticleEmitterParticle(source, 0, 10, 20, 0.5, 2);
    setParticleEmitterParticleColor(source, 0, 0.1, 0.2, 0.3);
    setParticleEmitterParticleAlpha(source, 0, 0.4);
    setParticleEmitterParticleVelocity(source, 0, 5, 6);

    const clone = cloneParticleEmitter(source);
    expect(clone).not.toBe(source);
    expect(clone.data.particleCount).toBe(1);
    expect(clone.data.atlas).toBe(atlas);
    expect(clone.data.worldSpace).toBe(true);
    expect(getParticleEmitterParticleId(clone, 0)).toBe(0);
    expect(getParticleEmitterParticleAlpha(clone, 0)).toBeCloseTo(0.4);
  });

  it('clones typed arrays so mutations do not leak back', () => {
    const source = createParticleEmitter();
    appendParticleEmitterParticle(source, 1, 0, 0, 0, 1);
    const clone = cloneParticleEmitter(source);
    expect(clone.data.transforms).not.toBe(source.data.transforms);
    setParticleEmitterParticle(clone, 0, 2, 99, 99, 0, 1);
    expect(getParticleEmitterParticleId(source, 0)).toBe(1);
    expect(source.data.transforms[0]).toBe(0);
  });
});

describe('compactParticleEmitter', () => {
  it('no-ops on an empty emitter', () => {
    const emitter = createParticleEmitter();
    compactParticleEmitter(emitter);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('removes sentinel-id entries and preserves order', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 10, 1, 1, 0, 1);
    appendParticleEmitterParticle(emitter, 11, 2, 2, 0, 1);
    appendParticleEmitterParticle(emitter, 12, 3, 3, 0, 1);
    // Mark the middle entry as deleted with the Uint16Array sentinel.
    emitter.data.ids[1] = 0xffff;
    compactParticleEmitter(emitter);
    expect(emitter.data.particleCount).toBe(2);
    expect(getParticleEmitterParticleId(emitter, 0)).toBe(10);
    expect(getParticleEmitterParticleId(emitter, 1)).toBe(12);
    // The surviving second entry kept its transform (x = 3).
    expect(emitter.data.transforms[1 * 4]).toBe(3);
  });

  it('leaves a fully-live buffer unchanged', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 1, 0, 0, 0, 1);
    appendParticleEmitterParticle(emitter, 2, 0, 0, 0, 1);
    compactParticleEmitter(emitter);
    expect(emitter.data.particleCount).toBe(2);
    expect(getParticleEmitterParticleId(emitter, 0)).toBe(1);
    expect(getParticleEmitterParticleId(emitter, 1)).toBe(2);
  });
});

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
    const revisionBefore = getNodeLocalBoundsRevision(emitter);
    computeParticleEmitterLocalBoundsRectangle(createRectangle(), emitter);
    expect(getNodeLocalBoundsRevision(emitter)).toBe(revisionBefore);
    expect(getNodeLocalBoundsRectangle(emitter).width).toBe(0);
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

describe('getParticleEmitterParticleAlpha', () => {
  it('returns the alpha at a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticleAlpha(emitter, 0, 0.5);
    expect(getParticleEmitterParticleAlpha(emitter, 0)).toBeCloseTo(0.5);
  });

  it('returns -1 for out-of-range index', () => {
    const emitter = createParticleEmitter();
    expect(getParticleEmitterParticleAlpha(emitter, 0)).toBe(-1);
    expect(getParticleEmitterParticleAlpha(emitter, -1)).toBe(-1);
  });
});

describe('getParticleEmitterParticleId', () => {
  it('returns the region id at a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 7, 0, 0, 0, 1);
    expect(getParticleEmitterParticleId(emitter, 0)).toBe(7);
  });

  it('returns -1 for out-of-range index', () => {
    const emitter = createParticleEmitter();
    expect(getParticleEmitterParticleId(emitter, 0)).toBe(-1);
    expect(getParticleEmitterParticleId(emitter, -1)).toBe(-1);
  });
});

describe('getParticleEmitterParticleVelocity', () => {
  it('writes velocity into out for a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticleVelocity(emitter, 0, 3.5, -1.5);
    const out = { x: 0, y: 0 };
    const result = getParticleEmitterParticleVelocity(out, emitter, 0);
    expect(result).toBe(true);
    expect(out.x).toBeCloseTo(3.5);
    expect(out.y).toBeCloseTo(-1.5);
  });

  it('returns false and does not write for out-of-range index', () => {
    const emitter = createParticleEmitter();
    const out = { x: 99, y: 99 };
    expect(getParticleEmitterParticleVelocity(out, emitter, 0)).toBe(false);
    expect(out.x).toBe(99);
    expect(out.y).toBe(99);
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

describe('removeParticleEmitterParticle', () => {
  it('swap-removes with the last particle', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    appendParticleEmitterParticle(emitter, 1, 10, 10, 0, 1);
    appendParticleEmitterParticle(emitter, 2, 20, 20, 0, 1);
    removeParticleEmitterParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(2);
    // The last particle (id=2) should now be at index 0
    expect(getParticleEmitterParticleId(emitter, 0)).toBe(2);
  });

  it('removes the only particle', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 5, 0, 0, 0, 1);
    removeParticleEmitterParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    removeParticleEmitterParticle(emitter, -1);
    removeParticleEmitterParticle(emitter, 1);
    expect(emitter.data.particleCount).toBe(1);
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
  it('makes getNodeLocalBoundsRectangle reflect the new bounds', () => {
    const emitter = createParticleEmitter();
    setParticleEmitterLocalBoundsRectangle(emitter, createRectangle(10, 20, 32, 16));
    const local = getNodeLocalBoundsRectangle(emitter);
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
    expect(getNodeLocalBoundsRectangle(emitter).width).toBe(32);
  });

  it('invalidates local bounds', () => {
    const emitter = createParticleEmitter();
    const before = getNodeLocalBoundsRevision(emitter);
    setParticleEmitterLocalBoundsRectangle(emitter, createRectangle());
    expect(getNodeLocalBoundsRevision(emitter)).not.toBe(before);
  });
});

describe('setParticleEmitterParticle', () => {
  it('sets id and transform for a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticle(emitter, 0, 3, 5, 10, 1.57, 2.0);
    expect(emitter.data.ids[0]).toBe(3);
    expect(emitter.data.transforms[0]).toBeCloseTo(5); // x
    expect(emitter.data.transforms[1]).toBeCloseTo(10); // y
    expect(emitter.data.transforms[2]).toBeCloseTo(1.57); // rotation
    expect(emitter.data.transforms[3]).toBeCloseTo(2.0); // scale
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.ids[0] = 0;
    setParticleEmitterParticle(emitter, -1, 9, 0, 0, 0, 1);
    setParticleEmitterParticle(emitter, 1, 9, 0, 0, 0, 1);
    expect(emitter.data.ids[0]).toBe(0);
  });
});

describe('setParticleEmitterParticleAlpha', () => {
  it('sets alpha for a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticleAlpha(emitter, 0, 0.25);
    expect(emitter.data.alphas[0]).toBeCloseTo(0.25);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.alphas[0] = 0.5;
    setParticleEmitterParticleAlpha(emitter, -1, 0.9);
    setParticleEmitterParticleAlpha(emitter, 1, 0.9);
    expect(emitter.data.alphas[0]).toBeCloseTo(0.5);
  });
});

describe('setParticleEmitterParticleColor', () => {
  it('sets r, g, b for a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticleColor(emitter, 0, 0.2, 0.4, 0.8);
    expect(emitter.data.colors[0]).toBeCloseTo(0.2);
    expect(emitter.data.colors[1]).toBeCloseTo(0.4);
    expect(emitter.data.colors[2]).toBeCloseTo(0.8);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.colors[0] = 0.5;
    setParticleEmitterParticleColor(emitter, -1, 0.9, 0.9, 0.9);
    setParticleEmitterParticleColor(emitter, 1, 0.9, 0.9, 0.9);
    expect(emitter.data.colors[0]).toBeCloseTo(0.5);
  });
});

describe('setParticleEmitterParticleVelocity', () => {
  it('sets vx and vy for a valid index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitterParticleVelocity(emitter, 0, 2.5, -3.0);
    expect(emitter.data.velocities[0]).toBeCloseTo(2.5);
    expect(emitter.data.velocities[1]).toBeCloseTo(-3.0);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter();
    appendParticleEmitterParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.velocities[0] = 1;
    setParticleEmitterParticleVelocity(emitter, -1, 9, 9);
    setParticleEmitterParticleVelocity(emitter, 1, 9, 9);
    expect(emitter.data.velocities[0]).toBeCloseTo(1);
  });
});
