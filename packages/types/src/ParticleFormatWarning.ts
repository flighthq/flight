import type { ParticleFormatKind } from './ParticleFormatKind';
/** A warning emitted during a particle-format parse or serialize pass, naming a
 *  feature that could not be represented in the target model and was dropped or
 *  approximated. Surface these in your asset pipeline to audit import/export fidelity. */
export interface ParticleFormatWarning {
  /** The format the warning came from. */
  readonly format: ParticleFormatKind;
  /** A short machine-readable code for the warning category (e.g.
   *  `'radial-emitter-approximated'`, `'burst-dropped'`, `'unknown-format'`). */
  readonly code: string;
  /** Human-readable description of what was dropped or approximated. */
  readonly message: string;
}
