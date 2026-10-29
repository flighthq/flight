import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';
/** Payload of `onParticleDeath`: last-known world-space position. 2D emitters pass z = 0. */
export interface ParticleDeathEvent {
  x: number;
  y: number;
  z: number;
}

/** Payload of `onParticleSpawn`: world-space spawn position and initial velocity. 2D emitters pass
 *  z = vz = 0. */
export interface ParticleSpawnEvent {
  vx: number;
  vy: number;
  vz: number;
  x: number;
  y: number;
  z: number;
}

/** Opt-in signals for a particle emitter. Acquired via `enableParticleEmitterSignals`. */
export interface ParticleEmitterSignals extends Entity {
  /** Fired when a particle spawns. */
  onParticleSpawn: Signal<Readonly<ParticleSpawnEvent>>;
  /** Fired when a particle dies (lifetime exhausted). */
  onParticleDeath: Signal<Readonly<ParticleDeathEvent>>;
  /** Fired once when a finite, non-looping emitter completes (all particles gone). */
  onEmitterComplete: Signal<void>;
}
