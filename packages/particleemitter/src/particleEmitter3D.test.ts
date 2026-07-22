import { createAabb, createMatrix4 } from '@flighthq/geometry';
import { getNodeLocalMatrix4 } from '@flighthq/node';
import { ParticleEmitter3DKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  PARTICLE_EMITTER_3D_DELETED_ID,
  appendParticleEmitter3DParticle,
  clearParticleEmitter3D,
  cloneParticleEmitter3D,
  compactParticleEmitter3D,
  computeParticleEmitter3DLocalBoundsAabb,
  createParticleEmitter3D,
  getParticleEmitter3DCapacity,
  getParticleEmitter3DParticleAlpha,
  getParticleEmitter3DParticleId,
  getParticleEmitter3DParticleVelocity,
  getParticleEmitter3DRuntime,
  isParticleEmitter3D,
  removeParticleEmitter3DParticle,
  reserveParticleEmitter3D,
  setParticleEmitter3DParticle,
  setParticleEmitter3DParticleAlpha,
  setParticleEmitter3DParticleColor,
  setParticleEmitter3DParticleVelocity,
  sortParticleEmitter3DIndicesByViewDepth,
} from './particleEmitter3D';

describe('appendParticleEmitter3DParticle', () => {
  it('appends a particle with z coordinate', () => {
    const emitter = createParticleEmitter3D();
    const index = appendParticleEmitter3DParticle(emitter, 5, 10, 20, 30, 0.5, 2);
    expect(index).toBe(0);
    expect(emitter.data.particleCount).toBe(1);
    expect(emitter.data.ids[0]).toBe(5);
    expect(emitter.data.transforms[0]).toBe(10);
    expect(emitter.data.transforms[1]).toBe(20);
    expect(emitter.data.transforms[2]).toBe(0.5);
    expect(emitter.data.transforms[3]).toBe(2);
    expect(emitter.data.positionsZ[0]).toBe(30);
    expect(emitter.data.alphas[0]).toBe(1);
  });

  it('auto-grows capacity', () => {
    const emitter = createParticleEmitter3D();
    for (let i = 0; i < 20; i++) {
      appendParticleEmitter3DParticle(emitter, i, i, i, i, 0, 1);
    }
    expect(emitter.data.particleCount).toBe(20);
    expect(getParticleEmitter3DCapacity(emitter)).toBeGreaterThanOrEqual(20);
  });
});

describe('clearParticleEmitter3D', () => {
  it('resets particle count to zero', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    appendParticleEmitter3DParticle(emitter, 2, 0, 0, 0, 0, 1);
    clearParticleEmitter3D(emitter);
    expect(emitter.data.particleCount).toBe(0);
  });
});

describe('cloneParticleEmitter3D', () => {
  it('deep-copies particle buffers and preserves blendMode and worldSpace', () => {
    const emitter = createParticleEmitter3D({ blendMode: 'add' });
    emitter.data.worldSpace = true;
    appendParticleEmitter3DParticle(emitter, 7, 1, 2, 3, 0.5, 2);
    setParticleEmitter3DParticleVelocity(emitter, 0, 4, 5, 6);
    const clone = cloneParticleEmitter3D(emitter);
    expect(clone.blendMode).toBe('add');
    expect(clone.data.worldSpace).toBe(true);
    expect(clone.data.particleCount).toBe(1);
    expect(clone.data.transforms[0]).toBe(1);
    expect(clone.data.positionsZ[0]).toBe(3);
    const out = { x: 0, y: 0, z: 0 };
    getParticleEmitter3DParticleVelocity(out, clone, 0);
    expect(out.z).toBeCloseTo(6);
    // Buffers are sliced, not shared: mutating the clone leaves the source untouched.
    clone.data.transforms[0] = 99;
    expect(emitter.data.transforms[0]).toBe(1);
  });
});

