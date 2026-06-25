import { createParticleEmitterConfig } from '@flighthq/particles';

import { parseStarlingPex, parseStarlingPexDocument } from './starlingPexParse';
import { serializeStarlingPex, serializeStarlingPexDocument } from './starlingPexSerialize';

// Attribute-style PEX (the canonical Sparrow/Starling variant)
const FIRE_PEX_ATTR = `<?xml version="1.0" encoding="utf-8"?>
<particleEmitterConfig>
  <attribute name="maxParticles" value="200"/>
  <attribute name="emitterType" value="0"/>
  <attribute name="duration" value="-1"/>
  <attribute name="particleLifespan" value="1.5"/>
  <attribute name="particleLifespanVariance" value="0.5"/>
  <attribute name="speed" value="100"/>
  <attribute name="speedVariance" value="20"/>
  <attribute name="angle" value="90"/>
  <attribute name="angleVariance" value="30"/>
  <attribute name="gravityx" value="0"/>
  <attribute name="gravityy" value="200"/>
  <attribute name="sourcePositionVariancex" value="0"/>
  <attribute name="sourcePositionVariancey" value="0"/>
  <attribute name="startParticleSize" value="32"/>
  <attribute name="startParticleSizeVariance" value="8"/>
  <attribute name="finishParticleSize" value="8"/>
  <attribute name="finishParticleSizeVariance" value="0"/>
  <attribute name="startColor" red="1" green="0.5" blue="0" alpha="1"/>
  <attribute name="startColorVariance" red="0" green="0" blue="0" alpha="0"/>
  <attribute name="finishColor" red="1" green="0" blue="0" alpha="0"/>
  <attribute name="finishColorVariance" red="0" green="0" blue="0" alpha="0"/>
  <attribute name="rotationStart" value="0"/>
  <attribute name="rotationStartVariance" value="0"/>
  <attribute name="rotationEnd" value="0"/>
  <attribute name="rotationEndVariance" value="0"/>
  <attribute name="maxRadius" value="0"/>
  <attribute name="maxRadiusVariance" value="0"/>
  <attribute name="minRadius" value="0"/>
  <attribute name="minRadiusVariance" value="0"/>
  <attribute name="rotatePerSecond" value="0"/>
  <attribute name="rotatePerSecondVariance" value="0"/>
  <attribute name="radialAcceleration" value="0"/>
  <attribute name="radialAccelVariance" value="0"/>
  <attribute name="tangentialAcceleration" value="0"/>
  <attribute name="tangentialAccelVariance" value="0"/>
  <attribute name="blendFuncSource" value="770"/>
  <attribute name="blendFuncDestination" value="771"/>
  <attribute name="textureFileName" value="fire.png"/>
</particleEmitterConfig>`;

describe('serializeStarlingPex', () => {
  it('round-trips key config fields', () => {
    const config = parseStarlingPex(FIRE_PEX_ATTR, { textureSize: 32 });
    const { document } = parseStarlingPexDocument(FIRE_PEX_ATTR, { textureSize: 32 });
    const xml = serializeStarlingPex(config, document, { textureSize: 32 });
    const config2 = parseStarlingPex(xml, { textureSize: 32 });
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.directionX).toBeCloseTo(config.directionX, 3);
    expect(config2.gravityY).toBeCloseTo(config.gravityY, 1);
    expect(config2.colorStartR).toBeCloseTo(config.colorStartR, 3);
    expect(config2.alphaEnd).toBeCloseTo(config.alphaEnd, 3);
  });
  it('preserves textureFileName in round-trip', () => {
    const config = parseStarlingPex(FIRE_PEX_ATTR);
    const { document } = parseStarlingPexDocument(FIRE_PEX_ATTR);
    expect(serializeStarlingPex(config, document)).toContain('fire.png');
  });
  it('produces valid XML with particleEmitterConfig root', () => {
    const config = parseStarlingPex(FIRE_PEX_ATTR);
    const xml = serializeStarlingPex(config);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<particleEmitterConfig>');
    expect(xml).toContain('</particleEmitterConfig>');
  });
  it('produces XML parseable by parseStarlingPex for a fresh config', () => {
    const config = createParticleEmitterConfig({ maxParticles: 50, blendMode: 'add' });
    const xml = serializeStarlingPex(config);
    const c2 = parseStarlingPex(xml);
    expect(c2.maxParticles).toBe(50);
    expect(c2.blendMode).toBe('add');
  });
  it('maps blendMode="normal" to blendFuncDestination 771', () => {
    const config = createParticleEmitterConfig({ blendMode: 'normal' });
    const xml = serializeStarlingPex(config);
    expect(xml).toContain('blendFuncDestination" value="771"');
  });
  it('maps blendMode="add" to blendFuncDestination 1', () => {
    const config = createParticleEmitterConfig({ blendMode: 'add' });
    const xml = serializeStarlingPex(config);
    expect(xml).toContain('blendFuncDestination" value="1"');
  });
});

describe('serializeStarlingPexDocument', () => {
  it('returns text and empty warnings for a default config', () => {
    const config = createParticleEmitterConfig();
    const result = serializeStarlingPexDocument(config);
    expect(typeof result.text).toBe('string');
    expect(result.text).toContain('<particleEmitterConfig>');
    expect(result.warnings).toEqual([]);
  });
  it('warns when multiply/screen blend mode cannot be represented', () => {
    const config = createParticleEmitterConfig({ blendMode: 'multiply' });
    const result = serializeStarlingPexDocument(config);
    expect(result.warnings.some((w) => w.toLowerCase().includes('multiply'))).toBe(true);
  });
  it('warns when config has emission bursts', () => {
    const config = createParticleEmitterConfig({ burstCount: 5 });
    const result = serializeStarlingPexDocument(config);
    expect(result.warnings.some((w) => w.toLowerCase().includes('burst'))).toBe(true);
  });
  it('has no warnings for add blend mode (supported)', () => {
    const config = createParticleEmitterConfig({ blendMode: 'add' });
    const result = serializeStarlingPexDocument(config);
    expect(result.warnings.filter((w) => w.toLowerCase().includes('blend'))).toEqual([]);
  });
});
