import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle, getNodeLocalBoundsRevision } from '@flighthq/node';
import type { ParticleEmitter2D, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { ParticleEmitter2DKind } from '@flighthq/types';

import {
  appendParticleEmitter2DParticle,
  clearParticleEmitter2D,
  cloneParticleEmitter2D,
  compactParticleEmitter2D,
  computeParticleEmitter2DLocalBoundsRectangle,
  createParticleEmitter2D,
  createParticleEmitterData,
  createParticleEmitter2DRuntime,
  getParticleEmitter2DCapacity,
  getParticleEmitter2DParticleAlpha,
  getParticleEmitter2DParticleId,
  getParticleEmitter2DParticleVelocity,
  getParticleEmitter2DRuntime,
  PARTICLE_EMITTER_DELETED_ID,
  removeParticleEmitter2DParticle,
  reserveParticleEmitter2D,
  setParticleEmitter2DLocalBoundsRectangle,
  setParticleEmitter2DParticle,
  setParticleEmitter2DParticleAlpha,
  setParticleEmitter2DParticleColor,
  setParticleEmitter2DParticleVelocity,
} from './particleEmitter';

function makeAtlasRegion(id = 0, x = 0, y = 0, width = 32, height = 32): TextureAtlasRegion {
  return { id, x, y, width, height, pivotX: null, pivotY: null } as TextureAtlasRegion;
}

function makeAtlas(...regions: TextureAtlasRegion[]): TextureAtlas {
  return { image: null, regions } as TextureAtlas;
}

describe('appendParticleEmitter2DParticle', () => {
  it('appends a particle and returns its index', () => {
    const emitter = createParticleEmitter2D();
    const idx = appendParticleEmitter2DParticle(emitter, 2, 10, 20, 0.5, 1.5);
    expect(idx).toBe(0);
    expect(emitter.data.particleCount).toBe(1);
    expect(emitter.data.ids[0]).toBe(2);
    expect(emitter.data.transforms[0]).toBe(10); // x
    expect(emitter.data.transforms[1]).toBe(20); // y
    expect(emitter.data.transforms[2]).toBe(0.5); // rotation
    expect(emitter.data.transforms[3]).toBe(1.5); // scale
  });

  it('initializes alpha to 1 and color to white', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    expect(emitter.data.alphas[0]).toBe(1);
    expect(emitter.data.colors[0]).toBe(1); // r
    expect(emitter.data.colors[1]).toBe(1); // g
    expect(emitter.data.colors[2]).toBe(1); // b
  });

  it('returns sequential indices for multiple appends', () => {
    const emitter = createParticleEmitter2D();
    expect(appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1)).toBe(0);
    expect(appendParticleEmitter2DParticle(emitter, 1, 5, 5, 0, 1)).toBe(1);
    expect(emitter.data.particleCount).toBe(2);
  });

  it('auto-grows capacity', () => {
    const emitter = createParticleEmitter2D();
    for (let i = 0; i < 10; i++) appendParticleEmitter2DParticle(emitter, i, 0, 0, 0, 1);
    expect(emitter.data.particleCount).toBe(10);
    expect(getParticleEmitter2DCapacity(emitter)).toBeGreaterThanOrEqual(10);
  });
});

describe('clearParticleEmitter2D', () => {
  it('sets particleCount to 0 and keeps capacity', () => {
    const emitter = createParticleEmitter2D();
    reserveParticleEmitter2D(emitter, 50);
    emitter.data.particleCount = 10;
    const capacityBefore = getParticleEmitter2DCapacity(emitter);
    clearParticleEmitter2D(emitter);
    expect(emitter.data.particleCount).toBe(0);
    expect(getParticleEmitter2DCapacity(emitter)).toBe(capacityBefore);
  });
});

describe('cloneParticleEmitter2D', () => {
  it('copies count, atlas, and worldSpace into a new emitter', () => {
    const atlas = makeAtlas(makeAtlasRegion(0));
    const source = createParticleEmitter2D({ data: { atlas, worldSpace: true } });
    appendParticleEmitter2DParticle(source, 0, 10, 20, 0.5, 2);
    setParticleEmitter2DParticleColor(source, 0, 0.1, 0.2, 0.3);
    setParticleEmitter2DParticleAlpha(source, 0, 0.4);
    setParticleEmitter2DParticleVelocity(source, 0, 5, 6);

    const clone = cloneParticleEmitter2D(source);
    expect(clone).not.toBe(source);
    expect(clone.data.particleCount).toBe(1);
    expect(clone.data.atlas).toBe(atlas);
    expect(clone.data.worldSpace).toBe(true);
    expect(getParticleEmitter2DParticleId(clone, 0)).toBe(0);
    expect(getParticleEmitter2DParticleAlpha(clone, 0)).toBeCloseTo(0.4);
  });

  it('clones typed arrays so mutations do not leak back', () => {
    const source = createParticleEmitter2D();
    appendParticleEmitter2DParticle(source, 1, 0, 0, 0, 1);
    const clone = cloneParticleEmitter2D(source);
    expect(clone.data.transforms).not.toBe(source.data.transforms);
    setParticleEmitter2DParticle(clone, 0, 2, 99, 99, 0, 1);
    expect(getParticleEmitter2DParticleId(source, 0)).toBe(1);
    expect(source.data.transforms[0]).toBe(0);
  });
});