describe('compactParticleEmitter3D', () => {
  it('removes deleted particles and preserves order', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 10, 0, 0, 0, 1);
    appendParticleEmitter3DParticle(emitter, 2, 20, 0, 0, 0, 1);
    appendParticleEmitter3DParticle(emitter, 3, 30, 0, 0, 0, 1);
    emitter.data.ids[1] = PARTICLE_EMITTER_3D_DELETED_ID;
    compactParticleEmitter3D(emitter);
    expect(emitter.data.particleCount).toBe(2);
    expect(emitter.data.ids[0]).toBe(1);
    expect(emitter.data.ids[1]).toBe(3);
    expect(emitter.data.transforms[0]).toBe(10);
    expect(emitter.data.transforms[4]).toBe(30);
  });

  it('carries the Z velocity lane when sliding survivors down', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    appendParticleEmitter3DParticle(emitter, 2, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 1, 4, 5, 6);
    emitter.data.ids[0] = PARTICLE_EMITTER_3D_DELETED_ID;
    compactParticleEmitter3D(emitter);
    const out = { x: 0, y: 0, z: 0 };
    getParticleEmitter3DParticleVelocity(out, emitter, 0);
    expect(out.x).toBeCloseTo(4);
    expect(out.y).toBeCloseTo(5);
    expect(out.z).toBeCloseTo(6);
  });

  it('no-ops on empty emitter', () => {
    const emitter = createParticleEmitter3D();
    compactParticleEmitter3D(emitter);
    expect(emitter.data.particleCount).toBe(0);
  });
});

describe('computeParticleEmitter3DLocalBoundsAabb', () => {
  it('is an empty box for an emitter with no particles', () => {
    const emitter = createParticleEmitter3D();
    const out = createAabb();
    computeParticleEmitter3DLocalBoundsAabb(out, emitter);
    expect(out.min.x).toBe(0);
    expect(out.max.z).toBe(0);
  });

  it('bounds every particle center expanded by the billboard radius', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 2);
    appendParticleEmitter3DParticle(emitter, 2, 10, -4, 6, 0, 2);
    const out = createAabb();
    computeParticleEmitter3DLocalBoundsAabb(out, emitter);
    const r = Math.SQRT1_2 * 2;
    expect(out.min.x).toBeCloseTo(-r);
    expect(out.min.y).toBeCloseTo(-4 - r);
    expect(out.min.z).toBeCloseTo(-r);
    expect(out.max.x).toBeCloseTo(10 + r);
    expect(out.max.y).toBeCloseTo(r);
    expect(out.max.z).toBeCloseTo(6 + r);
  });
});

describe('createParticleEmitter3D', () => {
  it('creates an emitter with ParticleEmitter3DKind', () => {
    const emitter = createParticleEmitter3D();
    expect(emitter.kind).toBe(ParticleEmitter3DKind);
    expect(emitter.data.particleCount).toBe(0);
    expect(emitter.data.worldSpace).toBe(false);
  });

  it('accepts initial data', () => {
    const emitter = createParticleEmitter3D({
      data: { particleCount: 0, worldSpace: true },
      name: 'fire',
    });
    expect(emitter.name).toBe('fire');
    expect(emitter.data.worldSpace).toBe(true);
  });

  it('has a localMatrix (scene node)', () => {
    const emitter = createParticleEmitter3D();
    expect(getNodeLocalMatrix4(emitter)).toBeDefined();
    expect(getNodeLocalMatrix4(emitter).m).toBeDefined();
  });

  it('defaults blendMode to normal and accepts an override', () => {
    expect(createParticleEmitter3D().blendMode).toBe('normal');
    expect(createParticleEmitter3D({ blendMode: 'add' }).blendMode).toBe('add');
  });
});

describe('getParticleEmitter3DCapacity', () => {
  it('returns zero for a fresh emitter', () => {
    const emitter = createParticleEmitter3D();
    expect(getParticleEmitter3DCapacity(emitter)).toBe(0);
  });

  it('returns capacity after reserve', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 64);
    expect(getParticleEmitter3DCapacity(emitter)).toBe(64);
  });

  it('is bounded by every per-particle storage lane', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 8);
    emitter.data.positionsZ = new Float32Array(3);
    emitter.data.colors = new Float32Array(2 * 3);
    expect(getParticleEmitter3DCapacity(emitter)).toBe(2);
  });
});

describe('getParticleEmitter3DParticleAlpha', () => {
  it('returns alpha for a valid index', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleAlpha(emitter, 0, 0.5);
    expect(getParticleEmitter3DParticleAlpha(emitter, 0)).toBe(0.5);
  });

  it('returns -1 for out-of-range index', () => {
    const emitter = createParticleEmitter3D();
    expect(getParticleEmitter3DParticleAlpha(emitter, 0)).toBe(-1);
  });
});

