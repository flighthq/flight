import type { Signal } from './Signal';
/** Opt-in signals for a particle emitter. Acquired via `enableParticleEmitterSignals`. */
export interface ParticleEmitterSignals {
  /** Fired when a particle spawns. Payload: world-space x/y, initial velocity vx/vy. */
  onParticleSpawn: Signal<(x: number, y: number, vx: number, vy: number) => void>;
  /** Fired when a particle dies (lifetime exhausted). Payload: last-known x/y. */
  onParticleDeath: Signal<(x: number, y: number) => void>;
  /** Fired once when a finite, non-looping emitter completes (all particles gone). */
  onEmitterComplete: Signal<() => void>;
}
