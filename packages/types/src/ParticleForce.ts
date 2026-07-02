import type { AttractorForce } from './AttractorForce';
import type { DragForce } from './DragForce';
import type { TurbulenceForce } from './TurbulenceForce';
import type { VortexForce } from './VortexForce';
import type { WindForce } from './WindForce';

// Closed by design: force evaluation runs per-particle per-frame; registry dispatch would be a measurable cost.
export type ParticleForce = AttractorForce | DragForce | TurbulenceForce | VortexForce | WindForce;
