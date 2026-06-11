import { loadParticleDesignerPlist, parseParticleDesignerPlist } from './parse';
import { serializeParticleDesignerPlist } from './serialize';

const FIRE_PLIST = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>maxParticles</key><integer>200</integer>
  <key>emitterType</key><integer>0</integer>
  <key>duration</key><real>-1</real>
  <key>particleLifespan</key><real>1.5</real>
  <key>particleLifespanVariance</key><real>0.5</real>
  <key>speed</key><real>100</real>
  <key>speedVariance</key><real>20</real>
  <key>angle</key><real>90</real>
  <key>angleVariance</key><real>30</real>
  <key>gravityx</key><real>0</real>
  <key>gravityy</key><real>200</real>
  <key>sourcePositionVariancex</key><real>0</real>
  <key>sourcePositionVariancey</key><real>0</real>
  <key>startParticleSize</key><real>32</real>
  <key>startParticleSizeVariance</key><real>8</real>
  <key>finishParticleSize</key><real>8</real>
  <key>finishParticleSizeVariance</key><real>0</real>
  <key>startColorRed</key><real>1</real>
  <key>startColorGreen</key><real>0.5</real>
  <key>startColorBlue</key><real>0</real>
  <key>startColorAlpha</key><real>1</real>
  <key>startColorVarianceRed</key><real>0</real>
  <key>startColorVarianceGreen</key><real>0</real>
  <key>startColorVarianceBlue</key><real>0</real>
  <key>startColorVarianceAlpha</key><real>0</real>
  <key>finishColorRed</key><real>1</real>
  <key>finishColorGreen</key><real>0</real>
  <key>finishColorBlue</key><real>0</real>
  <key>finishColorAlpha</key><real>0</real>
  <key>finishColorVarianceRed</key><real>0</real>
  <key>finishColorVarianceGreen</key><real>0</real>
  <key>finishColorVarianceBlue</key><real>0</real>
  <key>finishColorVarianceAlpha</key><real>0</real>
  <key>rotationStart</key><real>0</real>
  <key>rotationStartVariance</key><real>0</real>
  <key>rotationEnd</key><real>0</real>
  <key>rotationEndVariance</key><real>0</real>
  <key>maxRadius</key><real>0</real>
  <key>maxRadiusVariance</key><real>0</real>
  <key>minRadius</key><real>0</real>
  <key>minRadiusVariance</key><real>0</real>
  <key>rotatePerSecond</key><real>0</real>
  <key>rotatePerSecondVariance</key><real>0</real>
  <key>blendFuncSource</key><integer>770</integer>
  <key>blendFuncDestination</key><integer>771</integer>
  <key>textureFileName</key><string>fire.png</string>
