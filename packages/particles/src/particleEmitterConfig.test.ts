import { createParticleEmitterConfig } from './particleEmitterConfig';

describe('createParticleEmitterConfig', () => {
  it('returns defaults when called with no arguments', () => {
    const config = createParticleEmitterConfig();
    expect(config.alphaEnd).toBe(0);
    expect(config.alphaStart).toBe(1);
    expect(config.burstCount).toBe(0);
    expect(config.burstInterval).toBe(0);
    expect(config.duration).toBe(0);
    expect(config.loop).toBe(true);
    expect(config.colorEndR).toBe(1);
    expect(config.colorEndG).toBe(1);
    expect(config.colorEndB).toBe(1);
    expect(config.colorStartR).toBe(1);
    expect(config.colorStartG).toBe(1);
    expect(config.colorStartB).toBe(1);
    expect(config.directionX).toBe(0);
    expect(config.directionY).toBe(-1);
    expect(config.emitterShape).toBe('point');
    expect(config.emitterRadius).toBe(0);
    expect(config.emitterWidth).toBe(0);
    expect(config.emitterHeight).toBe(0);
    expect(config.frameCount).toBe(1);
    expect(config.frameRate).toBe(12);
    expect(config.directionZ).toBe(0);
    expect(config.emitterConeAngle).toBe(0);
    expect(config.emitterDepth).toBe(0);
    expect(config.gravityX).toBe(0);
    expect(config.gravityY).toBe(0);
    expect(config.gravityZ).toBe(0);
    expect(config.lifetimeMax).toBe(1);
    expect(config.lifetimeMin).toBe(0.5);
    expect(config.maxParticles).toBe(1000);
    expect(config.regionIdMax).toBe(1);
    expect(config.regionIdMin).toBe(0);
    expect(config.rotationSpeedMin).toBe(0);
    expect(config.rotationSpeedMax).toBe(0);
    expect(config.scaleEnd).toBe(1);
    expect(config.velocityInheritance).toBe(0);
    expect(config.worldSpace).toBe(false);
    expect(config.blendMode).toBeNull();
    expect(config.colorStartVarianceR).toBe(0);
    expect(config.colorStartVarianceG).toBe(0);
    expect(config.colorStartVarianceB).toBe(0);
    expect(config.colorEndVarianceR).toBe(0);
    expect(config.colorEndVarianceG).toBe(0);
    expect(config.colorEndVarianceB).toBe(0);
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