describe('getParticleEmitter3DParticleId', () => {
  it('returns the id', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 42, 0, 0, 0, 0, 1);
    expect(getParticleEmitter3DParticleId(emitter, 0)).toBe(42);
  });

  it('returns -1 for out-of-range', () => {
    const emitter = createParticleEmitter3D();
    expect(getParticleEmitter3DParticleId(emitter, 5)).toBe(-1);
  });
});

describe('getParticleEmitter3DParticleVelocity', () => {
  it('writes the full 3D velocity into out', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 0, 3.5, -2.1, 7.7);
    const out = { x: 0, y: 0, z: 0 };
    expect(getParticleEmitter3DParticleVelocity(out, emitter, 0)).toBe(true);
    expect(out.x).toBeCloseTo(3.5);
    expect(out.y).toBeCloseTo(-2.1);
    expect(out.z).toBeCloseTo(7.7);
  });

  it('returns false for out-of-range', () => {
    const emitter = createParticleEmitter3D();
    const out = { x: 0, y: 0, z: 0 };
    expect(getParticleEmitter3DParticleVelocity(out, emitter, 0)).toBe(false);
  });
});

describe('getParticleEmitter3DRuntime', () => {
  it('returns the runtime', () => {
    const emitter = createParticleEmitter3D();
    const runtime = getParticleEmitter3DRuntime(emitter);
    expect(runtime).toBeDefined();
  });
});

describe('isParticleEmitter3D', () => {
  it('returns true for a 3D emitter', () => {
    const emitter = createParticleEmitter3D();
    expect(isParticleEmitter3D(emitter)).toBe(true);
  });

  it('returns false for other kinds', () => {
    expect(isParticleEmitter3D({ kind: 'Mesh' })).toBe(false);
  });
});

describe('removeParticleEmitter3DParticle', () => {
  it('swap-removes the particle', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 10, 0, 5, 0, 1);
    appendParticleEmitter3DParticle(emitter, 2, 20, 0, 15, 0, 1);
    appendParticleEmitter3DParticle(emitter, 3, 30, 0, 25, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 2, 7, 8, 9);
    removeParticleEmitter3DParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(2);
    expect(emitter.data.ids[0]).toBe(3);
    expect(emitter.data.transforms[0]).toBe(30);
    expect(emitter.data.positionsZ[0]).toBe(25);
    // the swapped-in last particle keeps its full 3D velocity, Z included.
    const out = { x: 0, y: 0, z: 0 };
    getParticleEmitter3DParticleVelocity(out, emitter, 0);
    expect(out.z).toBeCloseTo(9);
  });

  it('no-ops on out-of-range index', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    removeParticleEmitter3DParticle(emitter, 5);
    expect(emitter.data.particleCount).toBe(1);
  });
});

describe('reserveParticleEmitter3D', () => {
  it('grows all buffers', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 100);
    expect(emitter.data.ids.length).toBeGreaterThanOrEqual(100);
    expect(emitter.data.alphas.length).toBeGreaterThanOrEqual(100);
    expect(emitter.data.transforms.length).toBeGreaterThanOrEqual(400);
    expect(emitter.data.positionsZ.length).toBeGreaterThanOrEqual(100);
    expect(emitter.data.velocities.length).toBeGreaterThanOrEqual(300);
    expect(emitter.data.colors.length).toBeGreaterThanOrEqual(300);
  });

  it('does not shrink', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 100);
    reserveParticleEmitter3D(emitter, 50);
    expect(getParticleEmitter3DCapacity(emitter)).toBe(100);
  });

  it('repairs a short storage lane even when the other lanes already have capacity', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 8);
    emitter.data.positionsZ = new Float32Array(0);
    emitter.data.velocities = new Float32Array(0);

    reserveParticleEmitter3D(emitter, 8);

    expect(emitter.data.positionsZ.length).toBeGreaterThanOrEqual(8);
    expect(emitter.data.velocities.length).toBeGreaterThanOrEqual(8 * 3);
  });
});

describe('setParticleEmitter3DParticle', () => {
  it('sets all transform fields including z', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 0, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticle(emitter, 0, 7, 100, 200, 300, 1.5, 3);
    expect(emitter.data.ids[0]).toBe(7);
    expect(emitter.data.transforms[0]).toBe(100);
    expect(emitter.data.transforms[1]).toBe(200);
    expect(emitter.data.transforms[2]).toBe(1.5);
    expect(emitter.data.transforms[3]).toBe(3);
    expect(emitter.data.positionsZ[0]).toBe(300);
  });

  it('no-ops on out-of-range', () => {
    const emitter = createParticleEmitter3D();
    setParticleEmitter3DParticle(emitter, 0, 1, 0, 0, 0, 0, 1);
    expect(emitter.data.particleCount).toBe(0);
  });
});