</dict>
</plist>`;

describe('loadParticleDesignerPlist — full round-trip, returns { config, document }', () => {
  it('returns the same config values as parseParticleDesignerPlist', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    const { config: loadedConfig } = loadParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    expect(loadedConfig.maxParticles).toBe(config.maxParticles);
    expect(loadedConfig.directionY).toBeCloseTo(config.directionY, 5);
    expect(loadedConfig.gravityY).toBeCloseTo(config.gravityY, 5);
  });

  it('preserves textureFileName in document', () => {
    expect(loadParticleDesignerPlist(FIRE_PLIST).document.textureFileName).toBe('fire.png');
  });

  it('preserves blend function in document', () => {
    const { document } = loadParticleDesignerPlist(FIRE_PLIST);
    expect(document.blendFuncSource).toBe(770);
    expect(document.blendFuncDestination).toBe(771);
  });
});

describe('parseParticleDesignerPlist — color variance and blend mode', () => {
  it('maps startColorVariance fields to colorStartVariance', () => {
    const plist = FIRE_PLIST.replace(
      '<key>startColorVarianceRed</key><real>0</real>',
      '<key>startColorVarianceRed</key><real>0.3</real>',
    );
    const c = parseParticleDesignerPlist(plist);
    expect(c.colorStartVarianceR).toBeCloseTo(0.3);
  });

  it('maps additive blend func (770, 1) to blendMode="add"', () => {
    const plist = FIRE_PLIST.replace(
      '<key>blendFuncDestination</key><integer>771</integer>',
      '<key>blendFuncDestination</key><integer>1</integer>',
    );
    const c = parseParticleDesignerPlist(plist);
    expect(c.blendMode).toBe('add');
  });

  it('round-trips color variance through serialize', () => {
    const modified = FIRE_PLIST.replace(
      '<key>startColorVarianceGreen</key><real>0</real>',
      '<key>startColorVarianceGreen</key><real>0.2</real>',
    );
    const config = parseParticleDesignerPlist(modified);
    const { document } = loadParticleDesignerPlist(modified);
    const xml = serializeParticleDesignerPlist(config, document);
    const config2 = parseParticleDesignerPlist(xml);
    expect(config2.colorStartVarianceG).toBeCloseTo(0.2, 3);
  });
});

describe('parseParticleDesignerPlist — lightweight, returns config directly', () => {
  it('returns a ParticleEmitterConfig (not a Parsed object)', () => {
    const result = parseParticleDesignerPlist(FIRE_PLIST);
    expect(typeof result.maxParticles).toBe('number');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses maxParticles', () => {
    expect(parseParticleDesignerPlist(FIRE_PLIST).maxParticles).toBe(200);
  });

  it('converts lifetime with variance to min/max', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.lifetimeMin).toBeCloseTo(1.0);
    expect(c.lifetimeMax).toBeCloseTo(2.0);
  });

  it('converts speed with variance to min/max', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.speedMin).toBeCloseTo(80);
    expect(c.speedMax).toBeCloseTo(120);
  });

  it('maps angle=90 to upward direction (−Y screen)', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.directionX).toBeCloseTo(0, 3);
    expect(c.directionY).toBeCloseTo(-1, 3);
  });

  it('converts angleVariance to spread in radians', () => {
    expect(parseParticleDesignerPlist(FIRE_PLIST).spread).toBeCloseTo((30 * Math.PI) / 180, 4);
  });

  it('maps gravity directly', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.gravityX).toBeCloseTo(0);
    expect(c.gravityY).toBeCloseTo(200);
  });

  it('maps color start and end', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.colorStartR).toBeCloseTo(1);
    expect(c.colorStartG).toBeCloseTo(0.5);
    expect(c.colorStartB).toBeCloseTo(0);
    expect(c.colorEndR).toBeCloseTo(1);
    expect(c.colorEndG).toBeCloseTo(0);
    expect(c.colorEndB).toBeCloseTo(0);
  });

  it('maps alpha start and end', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.alphaStart).toBeCloseTo(1);
    expect(c.alphaEnd).toBeCloseTo(0);
  });

  it('normalises scale by textureSize', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    expect(c.scaleMin).toBeCloseTo(0.75);
    expect(c.scaleMax).toBeCloseTo(1.25);
  });

  it('computes scaleEnd as finishSize / startSize', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    expect(c.scaleEnd).toBeCloseTo(0.25);
  });

  it('uses point emitter shape when sourcePositionVariance is zero', () => {
    expect(parseParticleDesignerPlist(FIRE_PLIST).emitterShape).toBe('point');
  });

  it('maps duration=-1 to an infinite (looping) emitter', () => {
    const c = parseParticleDesignerPlist(FIRE_PLIST);
    expect(c.loop).toBe(true);
    expect(c.duration).toBe(0);
  });

  it('maps a positive duration to a finite, non-looping emitter', () => {
    const plist = FIRE_PLIST.replace('<key>duration</key><real>-1</real>', '<key>duration</key><real>2.5</real>');
    const c = parseParticleDesignerPlist(plist);
    expect(c.loop).toBe(false);
    expect(c.duration).toBeCloseTo(2.5);
  });
});

describe('parseParticleDesignerPlist — malformed input', () => {
  it('falls back to defaults (not NaN) for empty numeric tags', () => {
    const xml =
      '<plist><dict>' +
      '<key>maxParticles</key><integer></integer>' +
      '<key>speed</key><real></real>' +
      '</dict></plist>';
    const c = parseParticleDesignerPlist(xml);
    expect(c.maxParticles).toBe(200); // default, not NaN-coerced 0
    expect(Number.isFinite(c.speedMin)).toBe(true);
    expect(Number.isFinite(c.speedMax)).toBe(true);
  });

  it('returns an all-defaults config for empty/garbage input without throwing', () => {
    expect(() => parseParticleDesignerPlist('')).not.toThrow();
    const c = parseParticleDesignerPlist('not xml at all');
    expect(Number.isFinite(c.maxParticles)).toBe(true);
    expect(Number.isFinite(c.gravityY)).toBe(true);
  });
});

describe('serializeParticleDesignerPlist', () => {
  it('round-trips key config fields', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    const { document } = loadParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    const xml = serializeParticleDesignerPlist(config, document, { textureSize: 32 });
    const config2 = parseParticleDesignerPlist(xml, { textureSize: 32 });
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.directionX).toBeCloseTo(config.directionX, 3);
    expect(config2.gravityY).toBeCloseTo(config.gravityY, 1);
    expect(config2.colorStartR).toBeCloseTo(config.colorStartR, 3);
    expect(config2.alphaEnd).toBeCloseTo(config.alphaEnd, 3);
  });

  it('preserves textureFileName', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const { document } = loadParticleDesignerPlist(FIRE_PLIST);
    expect(serializeParticleDesignerPlist(config, document)).toContain('fire.png');
  });

  it('produces valid plist XML', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const xml = serializeParticleDesignerPlist(config);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<plist version="1.0">');
  });

  it('escapes XML special characters in the texture filename and round-trips them', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const xml = serializeParticleDesignerPlist(config, { textureFileName: 'a&b<c>.png' });
    // Raw special characters must not appear unescaped (would be invalid XML).
    expect(xml).not.toContain('a&b<c>');
    expect(xml).toContain('&amp;');
    // ...and the original value survives a parse round-trip intact.
    expect(loadParticleDesignerPlist(xml).document.textureFileName).toBe('a&b<c>.png');
  });
});
