import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type { ParticleEmitterSignals, EntityConstruction } from '@flighthq/types/contract';

export function createParticleEmitterSignals(): ParticleEmitterSignals {
  const out = allocateEntity<ParticleEmitterSignals>();
  initializeParticleEmitterSignals(out);
  return finishEntity(out);
}

/** Opt-in signals for a typed-array particle emitter.
 *
 *  Returns the {@link ParticleEmitterSignals} group attached to `state`, creating it on
 *  first call. The cost of signals is zero until this function is called — keeping it
 *  opt-in honors the `enable*` convention and avoids allocation for emitters that do not
 *  need loose multi-listener notification.
 *
 *  Connect to the returned signals; they are fired by the simulation functions
 *  (`updateParticleEmitter2D`, `stepParticleEmitter2D`) when the state carries signals.
 *  Use `getParticleEmitterSignals` to read without creating. */
export function enableParticleEmitterSignals(state: object): ParticleEmitterSignals {
  const s = state as Record<symbol, ParticleEmitterSignals | undefined>;
  return (s[signalsSlot] ??= createParticleEmitterSignals());
}

/** Return the {@link ParticleEmitterSignals} attached to `state`, or `null` if signals
 *  have not been enabled for this emitter. */
export function getParticleEmitterSignals(state: object): ParticleEmitterSignals | null {
  return (state as Record<symbol, ParticleEmitterSignals | undefined>)[signalsSlot] ?? null;
}

/** Create a fresh {@link ParticleEmitterSignals} group. Called by
 *  {@link enableParticleEmitterSignals} on first use; exported for unit testing. */
export function initializeParticleEmitterSignals(out: EntityConstruction<ParticleEmitterSignals>): void {
  out.onEmitterComplete = createSignal();
  out.onParticleDeath = createSignal();
  out.onParticleSpawn = createSignal();
}

// Per-emitter state slot for signal storage. Keyed by a module-level symbol so
// there is no collision with other packages that might attach state to the same object.
const signalsSlot = Symbol('particleEmitterSignals');
