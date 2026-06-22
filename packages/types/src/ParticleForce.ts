import type { AttractorForce } from './AttractorForce';
import type { DragForce } from './DragForce';
import type { TurbulenceForce } from './TurbulenceForce';
import type { VortexForce } from './VortexForce';
import type { WindForce } from './WindForce';

// A particle force field: plain data carrying a `kind` discriminant (the canonical PascalCase type
// name) that applyParticleForces switches on. Each concrete force lives in its own file (1:1 with its
// impl in @flighthq/particles); this union is the dispatch surface they narrow through.
//
// NOTE: this remains a closed discriminated union rather than the open `kind: Kind` base contract the
// types-layout spec prefers for extensible families. Opening it requires @flighthq/particles to move
// from a central `switch (force.kind)` to registry dispatch (as effects/filters do); that is a
// particles-package refactor surfaced as a follow-up, not done here. See report.
export type ParticleForce = AttractorForce | DragForce | TurbulenceForce | VortexForce | WindForce;
