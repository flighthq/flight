import { sampleColorCurve, sampleCurve } from '@flighthq/particles';

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

describe('loadSpineParticle — import warnings', () => {
  it('has no warnings for a 2-keyframe tint/alpha effect', () => {
    expect(loadSpineParticle(SPARK_JSON).warnings).toEqual([]);
  });

  it('does NOT warn for multi-keyframe tint timelines (they are baked into curves)', () => {
    const json = JSON.stringify({
      ...JSON.parse(SPARK_JSON),
      tint: [
        { time: 0, color: 'ff0000' },
        { time: 0.5, color: '00ff00' },
        { time: 1, color: '0000ff' },
      ],
    });
    const { warnings } = loadSpineParticle(json);
    expect(warnings.some((w) => w.includes('Tint'))).toBe(false);
  });

  it('warns about unsupported lifeOffset', () => {
    const json = JSON.stringify({ ...JSON.parse(SPARK_JSON), lifeOffset: { low: 100, high: 200 } });
    expect(loadSpineParticle(json).warnings.some((w) => w.includes('lifeOffset'))).toBe(true);
  });
});

describe('parseSpineParticle — blend mode', () => {
  it('maps additive blendMode to "add"', () => {
    expect(parseSpineParticle(SPARK_JSON).blendMode).toBe('add');
  });

  it('maps normal blendMode to "normal"', () => {
    const json = JSON.stringify({ ...JSON.parse(SPARK_JSON), blendMode: 'normal' });
    expect(parseSpineParticle(json).blendMode).toBe('normal');
  });

  it('round-trips blendMode through serialize', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { document } = loadSpineParticle(SPARK_JSON);
    const config2 = parseSpineParticle(serializeSpineParticle(config, document));
    expect(config2.blendMode).toBe('add');
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

  it('maps continuous=true to a looping emitter (emit forever)', () => {
    const c = parseSpineParticle(SPARK_JSON);
    expect(c.loop).toBe(true);
    expect(c.duration).toBe(0);
  });

  it('maps continuous=false with a duration to a finite, non-looping emitter', () => {
    const json = JSON.stringify({ ...JSON.parse(SPARK_JSON), continuous: false, duration: 2000 });
    const c = parseSpineParticle(json);
    expect(c.loop).toBe(false);
    expect(c.duration).toBeCloseTo(2); // 2000 ms → 2 s
  });
});

describe('parseSpineParticle — malformed input', () => {
  it('throws a clear, format-tagged error on invalid JSON', () => {
    expect(() => parseSpineParticle('{not valid')).toThrow(/Invalid Spine particle JSON/);
  });

  it('throws a clear error when the root is not an object', () => {
    expect(() => parseSpineParticle('null')).toThrow(/expected a JSON object/);
    expect(() => parseSpineParticle('"a string"')).toThrow(/expected a JSON object/);
    expect(() => parseSpineParticle('[1,2,3]')).toThrow(/expected a JSON object/);
  });

  it('falls back to safe channel values for an unparseable tint color (no NaN)', () => {
    const c = parseSpineParticle(JSON.stringify({ tint: [{ time: 0, color: 'zzzzzz' }] }));
    expect(Number.isFinite(c.colorStartR)).toBe(true);
    expect(Number.isFinite(c.colorStartG)).toBe(true);
    expect(Number.isFinite(c.colorStartB)).toBe(true);
  });

  it('falls back to defaults for an empty object rather than producing NaN', () => {
    const c = parseSpineParticle('{}');
    expect(Number.isFinite(c.lifetimeMin)).toBe(true);
    expect(Number.isFinite(c.spawnRate)).toBe(true);
    expect(Number.isFinite(c.colorStartR)).toBe(true);
  });
});

describe('parseSpineParticle — multi-stop timelines bake into curves', () => {
  it('leaves curves null for a 2-stop tint/alpha (linear path)', () => {
    const c = parseSpineParticle(SPARK_JSON); // tint/alpha each have 2 keyframes
    expect(c.colorCurve).toBeNull();
    expect(c.alphaCurve).toBeNull();
  });

  it('bakes a 3-stop tint timeline into colorCurve preserving the middle stop', () => {
    const json = JSON.stringify({
      ...JSON.parse(SPARK_JSON),
      tint: [
        { time: 0, color: 'ff0000' }, // red
        { time: 0.5, color: '00ff00' }, // green
        { time: 1, color: '0000ff' }, // blue
      ],
    });
    const c = parseSpineParticle(json);
    expect(c.colorCurve).not.toBeNull();
    const out = [0, 0, 0];
    sampleColorCurve(c.colorCurve!, 0.5, out, 0);
    expect(out[1]).toBeGreaterThan(0.8); // green dominant at mid-life
    expect(out[0]).toBeLessThan(0.2);
  });

  it('bakes a 3-stop alpha timeline into alphaCurve', () => {
    const json = JSON.stringify({
      ...JSON.parse(SPARK_JSON),
      alpha: [
        { time: 0, alpha: 0 },
        { time: 0.5, alpha: 1 }, // peak mid-life
        { time: 1, alpha: 0 },
      ],
    });
    const c = parseSpineParticle(json);
    expect(c.alphaCurve).not.toBeNull();
    expect(sampleCurve(c.alphaCurve!, 0.5)).toBeGreaterThan(0.9);
    expect(sampleCurve(c.alphaCurve!, 0)).toBeLessThan(0.1);
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
