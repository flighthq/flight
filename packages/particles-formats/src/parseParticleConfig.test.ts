import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types';

import { parseParticleConfig, parseParticleConfigDocument } from './parseParticleConfig';

const PLIST_SNIPPET = `<?xml version="1.0" encoding="utf-8"?>
<plist version="1.0">
<dict>
  <key>maxParticles</key><integer>150</integer>
  <key>emitterType</key><integer>0</integer>
  <key>duration</key><real>-1</real>
  <key>particleLifespan</key><real>1.0</real>
  <key>particleLifespanVariance</key><real>0.0</real>
  <key>speed</key><real>100</real>
  <key>speedVariance</key><real>0</real>
  <key>angle</key><real>90</real>
  <key>angleVariance</key><real>0</real>
  <key>gravityx</key><real>0</real>
  <key>gravityy</key><real>0</real>
  <key>sourcePositionVariancex</key><real>0</real>
  <key>sourcePositionVariancey</key><real>0</real>
  <key>startParticleSize</key><real>16</real>
  <key>startParticleSizeVariance</key><real>0</real>
  <key>finishParticleSize</key><real>8</real>
  <key>finishParticleSizeVariance</key><real>0</real>
  <key>startColorRed</key><real>1</real>
  <key>startColorGreen</key><real>1</real>
  <key>startColorBlue</key><real>1</real>
  <key>startColorAlpha</key><real>1</real>
  <key>startColorVarianceRed</key><real>0</real>
  <key>startColorVarianceGreen</key><real>0</real>
  <key>startColorVarianceBlue</key><real>0</real>
  <key>startColorVarianceAlpha</key><real>0</real>
  <key>finishColorRed</key><real>1</real>
  <key>finishColorGreen</key><real>1</real>
  <key>finishColorBlue</key><real>1</real>
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
  <key>textureFileName</key><string>test.png</string>
</dict>
</plist>`;
const SPINE_JSON = JSON.stringify({
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
const LIBGDX_SNIPPET = `Particle Effect
- Spark -
maxParticleCount: 75
additive: false
imagePath: fire.png

Delay
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Duration
lowMin: 2000
lowMax: 2000
highMin: 2000
highMax: 2000
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Emission
lowMin: 0
lowMax: 0
highMin: 50
highMax: 50
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Life
lowMin: 500
lowMax: 500
highMin: 1000
highMax: 1000
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Life Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

X Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Y Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Spawn Shape
shape: point

Spawn Width
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Spawn Height
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Scale
lowMin: 16
lowMax: 16
highMin: 16
highMax: 16
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Velocity
active: true
lowMin: 100
lowMax: 100
highMin: 100
highMax: 100
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Angle
active: false
lowMin: 0
lowMax: 0
highMin: 360
highMax: 360
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Rotation
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Wind
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Gravity
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Tint
colors: ffffff
timelineCount: 1
timeline0: 0

Transparency
lowMin: 0
lowMax: 0
highMin: 1
highMax: 1
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

`;
const PIXI_JSON = JSON.stringify({
  pos: { x: 0, y: 0 },
  alpha: { start: 1, end: 0 },
  speed: { start: 100, end: 50 },
  lifetime: { min: 0.5, max: 1.5 },
  maxParticles: 600,
  frequency: 0.01,
  blendMode: 'add',
});
const STARLING_PEX_SNIPPET = `<?xml version="1.0" encoding="utf-8"?>
<particleEmitterConfig>
  <attribute name="maxParticles" value="250"/>
  <attribute name="emitterType" value="0"/>
  <attribute name="duration" value="-1"/>
  <attribute name="particleLifespan" value="1.0"/>
  <attribute name="particleLifespanVariance" value="0.0"/>
  <attribute name="speed" value="80"/>
  <attribute name="speedVariance" value="0"/>
  <attribute name="angle" value="90"/>
  <attribute name="angleVariance" value="0"/>
  <attribute name="gravityx" value="0"/>
  <attribute name="gravityy" value="0"/>
  <attribute name="sourcePositionVariancex" value="0"/>
  <attribute name="sourcePositionVariancey" value="0"/>
  <attribute name="startParticleSize" value="16"/>
  <attribute name="startParticleSizeVariance" value="0"/>
  <attribute name="finishParticleSize" value="8"/>
  <attribute name="finishParticleSizeVariance" value="0"/>
  <attribute name="startColor" red="1" green="1" blue="1" alpha="1"/>
  <attribute name="startColorVariance" red="0" green="0" blue="0" alpha="0"/>
  <attribute name="finishColor" red="1" green="1" blue="1" alpha="0"/>
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
  <attribute name="blendFuncDestination" value="1"/>
</particleEmitterConfig>`;
const UNITY_JSON = JSON.stringify({
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

describe('parseParticleConfig', () => {
  it('parses libGDX .p format', () => {
    const config = parseParticleConfig(LIBGDX_SNIPPET);
    expect(config.maxParticles).toBe(75);
  });
  it('parses Particle Designer plist', () => {
    const config = parseParticleConfig(PLIST_SNIPPET);
    expect(config.maxParticles).toBe(150);
  });
  it('parses Pixi particle JSON', () => {
    const config = parseParticleConfig(PIXI_JSON);
    expect(config.maxParticles).toBe(600);
  });
  it('parses Spine JSON', () => {
    const config = parseParticleConfig(SPINE_JSON);
    expect(config.maxParticles).toBe(300);
  });
  it('parses Starling PEX XML', () => {
    const config = parseParticleConfig(STARLING_PEX_SNIPPET);
    expect(config.maxParticles).toBe(250);
  });
  it('parses Unity JSON', () => {
    const config = parseParticleConfig(UNITY_JSON);
    expect(config.maxParticles).toBe(500);
  });
  it('returns a default config for unknown input without throwing', () => {
    const config = parseParticleConfig('not a particle file');
    expect(typeof config.maxParticles).toBe('number');
    expect(Number.isFinite(config.maxParticles)).toBe(true);
  });
  it('returns a default config for empty string without throwing', () => {
    expect(() => parseParticleConfig('')).not.toThrow();
  });
});

describe('parseParticleConfigDocument', () => {
  it('returns libGDX format kind for .p format', () => {
    const result = parseParticleConfigDocument(LIBGDX_SNIPPET);
    expect(result.format).toBe(LibgdxParticleFormatKind);
    expect(result.config.maxParticles).toBe(75);
  });
  it('returns ParticleDesigner format kind for plist', () => {
    const result = parseParticleConfigDocument(PLIST_SNIPPET);
    expect(result.format).toBe(ParticleDesignerFormatKind);
    expect(result.config.maxParticles).toBe(150);
    expect(result.warnings).toEqual([]);
  });
  it('returns Pixi format kind for Pixi JSON', () => {
    const result = parseParticleConfigDocument(PIXI_JSON);
    expect(result.format).toBe(PixiParticleFormatKind);
    expect(result.config.maxParticles).toBe(600);
  });
  it('returns Spine format kind for Spine JSON', () => {
    const result = parseParticleConfigDocument(SPINE_JSON);
    expect(result.format).toBe(SpineParticleFormatKind);
    expect(result.config.maxParticles).toBe(300);
  });
  it('returns Starling PEX format kind for PEX XML', () => {
    const result = parseParticleConfigDocument(STARLING_PEX_SNIPPET);
    expect(result.format).toBe(StarlingPexFormatKind);
    expect(result.config.maxParticles).toBe(250);
    expect(result.config.blendMode).toBe('add');
  });
  it('returns Unity format kind for Unity JSON', () => {
    const result = parseParticleConfigDocument(UNITY_JSON);
    expect(result.format).toBe(UnityParticleFormatKind);
    expect(result.config.maxParticles).toBe(500);
  });
  it('returns null format and unknown-format warning for unrecognised input', () => {
    const result = parseParticleConfigDocument('totally unknown content');
    expect(result.format).toBeNull();
    expect(result.warnings.some((w) => w.includes('unknown-format'))).toBe(true);
  });
  it('returns null format for empty string', () => {
    const result = parseParticleConfigDocument('');
    expect(result.format).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('does not throw for malformed JSON that passes detection', () => {
    // A JSON object with Unity-ish keys but truncated
    const truncated = '{ "gravityModifier": 0.5, "looping"';
    expect(() => parseParticleConfigDocument(truncated)).not.toThrow();
  });
});
