import type { AttractorForce } from './AttractorForce.ts';
import type { DragForce } from './DragForce.ts';
import type { TurbulenceForce } from './TurbulenceForce.ts';
import type { VortexForce } from './VortexForce.ts';
import type { WindForce } from './WindForce.ts';

// Closed by design: force evaluation runs per-particle per-frame; registry dispatch would be a measurable cost.
export type ParticleForce = AttractorForce | DragForce | TurbulenceForce | VortexForce | WindForce;
