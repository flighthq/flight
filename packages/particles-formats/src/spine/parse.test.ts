import { loadSpineParticle, parseSpineParticle } from './parse';
import { serializeSpineParticle } from './serialize';

const SPARK_JSON = JSON.stringify({
  name: 'spark',
  maxParticles: 300,
  continuous: true,
  duration: -1,
  emission: { low: 80, high: 120 },
  life: { low: 400, high: 800 },
  lifeOffset: { low: 0, high: 0 },
  x: { low: 0, high: 0 },
  y: { low: 0, high: 0 },
  spawnShape: 'point',
  spawnWidth: { low: 0, high: 0 },
  spawnHeight: { low: 0, high: 0 },
  velocity: { low: 50, high: 200 },
  angle: { low: 60, high: 120 },
  rotation: { low: 0, high: 360 },
  wind: { low: 0, high: 0 },
  gravity: { low: 200, high: 200 },
  scale: { low: 0.5, high: 1.5 },
  scaleEnd: { low: 0, high: 0 },
  tint: [
    { time: 0, color: 'ffaa00' },
    { time: 1, color: 'ff0000' },
  ],
  alpha: [
    { time: 0, alpha: 1 },
    { time: 1, alpha: 0 },
  ],
  blendMode: 'additive',
  premultiplied: false,
  images: ['spark.png'],
});

describe('loadSpineParticle — full round-trip, returns { config, document }', () => {
  it('returns the same config values as parseSpineParticle', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { config: loaded } = loadSpineParticle(SPARK_JSON);
    expect(loaded.maxParticles).toBe(config.maxParticles);
    expect(loaded.gravityY).toBeCloseTo(config.gravityY, 5);
  });

  it('preserves name, blendMode, and images in document', () => {
    const { document } = loadSpineParticle(SPARK_JSON);
    expect(document.name).toBe('spark');
    expect(document.blendMode).toBe('additive');
    expect(document.images[0]).toBe('spark.png');
  });
});

describe('parseSpineParticle — lightweight, returns config directly', () => {
  it('returns a ParticleEmitterConfig (not a Parsed object)', () => {
    const result = parseSpineParticle(SPARK_JSON);
    expect(typeof result.maxParticles).toBe('number');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses maxParticles', () => {
    expect(parseSpineParticle(SPARK_JSON).maxParticles).toBe(300);
  });

  it('converts life range from ms to seconds', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.lifetimeMin).toBeCloseTo(0.4);
    expect(c.lifetimeMax).toBeCloseTo(0.8);
  });

  it('converts emission to spawnRate', () => {
    expect(parseSpineParticle(SPARK_JSON).spawnRate).toBeCloseTo(100);
  });

  it('maps velocity to speedMin/Max', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.speedMin).toBeCloseTo(50);
    expect(c.speedMax).toBeCloseTo(200);
  });

  it('derives direction from angle midpoint and spread from range', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.directionX).toBeCloseTo(0, 2);
    expect(c.directionY).toBeCloseTo(-1, 2);
    expect(c.spread).toBeCloseTo((30 * Math.PI) / 180, 3);
  });

  it('maps gravity', () => {
    expect(parseSpineParticle(SPARK_JSON).gravityY).toBeCloseTo(200);
  });

  it('maps tint keyframes to colorStart/End', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.colorStartR).toBeCloseTo(1);
    expect(c.colorStartG).toBeCloseTo(0xaa / 255, 2);
    expect(c.colorEndR).toBeCloseTo(1);
    expect(c.colorEndG).toBeCloseTo(0);
  });

  it('maps alpha keyframes', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.alphaStart).toBeCloseTo(1);
    expect(c.alphaEnd).toBeCloseTo(0);
  });

  it('maps rotation range to rotationSpeedMin/Max', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.rotationSpeedMin).toBeCloseTo(0);
    expect(c.rotationSpeedMax).toBeCloseTo((360 * Math.PI) / 180, 3);
  });
});

describe('serializeSpineParticle', () => {
  it('round-trips key config fields', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { document } = loadSpineParticle(SPARK_JSON);
    const config2 = parseSpineParticle(serializeSpineParticle(config, document));
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.lifetimeMin).toBeCloseTo(config.lifetimeMin, 3);
    expect(config2.speedMax).toBeCloseTo(config.speedMax, 2);
    expect(config2.gravityY).toBeCloseTo(config.gravityY, 2);
  });

  it('preserves blendMode in round-trip', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { document } = loadSpineParticle(SPARK_JSON);
    expect(loadSpineParticle(serializeSpineParticle(config, document)).document.blendMode).toBe('additive');
  });

  it('produces valid JSON', () => {
    expect(() => JSON.parse(serializeSpineParticle(parseSpineParticle(SPARK_JSON)))).not.toThrow();
  });
});
