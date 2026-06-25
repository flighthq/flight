import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types';

import { detectParticleFormat } from './detect';

const PLIST_SNIPPET = `<?xml version="1.0" encoding="utf-8"?>
<plist version="1.0">
<dict>
  <key>maxParticles</key><integer>200</integer>
</dict>
</plist>`;
const SPINE_JSON = JSON.stringify({
  name: 'spark',
  continuous: true,
  emission: { low: 10, high: 30 },
  life: { low: 500, high: 1500 },
});
const UNITY_JSON = JSON.stringify({
  name: 'smoke',
  looping: true,
  startLifetime: { mode: 'twoConstants', constantMin: 1.0, constantMax: 2.5 },
  gravityModifier: 0.1,
});
const LIBGDX_SNIPPET = `Particle Effect
- Spark -
maxParticleCount: 50
additive: true
`;
const STARLING_PEX_SNIPPET = `<?xml version="1.0" encoding="utf-8"?>
<particleEmitterConfig>
  <attribute name="maxParticles" value="200"/>
</particleEmitterConfig>`;
const PIXI_JSON = JSON.stringify({
  pos: { x: 0, y: 0 },
  alpha: { start: 1, end: 0 },
  speed: { start: 100, end: 50 },
  lifetime: { min: 0.5, max: 1.5 },
  maxParticles: 500,
});

describe('detectParticleFormat', () => {
  it('detects libGDX .p by "Particle Effect" first line', () => {
    expect(detectParticleFormat(LIBGDX_SNIPPET)).toBe(LibgdxParticleFormatKind);
  });
  it('detects libGDX .p with leading whitespace before Particle Effect', () => {
    expect(detectParticleFormat('  \nParticle Effect\n- Emitter -\n')).toBe(LibgdxParticleFormatKind);
  });
  it('detects Particle Designer plist by <plist tag', () => {
    expect(detectParticleFormat(PLIST_SNIPPET)).toBe(ParticleDesignerFormatKind);
  });
  it('detects Particle Designer plist with leading whitespace', () => {
    expect(detectParticleFormat('  \n' + PLIST_SNIPPET)).toBe(ParticleDesignerFormatKind);
  });
  it('detects Pixi particle JSON by pos + alpha.start/end fields', () => {
    expect(detectParticleFormat(PIXI_JSON)).toBe(PixiParticleFormatKind);
  });
  it('detects Spine JSON by continuous boolean', () => {
    expect(detectParticleFormat(SPINE_JSON)).toBe(SpineParticleFormatKind);
  });
  it('detects Spine JSON by emission range object', () => {
    const json = JSON.stringify({ emission: { low: 10, high: 30 }, life: { low: 500, high: 1500 } });
    expect(detectParticleFormat(json)).toBe(SpineParticleFormatKind);
  });
  it('detects Starling PEX by <particleEmitterConfig root element', () => {
    expect(detectParticleFormat(STARLING_PEX_SNIPPET)).toBe(StarlingPexFormatKind);
  });
  it('detects Unity JSON by startLifetime mode field', () => {
    expect(detectParticleFormat(UNITY_JSON)).toBe(UnityParticleFormatKind);
  });
  it('detects Unity JSON by gravityModifier', () => {
    const json = JSON.stringify({ gravityModifier: 0.5 });
    expect(detectParticleFormat(json)).toBe(UnityParticleFormatKind);
  });
  it('detects Unity JSON by looping + startLifetime', () => {
    const json = JSON.stringify({ looping: true, startLifetime: { mode: 'constant', constant: 1 } });
    expect(detectParticleFormat(json)).toBe(UnityParticleFormatKind);
  });
  it('returns null for garbage input', () => {
    expect(detectParticleFormat('not a particle file at all')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(detectParticleFormat('')).toBeNull();
  });
  it('returns null for valid JSON that matches no format', () => {
    expect(detectParticleFormat(JSON.stringify({ foo: 'bar', baz: 42 }))).toBeNull();
  });
  it('returns null for a JSON array', () => {
    expect(detectParticleFormat(JSON.stringify([1, 2, 3]))).toBeNull();
  });
  it('returns null for XML that is not a plist or PEX', () => {
    expect(detectParticleFormat('<svg width="100"><circle/></svg>')).toBeNull();
  });
});
