import { createParticleEmitterConfig } from '@flighthq/particles';

import { parseLibgdxParticle, parseLibgdxParticleDocument } from './libgdxParse';
import { serializeLibgdxParticle, serializeLibgdxParticleDocument } from './libgdxSerialize';

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

describe('serializeLibgdxParticle', () => {
  it('round-trips key config fields', () => {
    const config = parseLibgdxParticle(SPARK_P);
    const { document } = parseLibgdxParticleDocument(SPARK_P);
    const text = serializeLibgdxParticle(config, document);
    const config2 = parseLibgdxParticle(text);
    expect(config2.maxParticles).toBe(config.maxParticles);
    expect(config2.speedMin).toBeCloseTo(config.speedMin, 1);
    expect(config2.speedMax).toBeCloseTo(config.speedMax, 1);
    expect(config2.lifetimeMin).toBeCloseTo(config.lifetimeMin, 2);
    expect(config2.lifetimeMax).toBeCloseTo(config.lifetimeMax, 2);
  });
  it('preserves imagePath in round-trip', () => {
    const config = parseLibgdxParticle(SPARK_P);
    const { document } = parseLibgdxParticleDocument(SPARK_P);
    const text = serializeLibgdxParticle(config, document);
    expect(parseLibgdxParticleDocument(text).document.imagePath).toBe('spark.png');
  });
  it('produces text readable by parseLibgdxParticle for a fresh config', () => {
    const config = createParticleEmitterConfig({ maxParticles: 50, blendMode: 'add' });
    const text = serializeLibgdxParticle(config);
    const c2 = parseLibgdxParticle(text);
    expect(c2.maxParticles).toBe(50);
    expect(c2.blendMode).toBe('add');
  });
  it('maps blendMode="add" to additive=true', () => {
    const config = createParticleEmitterConfig({ blendMode: 'add' });
    const text = serializeLibgdxParticle(config);
    expect(text).toContain('additive: true');
  });
  it('maps blendMode="normal" to additive=false', () => {
    const config = createParticleEmitterConfig({ blendMode: 'normal' });
    const text = serializeLibgdxParticle(config);
    expect(text).toContain('additive: false');
  });
});

describe('serializeLibgdxParticleDocument', () => {
  it('returns text and empty warnings for a default config', () => {
    const config = createParticleEmitterConfig();
    const result = serializeLibgdxParticleDocument(config);
    expect(typeof result.text).toBe('string');
    expect(result.text).toContain('Particle Effect');
    expect(result.warnings).toEqual([]);
  });
  it('warns when multiply/screen blend mode cannot be represented', () => {
    const config = createParticleEmitterConfig({ blendMode: 'multiply' });
    const result = serializeLibgdxParticleDocument(config);
    expect(result.warnings.some((w) => w.toLowerCase().includes('multiply'))).toBe(true);
  });
  it('warns when config has emission bursts', () => {
    const config = createParticleEmitterConfig({ burstCount: 5 });
    const result = serializeLibgdxParticleDocument(config);
    expect(result.warnings.some((w) => w.toLowerCase().includes('burst'))).toBe(true);
  });
  it('warns when config has color start variance', () => {
    const config = createParticleEmitterConfig({ colorStartVarianceR: 0.1 });
    const result = serializeLibgdxParticleDocument(config);
    expect(result.warnings.some((w) => w.includes('colorStartVariance'))).toBe(true);
  });
  it('has no warnings for add blend mode (supported)', () => {
    const config = createParticleEmitterConfig({ blendMode: 'add' });
    const result = serializeLibgdxParticleDocument(config);
    expect(result.warnings.filter((w) => w.toLowerCase().includes('blend'))).toEqual([]);
  });
});
