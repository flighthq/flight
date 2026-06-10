import { createParticleEmitterConfig } from './particleEmitterConfig';

describe('createParticleEmitterConfig', () => {
  it('returns defaults when called with no arguments', () => {
    const config = createParticleEmitterConfig();
    expect(config.alphaEnd).toBe(0);
    expect(config.alphaStart).toBe(1);
    expect(config.directionX).toBe(0);
    expect(config.directionY).toBe(-1);
    expect(config.gravityX).toBe(0);
    expect(config.gravityY).toBe(0);
    expect(config.lifetimeMax).toBe(1);
    expect(config.lifetimeMin).toBe(0.5);
    expect(config.maxParticles).toBe(1000);
    expect(config.regionIdMax).toBe(1);
    expect(config.regionIdMin).toBe(0);
    expect(config.scaleMax).toBe(1);
    expect(config.scaleMin).toBe(1);
    expect(config.speedMax).toBe(100);
    expect(config.speedMin).toBe(50);
    expect(config.spawnRate).toBe(10);
    expect(config.spread).toBe(Math.PI);
  });

  it('overrides individual fields', () => {
    const config = createParticleEmitterConfig({ spawnRate: 60, maxParticles: 500 });
    expect(config.spawnRate).toBe(60);
    expect(config.maxParticles).toBe(500);
    expect(config.alphaEnd).toBe(0); // other fields still default
  });

  it('returns a new object each call', () => {
    const a = createParticleEmitterConfig();
    const b = createParticleEmitterConfig();
    expect(a).not.toBe(b);
  });
});
