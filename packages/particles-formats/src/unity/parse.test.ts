import { loadUnityParticle, parseUnityParticle } from './parse';
import { serializeUnityParticle } from './serialize';

const SMOKE_JSON = JSON.stringify({
  name: 'smoke',
  duration: 5.0,
  looping: true,
  prewarm: false,
  maxParticles: 500,
  startLifetime: { mode: 'twoConstants', constantMin: 1.0, constantMax: 2.5 },
  startSpeed: { mode: 'twoConstants', constantMin: 0.5, constantMax: 1.5 },
  startSize: { mode: 'twoConstants', constantMin: 0.8, constantMax: 1.2 },
  startRotation: { mode: 'constant', constant: 0 },
  startColor: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
  gravityModifier: 0.1,
  physicsGravity: 9.81,
  emission: {
    rateOverTime: { mode: 'constant', constant: 20 },
    bursts: [],
  },
  shape: {
    enabled: true,
    shapeType: 'Cone',
    radius: 0.5,
    angle: 15,
    scale: { x: 1, y: 1, z: 1 },
  },
  colorOverLifetime: {
    enabled: true,
    colorStart: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
    colorEnd: { r: 0.3, g: 0.3, b: 0.3, a: 0.0 },
  },
  sizeOverLifetime: { enabled: true, sizeStart: 1.0, sizeEnd: 2.0 },
  rotationOverLifetime: {
    enabled: true,
    angularVelocity: { mode: 'twoConstants', constantMin: -45, constantMax: 45 },
  },
});

const PPU = 100;

describe('loadUnityParticle — full round-trip, returns { config, document }', () => {
  it('returns the same config values as parseUnityParticle', () => {
    const config = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    const { config: loaded } = loadUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(loaded.maxParticles).toBe(config.maxParticles);
    expect(loaded.gravityY).toBeCloseTo(config.gravityY, 5);
  });

  it('preserves name, looping, and prewarm in document', () => {
    const { document } = loadUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(document.name).toBe('smoke');
    expect(document.looping).toBe(true);
    expect(document.prewarm).toBe(false);
  });
});

describe('parseUnityParticle — lightweight, returns config directly', () => {
  it('returns a ParticleEmitterConfig (not a Parsed object)', () => {
    const result = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(typeof result.maxParticles).toBe('number');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses maxParticles', () => {
    expect(parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU }).maxParticles).toBe(500);
  });

  it('maps startLifetime to lifetimeMin/Max', () => {
    const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(c.lifetimeMin).toBeCloseTo(1.0);
    expect(c.lifetimeMax).toBeCloseTo(2.5);
  });

  it('scales speed by pixelsPerUnit', () => {
    const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(c.speedMin).toBeCloseTo(50);
    expect(c.speedMax).toBeCloseTo(150);
  });

  it('converts gravity with gravityModifier and physicsGravity', () => {
    const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(c.gravityY).toBeCloseTo(0.1 * 9.81 * PPU, 1);
  });

  it('maps Cone shape to spread', () => {
    expect(parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU }).spread).toBeCloseTo((15 * Math.PI) / 180, 3);
  });

  it('maps colorOverLifetime when enabled', () => {
    const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(c.colorStartR).toBeCloseTo(0.8);
    expect(c.colorEndR).toBeCloseTo(0.3);
    expect(c.alphaStart).toBeCloseTo(1.0);
    expect(c.alphaEnd).toBeCloseTo(0.0);
  });

  it('maps sizeOverLifetime to scaleEnd', () => {
    expect(parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU }).scaleEnd).toBeCloseTo(2.0);
  });

  it('maps rotationOverLifetime to rotationSpeedMin/Max', () => {
    const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    expect(c.rotationSpeedMin).toBeCloseTo((-45 * Math.PI) / 180, 3);
    expect(c.rotationSpeedMax).toBeCloseTo((45 * Math.PI) / 180, 3);
  });

  it('maps burst count and interval', () => {
    const json = JSON.stringify({
      ...JSON.parse(SMOKE_JSON),
      emission: {
        rateOverTime: { mode: 'constant', constant: 0 },
        bursts: [{ time: 0, count: 25, cycleCount: 0, repeatInterval: 2 }],
      },
    });
    const c = parseUnityParticle(json, { pixelsPerUnit: PPU });
    expect(c.burstCount).toBe(25);
    expect(c.burstInterval).toBe(2);
  });
});

describe('serializeUnityParticle', () => {
  it('round-trips key config fields', () => {
    const config = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    const { document } = loadUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    const config2 = parseUnityParticle(serializeUnityParticle(config, document, { pixelsPerUnit: PPU }), {
      pixelsPerUnit: PPU,
    });
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.lifetimeMin).toBeCloseTo(config.lifetimeMin, 3);
    expect(config2.gravityY).toBeCloseTo(config.gravityY, 2);
    expect(config2.alphaEnd).toBeCloseTo(config.alphaEnd, 3);
    expect(config2.scaleEnd).toBeCloseTo(config.scaleEnd, 2);
  });

  it('produces valid JSON', () => {
    expect(() => JSON.parse(serializeUnityParticle(parseUnityParticle(SMOKE_JSON)))).not.toThrow();
  });
});
