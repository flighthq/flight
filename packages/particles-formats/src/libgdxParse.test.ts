import { parseLibgdxParticle, parseLibgdxParticleDocument } from './libgdxParse';

const SPARK_P = `Particle Effect
- Spark -
minParticleCount: 4
maxParticleCount: 100
additive: true
imagePath: spark.png
imageCount: 1

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
lowMin: 3000
lowMax: 3000
highMin: 3000
highMax: 3000
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Emission
lowMin: 0
lowMax: 0
highMin: 80
highMax: 120
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Life
lowMin: 400
lowMax: 400
highMin: 800
highMax: 800
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
highMin: 32
highMax: 32
relative: false
scalingCount: 2
scaling0: 1
scaling1: 0.25
timelineCount: 2
timeline0: 0
timeline1: 1

Velocity
active: true
lowMin: 50
lowMax: 50
highMin: 200
highMax: 200
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Angle
active: true
lowMin: 60
lowMax: 60
highMin: 120
highMax: 120
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
colors: ffaa00,ff0000
timelineCount: 2
timeline0: 0
timeline1: 1

Transparency
lowMin: 0
lowMax: 0
highMin: 1
highMax: 1
relative: false
scalingCount: 2
scaling0: 1
scaling1: 0
timelineCount: 2
timeline0: 0
timeline1: 1

`;

describe('parseLibgdxParticle', () => {
  it('parses maxParticleCount to maxParticles', () => {
    expect(parseLibgdxParticle(SPARK_P).maxParticles).toBe(100);
  });
  it('maps additive=true to blendMode="add"', () => {
    expect(parseLibgdxParticle(SPARK_P).blendMode).toBe('add');
  });
  it('converts life range from ms to seconds', () => {
    const c = parseLibgdxParticle(SPARK_P);
    expect(c.lifetimeMin).toBeCloseTo(0.4);
    expect(c.lifetimeMax).toBeCloseTo(0.8);
  });
  it('maps velocity to speedMin/Max', () => {
    const c = parseLibgdxParticle(SPARK_P);
    expect(c.speedMin).toBeCloseTo(50);
    expect(c.speedMax).toBeCloseTo(200);
  });
  it('derives direction from angle midpoint and spread from range', () => {
    const c = parseLibgdxParticle(SPARK_P);
    // angle range 60..120 -> mid=90 degrees -> directionX=0, directionY=-1
    expect(c.directionX).toBeCloseTo(0, 2);
    expect(c.directionY).toBeCloseTo(-1, 2);
    // spread = half of 60 degrees
    expect(c.spread).toBeCloseTo((30 * Math.PI) / 180, 3);
  });
  it('maps tint colors to colorStart/End', () => {
    const c = parseLibgdxParticle(SPARK_P);
    expect(c.colorStartR).toBeCloseTo(1);
    expect(c.colorStartG).toBeCloseTo(0xaa / 255, 2);
    expect(c.colorEndR).toBeCloseTo(1);
    expect(c.colorEndG).toBeCloseTo(0);
  });
  it('maps transparency scaling to alphaStart/End', () => {
    const c = parseLibgdxParticle(SPARK_P);
    expect(c.alphaStart).toBeCloseTo(1);
    expect(c.alphaEnd).toBeCloseTo(0);
  });
  it('uses point emitter shape when spawn shape is point', () => {
    expect(parseLibgdxParticle(SPARK_P).emitterShape).toBe('point');
  });
  it('normalises scale by textureSize', () => {
    const c = parseLibgdxParticle(SPARK_P, { textureSize: 32 });
    expect(c.scaleMin).toBeCloseTo(0.5);
    expect(c.scaleMax).toBeCloseTo(1.0);
  });
  it('reads last scale scaling value as scaleEnd', () => {
    // scaling[1] = 0.25 -> scaleEnd
    expect(parseLibgdxParticle(SPARK_P).scaleEnd).toBeCloseTo(0.25);
  });
  it('maps duration > 0 to a finite non-looping emitter', () => {
    const c = parseLibgdxParticle(SPARK_P);
    expect(c.loop).toBe(false);
    expect(c.duration).toBeCloseTo(3);
  });
  it('maps additive=false to blendMode="normal"', () => {
    const text = SPARK_P.replace('additive: true', 'additive: false');
    expect(parseLibgdxParticle(text).blendMode).toBe('normal');
  });
  it('throws a clear error for empty input', () => {
    expect(() => parseLibgdxParticle('')).toThrow(/Invalid libGDX particle/);
    expect(() => parseLibgdxParticle('   ')).toThrow(/Invalid libGDX particle/);
  });
  it('returns a ParticleEmitterConfig (not a ParseResult object)', () => {
    const result = parseLibgdxParticle(SPARK_P) as unknown as Record<string, unknown>;
    expect(typeof result.maxParticles).toBe('number');
    expect(result.document).toBeUndefined();
  });
});

describe('parseLibgdxParticleDocument', () => {
  it('returns the same config values as parseLibgdxParticle', () => {
    const config = parseLibgdxParticle(SPARK_P);
    const { config: loaded } = parseLibgdxParticleDocument(SPARK_P);
    expect(loaded.maxParticles).toBe(config.maxParticles);
    expect(loaded.speedMax).toBeCloseTo(config.speedMax, 3);
  });
  it('preserves emitter name in document', () => {
    const { document } = parseLibgdxParticleDocument(SPARK_P);
    expect(document.name).toBe('Spark');
  });
  it('preserves imagePath in document', () => {
    const { document } = parseLibgdxParticleDocument(SPARK_P);
    expect(document.imagePath).toBe('spark.png');
  });
  it('has no warnings for a standard point emitter', () => {
    const { warnings } = parseLibgdxParticleDocument(SPARK_P);
    expect(warnings).toEqual([]);
  });
  it('warns when delay is active', () => {
    const text = SPARK_P.replace('Delay\nactive: false', 'Delay\nactive: true');
    const { warnings } = parseLibgdxParticleDocument(text);
    expect(warnings.some((w) => w.includes('delay'))).toBe(true);
  });
  it('warns when spawn shape is line (no mapping)', () => {
    const text = SPARK_P.replace('shape: point', 'shape: line');
    const { warnings } = parseLibgdxParticleDocument(text);
    expect(warnings.some((w) => w.includes('line'))).toBe(true);
  });
});
