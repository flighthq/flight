import { createParticleEmitterConfig } from './particleEmitterConfig';
import { writeParticleSpawnOffset } from './particleSpawnOffset';

describe('writeParticleSpawnOffset', () => {
  it('samples circle area and rectangle bounds with their existing draw order', () => {
    const out = [NaN, NaN];
    const samples = [0.25, 0, 0, 0.75];
    let index = 0;
    writeParticleSpawnOffset(
      out,
      0,
      createParticleEmitterConfig({ emitterRadius: 10, emitterShape: 'circle' }),
      () => samples[index++],
    );
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(0);
    writeParticleSpawnOffset(
      out,
      0,
      createParticleEmitterConfig({ emitterHeight: 10, emitterShape: 'rect', emitterWidth: 20 }),
      () => samples[index++],
    );
    expect(out).toEqual([-10, 2.5]);
  });

  it('samples the line from its inclusive left boundary', () => {
    const out = [NaN, NaN];
    writeParticleSpawnOffset(out, 0, createParticleEmitterConfig({ emitterShape: 'line', emitterWidth: 20 }), () => 0);
    expect(out).toEqual([-10, 0]);
  });

  it('samples the ring circumference', () => {
    const out = [NaN, NaN];
    writeParticleSpawnOffset(
      out,
      0,
      createParticleEmitterConfig({ emitterRadius: 10, emitterShape: 'ring' }),
      () => 0.25,
    );
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(10);
  });

  it.each([
    ['line', { emitterWidth: 0 }],
    ['ring', { emitterRadius: 0 }],
  ] as const)('writes the origin for a degenerate %s without drawing randomness', (emitterShape, size) => {
    const out = [NaN, NaN];
    let randomCalls = 0;
    writeParticleSpawnOffset(out, 0, createParticleEmitterConfig({ ...size, emitterShape }), () => {
      randomCalls++;
      return 0.5;
    });
    expect(out).toEqual([0, 0]);
    expect(randomCalls).toBe(0);
  });
});
