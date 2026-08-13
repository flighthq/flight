import {
  createParticleEmitterConfig,
  particleColorCurveFromKeyframes,
  particleCurveFromKeyframes,
  sampleParticleColorCurve,
  sampleParticleCurve,
} from '@flighthq/particles/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

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

describe('parseUnityParticle', () => {
  describe('gradient / size curves bake into curves', () => {
    it('leaves curves null when colorOverLifetime has only start/end', () => {
      const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
      expect(c.colorCurve).toBeNull();
      expect(c.alphaCurve).toBeNull();
      expect(c.scaleCurve).toBeNull();
    });

    it('bakes a multi-stop gradient (colorKeys + alphaKeys) into curves', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        colorOverLifetime: {
          enabled: true,
          gradient: {
            colorKeys: [
              { time: 0, color: { r: 1, g: 0, b: 0 } },
              { time: 0.5, color: { r: 0, g: 1, b: 0 } },
              { time: 1, color: { r: 0, g: 0, b: 1 } },
            ],
            alphaKeys: [
              { time: 0, alpha: 0 },
              { time: 0.5, alpha: 1 },
              { time: 1, alpha: 0 },
            ],
          },
        },
      });
      const c = parseUnityParticle(json, { pixelsPerUnit: PPU });
      expect(c.colorCurve).not.toBeNull();
      expect(c.alphaCurve).not.toBeNull();
      const out = [0, 0, 0];
      sampleParticleColorCurve(out, 0, c.colorCurve!, 0.5);
      expect(out[1]).toBeGreaterThan(0.8); // green mid-life
      expect(sampleParticleCurve(c.alphaCurve!, 0.5)).toBeGreaterThan(0.9); // alpha peaks mid-life
    });

    it('bakes a size-over-lifetime AnimationCurve into scaleCurve', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        sizeOverLifetime: {
          enabled: true,
          curve: {
            keys: [
              { time: 0, value: 0 },
              { time: 0.5, value: 1 },
              { time: 1, value: 0 },
            ],
          },
        },
      });
      const c = parseUnityParticle(json, { pixelsPerUnit: PPU });
      expect(c.scaleCurve).not.toBeNull();
      expect(sampleParticleCurve(c.scaleCurve!, 0.5)).toBeGreaterThan(sampleParticleCurve(c.scaleCurve!, 0));
    });

    it('does not warn about a gradient now that it is baked', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        colorOverLifetime: {
          enabled: true,
          gradient: {
            colorKeys: [
              { time: 0, color: { r: 1, g: 1, b: 1 } },
              { time: 0.5, color: { r: 0.5, g: 0.5, b: 0.5 } },
              { time: 1, color: { r: 0, g: 0, b: 0 } },
            ],
          },
        },
      });
      expect(parseUnityParticleDocument(json).diagnostics.some((d) => d.kind.toLowerCase().includes('gradient'))).toBe(
        false,
      );
    });
  });

  describe('lightweight, returns config directly', () => {
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

    it('maps a looping system to loop=true / duration=0 (emit forever)', () => {
      const c = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
      expect(c.loop).toBe(true);
      expect(c.duration).toBe(0);
    });

    it('maps a non-looping system to loop=false with its duration', () => {
      const json = JSON.stringify({ ...JSON.parse(SMOKE_JSON), looping: false, duration: 3 });
      const c = parseUnityParticle(json, { pixelsPerUnit: PPU });
      expect(c.loop).toBe(false);
      expect(c.duration).toBeCloseTo(3);
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

  describe('malformed input', () => {
    it('throws a clear, format-tagged error on invalid JSON', () => {
      expect(() => parseUnityParticle('{not valid')).toThrow(/Invalid Unity particle JSON/);
    });

    it('throws a clear error when the root is not an object', () => {
      expect(() => parseUnityParticle('null')).toThrow(/expected a JSON object/);
      expect(() => parseUnityParticle('42')).toThrow(/expected a JSON object/);
      expect(() => parseUnityParticle('[]')).toThrow(/expected a JSON object/);
    });

    it('falls back to defaults for an empty object rather than producing NaN', () => {
      const c = parseUnityParticle('{}');
      expect(Number.isFinite(c.maxParticles)).toBe(true);
      expect(Number.isFinite(c.lifetimeMin)).toBe(true);
      expect(Number.isFinite(c.gravityY)).toBe(true);
      expect(Number.isFinite(c.spawnRate)).toBe(true);
    });
  });
});

describe('parseUnityParticleDocument', () => {
  describe('full round-trip, returns { config, document }', () => {
    it('returns the same config values as parseUnityParticle', () => {
      const config = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
      const { config: loaded } = parseUnityParticleDocument(SMOKE_JSON, { pixelsPerUnit: PPU });
      expect(loaded.maxParticles).toBe(config.maxParticles);
      expect(loaded.gravityY).toBeCloseTo(config.gravityY, 5);
    });

    it('preserves name, looping, and prewarm in document', () => {
      const { document } = parseUnityParticleDocument(SMOKE_JSON, { pixelsPerUnit: PPU });
      expect(document.name).toBe('smoke');
      expect(document.looping).toBe(true);
      expect(document.prewarm).toBe(false);
    });
  });

  describe('import warnings', () => {
    it('has no warnings for a config-representable system', () => {
      expect(parseUnityParticleDocument(SMOKE_JSON, { pixelsPerUnit: PPU }).diagnostics).toEqual([]);
    });

    it('warns about unsupported modules that are enabled', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        noise: { enabled: true },
        collision: { enabled: true },
        trails: { enabled: false }, // disabled → no warning
      });
      const { diagnostics } = parseUnityParticleDocument(json, { pixelsPerUnit: PPU });
      // One Skip crumb per distinct unsupported module (module label as the discriminator), from
      // collectUnityDiagnostics; the disabled trails module produces none.
      const noise = diagnostics.find((d) => d.kind === 'unity.module-unsupported' && d.detail?.module === 'noise');
      expect(noise).toBeDefined();
      expect(noise!.severity).toBe(ImportDiagnosticSeverity.Skip);
      expect(noise!.origin).toBe('collectUnityDiagnostics');
      expect(diagnostics.some((d) => d.kind === 'unity.module-unsupported' && d.detail?.module === 'collision')).toBe(
        true,
      );
      expect(diagnostics.some((d) => d.detail?.module === 'trails')).toBe(false);
    });

    it('reports unity.extra-bursts-dropped (Skip) when more than one burst is present', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        emission: {
          rateOverTime: { mode: 'constant', constant: 0 },
          bursts: [
            { time: 0, count: 5 },
            { time: 1, count: 5 },
          ],
        },
      });
      const crumb = parseUnityParticleDocument(json).diagnostics.find((d) => d.kind === 'unity.extra-bursts-dropped');
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
      expect(crumb!.origin).toBe('collectUnityDiagnostics');
      expect(crumb!.detail?.burstCount).toBe(2);
    });

    it('recovers and reports unity.shape-unsupported for an enabled shape Flight does not map', () => {
      const json = JSON.stringify({ ...JSON.parse(SMOKE_JSON), shape: { enabled: true, shapeType: 'Donut' } });
      const crumb = parseUnityParticleDocument(json).diagnostics.find((d) => d.kind === 'unity.shape-unsupported');
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
      expect(crumb!.origin).toBe('collectUnityDiagnostics');
      expect(crumb!.detail?.shapeType).toBe('Donut');
    });

    it('reports unity.prewarm-unsupported (Skip) when prewarm is true', () => {
      const json = JSON.stringify({ ...JSON.parse(SMOKE_JSON), prewarm: true });
      const crumb = parseUnityParticleDocument(json).diagnostics.find((d) => d.kind === 'unity.prewarm-unsupported');
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
      expect(crumb!.origin).toBe('collectUnityDiagnostics');
    });

    it('reports unity.start-rotation-unsupported (Skip) for a non-zero constant startRotation', () => {
      const json = JSON.stringify({ ...JSON.parse(SMOKE_JSON), startRotation: { mode: 'constant', constant: 45 } });
      const crumb = parseUnityParticleDocument(json).diagnostics.find(
        (d) => d.kind === 'unity.start-rotation-unsupported',
      );
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
      expect(crumb!.origin).toBe('collectUnityDiagnostics');
    });

    it('reports unity.start-rotation-unsupported (Skip) for a curve-mode startRotation (value lives in a curve)', () => {
      const json = JSON.stringify({
        ...JSON.parse(SMOKE_JSON),
        startRotation: { mode: 'curve', curve: { keys: [{ time: 0, value: 90 }] } },
      });
      const crumb = parseUnityParticleDocument(json).diagnostics.find(
        (d) => d.kind === 'unity.start-rotation-unsupported',
      );
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
      expect(crumb!.origin).toBe('collectUnityDiagnostics');
    });
  });
});

