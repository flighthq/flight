import type { Signal } from './Signal';
/** Opt-in signals for a particle emitter. Acquired via `enableParticleEmitterSignals`. */
export interface ParticleEmitterSignals {
  /** Fired when a particle spawns. Payload: world-space x/y/z, initial velocity vx/vy/vz. 2D emitters
   *  pass z = vz = 0. */
  onParticleSpawn: Signal<(x: number, y: number, z: number, vx: number, vy: number, vz: number) => void>;
  /** Fired when a particle dies (lifetime exhausted). Payload: last-known x/y/z. 2D emitters pass z = 0. */
  onParticleDeath: Signal<(x: number, y: number, z: number) => void>;
  /** Fired once when a finite, non-looping emitter completes (all particles gone). */
  onEmitterComplete: Signal<() => void>;
}