describe('compactParticleEmitter2D', () => {
  it('no-ops on an empty emitter', () => {
    const emitter = createParticleEmitter2D();
    compactParticleEmitter2D(emitter);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('removes sentinel-id entries and preserves order', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 10, 1, 1, 0, 1);
    appendParticleEmitter2DParticle(emitter, 11, 2, 2, 0, 1);
    appendParticleEmitter2DParticle(emitter, 12, 3, 3, 0, 1);
    // Mark the middle entry as deleted with the Uint16Array sentinel.
    emitter.data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
    compactParticleEmitter2D(emitter);
    expect(emitter.data.particleCount).toBe(2);
    expect(getParticleEmitter2DParticleId(emitter, 0)).toBe(10);
    expect(getParticleEmitter2DParticleId(emitter, 1)).toBe(12);
    // The surviving second entry kept its transform (x = 3).
    expect(emitter.data.transforms[1 * 4]).toBe(3);
  });

  it('leaves a fully-live buffer unchanged', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 1, 0, 0, 0, 1);
    appendParticleEmitter2DParticle(emitter, 2, 0, 0, 0, 1);
    compactParticleEmitter2D(emitter);
    expect(emitter.data.particleCount).toBe(2);
    expect(getParticleEmitter2DParticleId(emitter, 0)).toBe(1);
    expect(getParticleEmitter2DParticleId(emitter, 1)).toBe(2);
  });
});

