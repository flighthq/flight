import { ParticleEmitter3DKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  PARTICLE_EMITTER_3D_DELETED_ID,
  appendParticleEmitter3DParticle,
  clearParticleEmitter3D,
  compactParticleEmitter3D,
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

  it('no-ops on empty emitter', () => {
    const emitter = createParticleEmitter3D();
    compactParticleEmitter3D(emitter);
    expect(emitter.data.particleCount).toBe(0);
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
    expect(emitter.localMatrix).toBeDefined();
    expect(emitter.localMatrix.m).toBeDefined();
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
  it('writes velocity into out', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 0, 3.5, -2.1);
    const out = { x: 0, y: 0 };
    expect(getParticleEmitter3DParticleVelocity(out, emitter, 0)).toBe(true);
    expect(out.x).toBeCloseTo(3.5);
    expect(out.y).toBeCloseTo(-2.1);
  });

  it('returns false for out-of-range', () => {
    const emitter = createParticleEmitter3D();
    const out = { x: 0, y: 0 };
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
    removeParticleEmitter3DParticle(emitter, 0);
    expect(emitter.data.particleCount).toBe(2);
    expect(emitter.data.ids[0]).toBe(3);
    expect(emitter.data.transforms[0]).toBe(30);
    expect(emitter.data.positionsZ[0]).toBe(25);
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
    expect(emitter.data.velocities.length).toBeGreaterThanOrEqual(200);
    expect(emitter.data.colors.length).toBeGreaterThanOrEqual(300);
  });

  it('does not shrink', () => {
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 100);
    reserveParticleEmitter3D(emitter, 50);
    expect(getParticleEmitter3DCapacity(emitter)).toBe(100);
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
  it('sets velocity for a valid index', () => {
    const emitter = createParticleEmitter3D();
    appendParticleEmitter3DParticle(emitter, 1, 0, 0, 0, 0, 1);
    setParticleEmitter3DParticleVelocity(emitter, 0, 5.5, -3.2);
    const vt = 0;
    expect(emitter.data.velocities[vt]).toBeCloseTo(5.5);
    expect(emitter.data.velocities[vt + 1]).toBeCloseTo(-3.2);
  });

  it('no-ops on out-of-range', () => {
    const emitter = createParticleEmitter3D();
    setParticleEmitter3DParticleVelocity(emitter, 0, 1, 2);
    expect(emitter.data.particleCount).toBe(0);
  });
});
