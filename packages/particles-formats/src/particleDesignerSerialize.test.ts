import { parseParticleDesignerPlist, parseParticleDesignerPlistDocument } from './particleDesignerParse';
import { serializeParticleDesignerPlist } from './particleDesignerSerialize';

const FIRE_PLIST = `<?xml version="1.0" encoding="utf-8"?>
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

describe('serializeParticleDesignerPlist', () => {
  it('produces valid plist XML with required structure', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const xml = serializeParticleDesignerPlist(config);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<plist version="1.0">');
    expect(xml).toContain('<dict>');
  });

  it('preserves textureFileName from existing document', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const { document } = parseParticleDesignerPlistDocument(FIRE_PLIST);
    expect(serializeParticleDesignerPlist(config, document)).toContain('fire.png');
  });

  it('round-trips key config fields through parse → serialize → parse', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST, { textureSize: 32 });
    const { document } = parseParticleDesignerPlistDocument(FIRE_PLIST, { textureSize: 32 });
    const xml = serializeParticleDesignerPlist(config, document, { textureSize: 32 });
    const config2 = parseParticleDesignerPlist(xml, { textureSize: 32 });
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.directionX).toBeCloseTo(config.directionX, 3);
    expect(config2.gravityY).toBeCloseTo(config.gravityY, 1);
  });

  it('escapes XML special characters in the texture filename', () => {
    const config = parseParticleDesignerPlist(FIRE_PLIST);
    const xml = serializeParticleDesignerPlist(config, { textureFileName: 'a&b<c>.png' });
    expect(xml).not.toContain('a&b<c>');
    expect(xml).toContain('&amp;');
  });
});