describe('computeParticleEmitter2DLocalBoundsRectangle', () => {
  it('returns zero bounds when atlas is null', () => {
    const emitter = createParticleEmitter2D();
    const out = createRectangle(1, 2, 3, 4);
    computeParticleEmitter2DLocalBoundsRectangle(out, emitter);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('returns zero bounds when particleCount is 0', () => {
    const atlas = makeAtlas(makeAtlasRegion());
    const emitter = createParticleEmitter2D({ data: { atlas } });
    const out = createRectangle(1, 2, 3, 4);
    computeParticleEmitter2DLocalBoundsRectangle(out, emitter);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes AABB for a single axis-aligned particle', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 20));
    const emitter = createParticleEmitter2D({ data: { atlas, particleCount: 1 } });
    emitter.data.ids = new Uint16Array([0]);
    // [x=5, y=10, rotation=0, scale=1]
    emitter.data.transforms = new Float32Array([5, 10, 0, 1]);
    const out = createRectangle();
    computeParticleEmitter2DLocalBoundsRectangle(out, emitter);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(10);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('computes AABB over multiple particles', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter2D({ data: { atlas, particleCount: 2 } });
    emitter.data.ids = new Uint16Array([0, 0]);
    // particle 0 at (0,0), particle 1 at (50,50)
    emitter.data.transforms = new Float32Array([0, 0, 0, 1, 50, 50, 0, 1]);
    const out = createRectangle();
    computeParticleEmitter2DLocalBoundsRectangle(out, emitter);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(60);
    expect(out.height).toBeCloseTo(60);
  });

  it('skips particles with out-of-range region ids', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter2D({ data: { atlas, particleCount: 2 } });
    emitter.data.ids = new Uint16Array([0, 99]);
    emitter.data.transforms = new Float32Array([0, 0, 0, 1, 1000, 1000, 0, 1]);
    const out = createRectangle();
    computeParticleEmitter2DLocalBoundsRectangle(out, emitter);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(10);
  });

  it('does not store the result on the emitter', () => {
    const atlas = makeAtlas(makeAtlasRegion(0, 0, 0, 10, 10));
    const emitter = createParticleEmitter2D({ data: { atlas, particleCount: 1 } });
    emitter.data.ids = new Uint16Array([0]);
    emitter.data.transforms = new Float32Array([0, 0, 0, 1]);
    const revisionBefore = getNodeLocalBoundsRevision(emitter);
    computeParticleEmitter2DLocalBoundsRectangle(createRectangle(), emitter);
    expect(getNodeLocalBoundsRevision(emitter)).toBe(revisionBefore);
    expect(getNodeLocalBoundsRectangle(emitter).width).toBe(0);
  });
});

describe('createParticleEmitter2D', () => {
  let emitter: ParticleEmitter2D;

  beforeEach(() => {
    emitter = createParticleEmitter2D();
  });

  it('initializes default values', () => {
    expect(emitter.data.alphas).toStrictEqual(new Float32Array());
    expect(emitter.data.atlas).toBeNull();
    expect(emitter.data.ids).toStrictEqual(new Uint16Array());
    expect(emitter.data.particleCount).toBe(0);
    expect(emitter.data.transforms).toStrictEqual(new Float32Array());
    expect(emitter.kind).toBe(ParticleEmitter2DKind);
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
    const obj = createParticleEmitter2D(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.particleCount).toBe(2);
  });

  it('returns a new object', () => {
    const base = {};
    const obj = createParticleEmitter2D(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createParticleEmitter2DRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createParticleEmitter2DRuntime();
    expect(runtime).not.toBeNull();
  });

  it('initializes localBoundsRectangle to null', () => {
    const runtime = createParticleEmitter2DRuntime();
    expect(runtime.localBoundsRectangle).toBeNull();
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

describe('getParticleEmitter2DCapacity', () => {
  it('returns 0 for a new emitter', () => {
    const emitter = createParticleEmitter2D();
    expect(getParticleEmitter2DCapacity(emitter)).toBe(0);
  });

  it('returns the minimum across all arrays', () => {
    const emitter = createParticleEmitter2D();
    emitter.data.ids = new Uint16Array(10);
    emitter.data.alphas = new Float32Array(20);
    emitter.data.transforms = new Float32Array(10 * 4); // 10 particles at stride 4
    expect(getParticleEmitter2DCapacity(emitter)).toBe(10);
  });
});

describe('getParticleEmitter2DParticleAlpha', () => {
  it('returns the alpha at a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticleAlpha(emitter, 0, 0.5);
    expect(getParticleEmitter2DParticleAlpha(emitter, 0)).toBeCloseTo(0.5);
  });

  it('returns -1 for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    expect(getParticleEmitter2DParticleAlpha(emitter, 0)).toBe(-1);
    expect(getParticleEmitter2DParticleAlpha(emitter, -1)).toBe(-1);
  });
});

describe('getParticleEmitter2DParticleId', () => {
  it('returns the region id at a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 7, 0, 0, 0, 1);
    expect(getParticleEmitter2DParticleId(emitter, 0)).toBe(7);
  });

  it('returns -1 for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    expect(getParticleEmitter2DParticleId(emitter, 0)).toBe(-1);
    expect(getParticleEmitter2DParticleId(emitter, -1)).toBe(-1);
  });
});

describe('getParticleEmitter2DParticleVelocity', () => {
  it('writes velocity into out for a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticleVelocity(emitter, 0, 3.5, -1.5);
    const out = { x: 0, y: 0 };
    const result = getParticleEmitter2DParticleVelocity(out, emitter, 0);
    expect(result).toBe(true);
    expect(out.x).toBeCloseTo(3.5);
    expect(out.y).toBeCloseTo(-1.5);
  });

  it('returns false and does not write for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    const out = { x: 99, y: 99 };
    expect(getParticleEmitter2DParticleVelocity(out, emitter, 0)).toBe(false);
    expect(out.x).toBe(99);
    expect(out.y).toBe(99);
  });
});

describe('getParticleEmitter2DRuntime', () => {
  it('returns the runtime for a ParticleEmitter2D', () => {
    const emitter = createParticleEmitter2D();
    const runtime = getParticleEmitter2DRuntime(emitter);
    expect(runtime).not.toBeNull();
  });

  it('returns the same object on repeated calls', () => {
    const emitter = createParticleEmitter2D();
    expect(getParticleEmitter2DRuntime(emitter)).toBe(getParticleEmitter2DRuntime(emitter));
  });
});

describe('removeParticleEmitter2DParticle', () => {
  it('swap-removes with the last particle', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    appendParticleEmitter2DParticle(emitter, 1, 10, 10, 0, 1);
    appendParticleEmitter2DParticle(emitter, 2, 20, 20, 0, 1);
    removeParticleEmitter2DParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(2);
    // The last particle (id=2) should now be at index 0
    expect(getParticleEmitter2DParticleId(emitter, 0)).toBe(2);
  });

  it('removes the only particle', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 5, 0, 0, 0, 1);
    removeParticleEmitter2DParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    removeParticleEmitter2DParticle(emitter, -1);
    removeParticleEmitter2DParticle(emitter, 1);
    expect(emitter.data.particleCount).toBe(1);
  });
});

