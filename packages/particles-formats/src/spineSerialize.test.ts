import { parseSpineParticle, parseSpineParticleDocument } from './spineParse';
import { serializeSpineParticle } from './spineSerialize';

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
  rotation: { low: 0, high: 0 },
  wind: { low: 0, high: 0 },
  gravity: { low: 0, high: 0 },
  scale: { low: 0.5, high: 1.5 },
  scaleEnd: { low: 0, high: 0 },
  tint: [
    { time: 0, color: 'ffffff' },
    { time: 1, color: 'ff0000' },
  ],
  alpha: [
    { time: 0, alpha: 1 },
    { time: 1, alpha: 0 },
  ],
  blendMode: 'normal',
  premultiplied: false,
  images: ['spark.png'],
});

describe('serializeSpineParticle', () => {
  it('produces valid JSON', () => {
    const config = parseSpineParticle(SPARK_JSON);
    expect(() => JSON.parse(serializeSpineParticle(config))).not.toThrow();
  });

  it('round-trips key config fields through parse → serialize → parse', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { document } = parseSpineParticleDocument(SPARK_JSON);
    const json2 = serializeSpineParticle(config, document);
    const config2 = parseSpineParticle(json2);
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.lifetimeMin).toBeCloseTo(config.lifetimeMin, 3);
    expect(config2.lifetimeMax).toBeCloseTo(config.lifetimeMax, 3);
  });

  it('preserves name from existing document', () => {
    const config = parseSpineParticle(SPARK_JSON);
    const { document } = parseSpineParticleDocument(SPARK_JSON);
    const json2 = JSON.parse(serializeSpineParticle(config, document)) as Record<string, unknown>;
    expect(json2.name).toBe('spark');
  });
});
