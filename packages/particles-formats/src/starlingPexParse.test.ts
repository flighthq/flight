import { ImportDiagnosticSeverity } from '@flighthq/types';

import { parseStarlingPex, parseStarlingPexDocument } from './starlingPexParse';

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

describe('parseStarlingPex', () => {
  it('returns a ParticleEmitterConfig (not a ParseResult object)', () => {
    const result = parseStarlingPex(FIRE_PEX_ATTR) as unknown as Record<string, unknown>;
    expect(typeof result.maxParticles).toBe('number');
    expect(result.document).toBeUndefined();
  });
  it('parses maxParticles from attribute-style PEX', () => {
    expect(parseStarlingPex(FIRE_PEX_ATTR).maxParticles).toBe(200);
  });
  it('converts lifetime with variance to min/max', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.lifetimeMin).toBeCloseTo(1.0);
    expect(c.lifetimeMax).toBeCloseTo(2.0);
  });
  it('converts speed with variance to min/max', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.speedMin).toBeCloseTo(80);
    expect(c.speedMax).toBeCloseTo(120);
  });
  it('maps angle=90 to upward direction (-Y screen)', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.directionX).toBeCloseTo(0, 3);
    expect(c.directionY).toBeCloseTo(-1, 3);
  });
  it('converts angleVariance to spread in radians', () => {
    expect(parseStarlingPex(FIRE_PEX_ATTR).spread).toBeCloseTo((30 * Math.PI) / 180, 4);
  });
  it('maps gravity directly', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.gravityX).toBeCloseTo(0);
    expect(c.gravityY).toBeCloseTo(200);
  });
  it('maps startColor/finishColor to colorStart/End', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.colorStartR).toBeCloseTo(1);
    expect(c.colorStartG).toBeCloseTo(0.5);
    expect(c.colorStartB).toBeCloseTo(0);
    expect(c.colorEndR).toBeCloseTo(1);
    expect(c.colorEndG).toBeCloseTo(0);
    expect(c.colorEndB).toBeCloseTo(0);
  });
  it('maps startColor.alpha / finishColor.alpha to alphaStart/End', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.alphaStart).toBeCloseTo(1);
    expect(c.alphaEnd).toBeCloseTo(0);
  });
  it('normalises scale by textureSize', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR, { textureSize: 32 });
    expect(c.scaleMin).toBeCloseTo(0.75);
    expect(c.scaleMax).toBeCloseTo(1.25);
  });
  it('maps normal blend func (770, 771) to blendMode="normal"', () => {
    expect(parseStarlingPex(FIRE_PEX_ATTR).blendMode).toBe('normal');
  });
  it('maps additive blend func (770, 1) to blendMode="add"', () => {
    const pex = FIRE_PEX_ATTR.replace('blendFuncDestination" value="771"', 'blendFuncDestination" value="1"');
    expect(parseStarlingPex(pex).blendMode).toBe('add');
  });
  it('maps duration=-1 to an infinite (looping) emitter', () => {
    const c = parseStarlingPex(FIRE_PEX_ATTR);
    expect(c.loop).toBe(true);
    expect(c.duration).toBe(0);
  });
  it('uses point emitter shape when sourcePositionVariance is zero', () => {
    expect(parseStarlingPex(FIRE_PEX_ATTR).emitterShape).toBe('point');
  });
  it('maps circle emitter shape when x=y variance', () => {
    const pex = FIRE_PEX_ATTR.replace(
      'sourcePositionVariancex" value="0"',
      'sourcePositionVariancex" value="20"',
    ).replace('sourcePositionVariancey" value="0"', 'sourcePositionVariancey" value="20"');
    const c = parseStarlingPex(pex);
    expect(c.emitterShape).toBe('circle');
    expect(c.emitterRadius).toBeCloseTo(20);
  });
  it('throws a clear error for non-XML input', () => {
    expect(() => parseStarlingPex('not xml')).toThrow(/Invalid Starling PEX/);
    expect(() => parseStarlingPex('{}')).toThrow(/Invalid Starling PEX/);
  });
});

describe('parseStarlingPexDocument', () => {
  it('returns the same config values as parseStarlingPex', () => {
    const config = parseStarlingPex(FIRE_PEX_ATTR, { textureSize: 32 });
    const { config: loaded } = parseStarlingPexDocument(FIRE_PEX_ATTR, { textureSize: 32 });
    expect(loaded.maxParticles).toBe(config.maxParticles);
    expect(loaded.directionY).toBeCloseTo(config.directionY, 5);
    expect(loaded.gravityY).toBeCloseTo(config.gravityY, 5);
  });
  it('preserves textureFileName in document', () => {
    expect(parseStarlingPexDocument(FIRE_PEX_ATTR).document.textureFileName).toBe('fire.png');
  });
  it('preserves blend function in document', () => {
    const { document } = parseStarlingPexDocument(FIRE_PEX_ATTR);
    expect(document.blendFuncSource).toBe(770);
    expect(document.blendFuncDestination).toBe(771);
  });
  it('has no warnings for a standard gravity emitter', () => {
    expect(parseStarlingPexDocument(FIRE_PEX_ATTR).diagnostics).toEqual([]);
  });
  it('reports starlingpex.radial-approximated (Recover) for a radial emitter', () => {
    const pex = FIRE_PEX_ATTR.replace('emitterType" value="0"', 'emitterType" value="1"');
    const crumb = parseStarlingPexDocument(pex).diagnostics.find((d) => d.kind === 'starlingpex.radial-approximated');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('collectStarlingPexDiagnostics');
  });
  it('reports starlingpex.radial-acceleration-unsupported (Skip)', () => {
    const pex = FIRE_PEX_ATTR.replace('radialAcceleration" value="0"', 'radialAcceleration" value="50"');
    const crumb = parseStarlingPexDocument(pex).diagnostics.find(
      (d) => d.kind === 'starlingpex.radial-acceleration-unsupported',
    );
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('collectStarlingPexDiagnostics');
  });
  it('reports starlingpex.tangential-acceleration-unsupported (Skip)', () => {
    const pex = FIRE_PEX_ATTR.replace('tangentialAcceleration" value="0"', 'tangentialAcceleration" value="50"');
    const crumb = parseStarlingPexDocument(pex).diagnostics.find(
      (d) => d.kind === 'starlingpex.tangential-acceleration-unsupported',
    );
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('collectStarlingPexDiagnostics');
  });
});