describe('reserveParticleEmitter2D', () => {
  it('allocates all arrays when capacity is larger', () => {
    const emitter = createParticleEmitter2D();
    reserveParticleEmitter2D(emitter, 50);
    expect(emitter.data.ids.length).toBe(50);
    expect(emitter.data.alphas.length).toBe(50);
    expect(emitter.data.transforms.length).toBe(50 * 4);
  });

  it('does not reallocate when capacity is already sufficient', () => {
    const emitter = createParticleEmitter2D();
    reserveParticleEmitter2D(emitter, 50);
    const { ids, alphas, transforms } = emitter.data;
    reserveParticleEmitter2D(emitter, 50);
    expect(emitter.data.ids).toBe(ids);
    expect(emitter.data.alphas).toBe(alphas);
    expect(emitter.data.transforms).toBe(transforms);
  });
});

describe('setParticleEmitter2DLocalBoundsRectangle', () => {
  it('makes getNodeLocalBoundsRectangle reflect the new bounds', () => {
    const emitter = createParticleEmitter2D();
    setParticleEmitter2DLocalBoundsRectangle(emitter, createRectangle(10, 20, 32, 16));
    const local = getNodeLocalBoundsRectangle(emitter);
    expect(local.x).toBe(10);
    expect(local.y).toBe(20);
    expect(local.width).toBe(32);
    expect(local.height).toBe(16);
  });

  it('copies the rect so later mutations do not affect stored bounds', () => {
    const emitter = createParticleEmitter2D();
    const rect = createRectangle(10, 20, 32, 16);
    setParticleEmitter2DLocalBoundsRectangle(emitter, rect);
    rect.width = 999;
    expect(getNodeLocalBoundsRectangle(emitter).width).toBe(32);
  });

  it('invalidates local bounds', () => {
    const emitter = createParticleEmitter2D();
    const before = getNodeLocalBoundsRevision(emitter);
    setParticleEmitter2DLocalBoundsRectangle(emitter, createRectangle());
    expect(getNodeLocalBoundsRevision(emitter)).not.toBe(before);
  });
});

describe('setParticleEmitter2DParticle', () => {
  it('sets id and transform for a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticle(emitter, 0, 3, 5, 10, 1.57, 2.0);
    expect(emitter.data.ids[0]).toBe(3);
    expect(emitter.data.transforms[0]).toBeCloseTo(5); // x
    expect(emitter.data.transforms[1]).toBeCloseTo(10); // y
    expect(emitter.data.transforms[2]).toBeCloseTo(1.57); // rotation
    expect(emitter.data.transforms[3]).toBeCloseTo(2.0); // scale
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.ids[0] = 0;
    setParticleEmitter2DParticle(emitter, -1, 9, 0, 0, 0, 1);
    setParticleEmitter2DParticle(emitter, 1, 9, 0, 0, 0, 1);
    expect(emitter.data.ids[0]).toBe(0);
  });
});

describe('setParticleEmitter2DParticleAlpha', () => {
  it('sets alpha for a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticleAlpha(emitter, 0, 0.25);
    expect(emitter.data.alphas[0]).toBeCloseTo(0.25);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.alphas[0] = 0.5;
    setParticleEmitter2DParticleAlpha(emitter, -1, 0.9);
    setParticleEmitter2DParticleAlpha(emitter, 1, 0.9);
    expect(emitter.data.alphas[0]).toBeCloseTo(0.5);
  });
});

describe('setParticleEmitter2DParticleColor', () => {
  it('sets r, g, b for a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticleColor(emitter, 0, 0.2, 0.4, 0.8);
    expect(emitter.data.colors[0]).toBeCloseTo(0.2);
    expect(emitter.data.colors[1]).toBeCloseTo(0.4);
    expect(emitter.data.colors[2]).toBeCloseTo(0.8);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.colors[0] = 0.5;
    setParticleEmitter2DParticleColor(emitter, -1, 0.9, 0.9, 0.9);
    setParticleEmitter2DParticleColor(emitter, 1, 0.9, 0.9, 0.9);
    expect(emitter.data.colors[0]).toBeCloseTo(0.5);
  });
});

describe('setParticleEmitter2DParticleVelocity', () => {
  it('sets vx and vy for a valid index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    setParticleEmitter2DParticleVelocity(emitter, 0, 2.5, -3.0);
    expect(emitter.data.velocities[0]).toBeCloseTo(2.5);
    expect(emitter.data.velocities[1]).toBeCloseTo(-3.0);
  });

  it('no-ops for out-of-range index', () => {
    const emitter = createParticleEmitter2D();
    appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
    emitter.data.velocities[0] = 1;
    setParticleEmitter2DParticleVelocity(emitter, -1, 9, 9);
    setParticleEmitter2DParticleVelocity(emitter, 1, 9, 9);
    expect(emitter.data.velocities[0]).toBeCloseTo(1);
  });
});