describe('serializeUnityParticle', () => {
  it('round-trips key config fields', () => {
    const config = parseUnityParticle(SMOKE_JSON, { pixelsPerUnit: PPU });
    const { document } = parseUnityParticleDocument(SMOKE_JSON, { pixelsPerUnit: PPU });
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

describe('serializeUnityParticle — curve round-trip', () => {
  it('emits baked color/alpha/scale curves as gradient + AnimationCurve that re-import identically', () => {
    const colorCurve = particleColorCurveFromKeyframes([
      { time: 0, r: 1, g: 0, b: 0 },
      { time: 0.5, r: 0, g: 1, b: 0 },
      { time: 1, r: 0, g: 0, b: 1 },
    ]);
    const alphaCurve = particleCurveFromKeyframes([
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 1, value: 0 },
    ]);
    const scaleCurve = particleCurveFromKeyframes([
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 1, value: 0 },
    ]);
    const config = createParticleEmitterConfig({ colorCurve, alphaCurve, scaleCurve });
    const json = serializeUnityParticle(config, undefined, { pixelsPerUnit: PPU });
    // The serialized JSON should carry a gradient and a size AnimationCurve.
    const doc = JSON.parse(json) as Record<string, unknown>;
    const col = doc.colorOverLifetime as Record<string, unknown>;
    expect(col.gradient).toBeDefined();
    const size = doc.sizeOverLifetime as Record<string, unknown>;
    expect(size.curve).toBeDefined();
    // ...and re-importing reproduces the curves.
    const c2 = parseUnityParticle(json, { pixelsPerUnit: PPU });
    expect(c2.colorCurve).not.toBeNull();
    expect(c2.alphaCurve).not.toBeNull();
    expect(c2.scaleCurve).not.toBeNull();
    const out = [0, 0, 0];
    sampleParticleColorCurve(out, 0, c2.colorCurve!, 0.5);
    expect(out[1]).toBeGreaterThan(0.8);
    expect(sampleParticleCurve(c2.alphaCurve!, 0.5)).toBeGreaterThan(0.9);
    expect(sampleParticleCurve(c2.scaleCurve!, 0.5)).toBeGreaterThan(sampleParticleCurve(c2.scaleCurve!, 0));
  });
});
