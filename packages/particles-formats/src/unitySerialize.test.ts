import { parseUnityParticle, parseUnityParticleDocument } from './unityParse';
import { serializeUnityParticle } from './unitySerialize';

const SMOKE_JSON = JSON.stringify({
  name: 'smoke',
  duration: 5.0,
  looping: true,
  prewarm: false,
  maxParticles: 500,
  startLifetime: { mode: 'twoConstants', constantMin: 1.0, constantMax: 2.5 },
  startSpeed: { mode: 'twoConstants', constantMin: 0.5, constantMax: 1.5 },
  startSize: { mode: 'constant', constant: 1.0 },
  startRotation: { mode: 'constant', constant: 0 },
  startColor: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
  gravityModifier: 0.0,
  physicsGravity: 9.81,
  emission: { rateOverTime: { mode: 'constant', constant: 20 }, bursts: [] },
  shape: { enabled: false, shapeType: 'Cone', radius: 0, angle: 25, scale: { x: 1, y: 1, z: 1 } },
  colorOverLifetime: { enabled: false, colorStart: { r: 1, g: 1, b: 1, a: 1 }, colorEnd: { r: 1, g: 1, b: 1, a: 0 } },
  sizeOverLifetime: { enabled: false, sizeStart: 1, sizeEnd: 1 },
  rotationOverLifetime: { enabled: false, angularVelocity: { mode: 'constant', constant: 0 } },
});

describe('serializeUnityParticle', () => {
  it('produces valid JSON', () => {
    const config = parseUnityParticle(SMOKE_JSON);
    expect(() => JSON.parse(serializeUnityParticle(config))).not.toThrow();
  });

  it('round-trips key config fields through parse → serialize → parse', () => {
    const config = parseUnityParticle(SMOKE_JSON);
    const { document } = parseUnityParticleDocument(SMOKE_JSON);
    const json2 = serializeUnityParticle(config, document);
    const config2 = parseUnityParticle(json2);
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.lifetimeMin).toBeCloseTo(config.lifetimeMin, 3);
    expect(config2.lifetimeMax).toBeCloseTo(config.lifetimeMax, 3);
  });

  it('preserves name from existing document', () => {
    const config = parseUnityParticle(SMOKE_JSON);
    const { document } = parseUnityParticleDocument(SMOKE_JSON);
    const json2 = JSON.parse(serializeUnityParticle(config, document)) as Record<string, unknown>;
    expect(json2.name).toBe('smoke');
  });
});