describe('setParticleEmitter3DParticleAlpha', () => {
  it('sets alpha for a valid index', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleAlpha(emitter, 0, 0.75);
    expect(emitter.data.alphas[0]).toBe(0.75);
  });

  it('no-ops on out-of-range', () => {
    const emitter = createParticleEmitter3D();
    setParticleEmitter3DParticleAlpha(emitter, 0, 0.5);
    expect(emitter.data.particleCount).toBe(0);
  });
});

describe('setParticleEmitter3DParticleColor', () => {
  it('sets the color', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleColor(emitter, 0, 0.2, 0.4, 0.8);
    expect(emitter.data.colors[0]).toBeCloseTo(0.2);
    expect(emitter.data.colors[1]).toBeCloseTo(0.4);
    expect(emitter.data.colors[2]).toBeCloseTo(0.8);
  });
});

describe('setParticleEmitter3DParticleVelocity', () => {
  it('sets the full 3D velocity for a valid index', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 0, 5.5, -3.2, 9.1);
    const vt = 0;
    expect(emitter.data.velocities[vt]).toBeCloseTo(5.5);
    expect(emitter.data.velocities[vt + 1]).toBeCloseTo(-3.2);
    expect(emitter.data.velocities[vt + 2]).toBeCloseTo(9.1);
  });

  it('no-ops on out-of-range', () => {
    const emitter = createParticleEmitter3D();
    setParticleEmitter3DParticleVelocity(emitter, 0, 1, 2, 3);
    expect(emitter.data.particleCount).toBe(0);
  });
});

describe('sortParticleEmitter3DIndicesByViewDepth', () => {
  it('writes stable back-to-front indices without reordering particle storage', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 10, 0, 0, -2, 0, 1);
    appendParticleEmitter3DParticle(emitter, 11, 0, 0, -10, 0, 1);
    appendParticleEmitter3DParticle(emitter, 12, 0, 0, -5, 0, 1);
    appendParticleEmitter3DParticle(emitter, 13, 0, 0, -5, 0, 1);
    const indices = new Uint32Array(4);
    const depths = new Float64Array(4);

    expect(sortParticleEmitter3DIndicesByViewDepth(indices, depths, emitter, createMatrix4())).toBe(true);

    expect(Array.from(indices)).toEqual([1, 2, 3, 0]);
    expect(Array.from(emitter.data.ids.slice(0, 4))).toEqual([10, 11, 12, 13]);
  });

  it('applies the caller-supplied stored-position-to-view matrix', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 10, 2, 0, 0, 0, 1);
    appendParticleEmitter3DParticle(emitter, 11, -3, 0, 0, 0, 1);
    const positionToView = createMatrix4();
    positionToView.m[2] = 1;
    positionToView.m[10] = 0;
    const indices = new Uint32Array(2);

    sortParticleEmitter3DIndicesByViewDepth(indices, new Float64Array(2), emitter, positionToView);

    expect(Array.from(indices)).toEqual([1, 0]);
  });

  it('leaves caller outputs untouched when either scratch lane is too small', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 10, 0, 0, -2, 0, 1);
    appendParticleEmitter3DParticle(emitter, 11, 0, 0, -10, 0, 1);
    const indices = new Uint32Array([99]);
    const depths = new Float64Array([88, 77]);

    expect(sortParticleEmitter3DIndicesByViewDepth(indices, depths, emitter, createMatrix4())).toBe(false);

    expect(Array.from(indices)).toEqual([99]);
    expect(Array.from(depths)).toEqual([88, 77]);
  });

  it('rejects incomplete particle storage before touching outputs', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 10, 0, 0, -2, 0, 1);
    emitter.data.positionsZ = new Float32Array(0);
    const indices = new Uint32Array([99]);
    const depths = new Float64Array([88]);

    expect(sortParticleEmitter3DIndicesByViewDepth(indices, depths, emitter, createMatrix4())).toBe(false);

    expect(Array.from(indices)).toEqual([99]);
    expect(Array.from(depths)).toEqual([88]);
  });
});
