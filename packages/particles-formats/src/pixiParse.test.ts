import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { parsePixiParticle, parsePixiParticleDocument } from './pixiParse';

const FIRE_PIXI = JSON.stringify({
  alpha: { start: 1, end: 0 },
  scale: { start: 0.5, end: 1.5, minimumScaleMultiplier: 1 },
  color: { start: 'ffaa00', end: 'ff0000' },
  speed: { start: 200, end: 50 },
  acceleration: { x: 0, y: 0 },
  maxSpeed: 0,
  maxParticles: 1000,
  startRotation: { min: 0, max: 360 },
  noRotation: false,
  rotationSpeed: { min: 0, max: 0 },
  lifetime: { min: 0.5, max: 1.5 },
  blendMode: 'add',
  frequency: 0.001,
  emitterLifetime: -1,
  pos: { x: 0, y: 0 },
  addAtBack: false,
  spawnType: 'point',
});

const RECT_PIXI = JSON.stringify({
  alpha: { start: 1, end: 0 },
  scale: { start: 1, end: 1 },
  color: { start: 'ffffff', end: 'ffffff' },
  speed: { start: 100, end: 100 },
  maxParticles: 200,
  lifetime: { min: 1, max: 2 },
  blendMode: 'normal',
  frequency: 0.01,
  pos: { x: 0, y: 0 },
  spawnRect: { x: -50, y: -50, w: 100, h: 100 },
});

describe('parsePixiParticle', () => {
  it('returns a ParticleEmitterConfig (not a ParseResult object)', () => {
    const result = parsePixiParticle(FIRE_PIXI) as unknown as Record<string, unknown>;
    expect(typeof result.maxParticles).toBe('number');
    expect(result.diagnostics).toBeUndefined();
  });
  it('parses maxParticles', () => {
    expect(parsePixiParticle(FIRE_PIXI).maxParticles).toBe(1000);
  });
  it('converts frequency to spawnRate', () => {
    // frequency=0.001 -> spawnRate = 1/0.001 = 1000
    expect(parsePixiParticle(FIRE_PIXI).spawnRate).toBeCloseTo(1000, 0);
  });
  it('maps lifetime to lifetimeMin/Max', () => {
    const c = parsePixiParticle(FIRE_PIXI);
    expect(c.lifetimeMin).toBeCloseTo(0.5);
    expect(c.lifetimeMax).toBeCloseTo(1.5);
  });
  it('maps speed start/end to speedMin/Max (sorted)', () => {
    const c = parsePixiParticle(FIRE_PIXI);
    // speed start=200, end=50 -> min=50, max=200
    expect(c.speedMin).toBeCloseTo(50);
    expect(c.speedMax).toBeCloseTo(200);
  });
  it('maps alpha start/end to alphaStart/End', () => {
    const c = parsePixiParticle(FIRE_PIXI);
    expect(c.alphaStart).toBeCloseTo(1);
    expect(c.alphaEnd).toBeCloseTo(0);
  });
  it('maps color start/end to colorStart/End', () => {
    const c = parsePixiParticle(FIRE_PIXI);
    expect(c.colorStartR).toBeCloseTo(1);
    expect(c.colorStartG).toBeCloseTo(0xaa / 255, 2);
    expect(c.colorEndR).toBeCloseTo(1);
    expect(c.colorEndG).toBeCloseTo(0);
  });
  it('maps blendMode="add" to blendMode="add"', () => {
    expect(parsePixiParticle(FIRE_PIXI).blendMode).toBe('add');
  });
  it('maps blendMode="normal" to blendMode="normal"', () => {
    expect(parsePixiParticle(RECT_PIXI).blendMode).toBe('normal');
  });
  it('maps spawnRect to rect emitter shape', () => {
    const c = parsePixiParticle(RECT_PIXI);
    expect(c.emitterShape).toBe('rect');
    expect(c.emitterWidth).toBeCloseTo(100);
    expect(c.emitterHeight).toBeCloseTo(100);
  });
  it('maps spawnCircle to circle emitter shape', () => {
    const json = JSON.stringify({ ...JSON.parse(FIRE_PIXI), spawnCircle: { x: 0, y: 0, r: 30 } });
    const c = parsePixiParticle(json);
    expect(c.emitterShape).toBe('circle');
    expect(c.emitterRadius).toBeCloseTo(30);
  });
  it('maps scale to scaleMin/Max', () => {
    const c = parsePixiParticle(FIRE_PIXI);
    // scale start=0.5, end=1.5 -> min=0.5, max=1.5
    expect(c.scaleMin).toBeCloseTo(0.5);
    expect(c.scaleMax).toBeCloseTo(1.5);
  });
  it('throws a clear, format-tagged error on invalid JSON', () => {
    expect(() => parsePixiParticle('{not valid')).toThrow(/Invalid Pixi particle JSON/);
  });
  it('throws a clear error when the root is not an object', () => {
    expect(() => parsePixiParticle('null')).toThrow(/expected a JSON object/);
    expect(() => parsePixiParticle('[1,2]')).toThrow(/expected a JSON object/);
  });
  it('falls back to defaults for an empty object without producing NaN', () => {
    const c = parsePixiParticle('{}');
    expect(Number.isFinite(c.maxParticles)).toBe(true);
    expect(Number.isFinite(c.lifetimeMin)).toBe(true);
  });
});

describe('parsePixiParticleDocument', () => {
  it('returns the same config as parsePixiParticle', () => {
    const config = parsePixiParticle(FIRE_PIXI);
    const { config: loaded } = parsePixiParticleDocument(FIRE_PIXI);
    expect(loaded.maxParticles).toBe(config.maxParticles);
    expect(loaded.speedMax).toBeCloseTo(config.speedMax, 3);
  });
  it('has no warnings for a standard point emitter', () => {
    const { diagnostics } = parsePixiParticleDocument(FIRE_PIXI);
    expect(diagnostics).toEqual([]);
  });
  it('reports pixi.acceleration-unsupported (Skip) when acceleration is non-zero', () => {
    const json = JSON.stringify({ ...JSON.parse(FIRE_PIXI), acceleration: { x: 0, y: 100 } });
    const crumb = parsePixiParticleDocument(json).diagnostics.find((d) => d.kind === 'pixi.acceleration-unsupported');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('collectPixiDiagnostics');
  });
  it('reports pixi.spawn-burst-mapped-to-point (Recover) when spawnBurst is present', () => {
    const json = JSON.stringify({ ...JSON.parse(FIRE_PIXI), spawnBurst: { count: 5, time: 0.5 } });
    const crumb = parsePixiParticleDocument(json).diagnostics.find(
      (d) => d.kind === 'pixi.spawn-burst-mapped-to-point',
    );
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('collectPixiDiagnostics');
  });
  it('reports pixi.spawn-polygon-mapped-to-point (Recover) when spawnPolygon is present', () => {
    const json = JSON.stringify({ ...JSON.parse(FIRE_PIXI), spawnPolygon: [{ x: 0, y: 0 }] });
    const crumb = parsePixiParticleDocument(json).diagnostics.find(
      (d) => d.kind === 'pixi.spawn-polygon-mapped-to-point',
    );
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('collectPixiDiagnostics');
  });
  it('reports pixi.behaviors-partial (Skip) when a v5+ behaviors array is present', () => {
    const json = JSON.stringify({ ...JSON.parse(FIRE_PIXI), behaviors: [{ type: 'moveSpeed' }] });
    const crumb = parsePixiParticleDocument(json).diagnostics.find((d) => d.kind === 'pixi.behaviors-partial');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('collectPixiDiagnostics');
  });
});
