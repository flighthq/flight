import type { CircleCollider } from './CircleCollider';
import type { PlaneCollider } from './PlaneCollider';
import type { RectangleCollider } from './RectangleCollider';

// A particle collider: plain data carrying a `kind` discriminant (the canonical PascalCase type name)
// that applyParticleCollisions switches on. Each concrete collider lives in its own file (1:1 with its
// impl in @flighthq/particles); this union is the dispatch surface they narrow through. The shared
// bounce/damping response lives in CollisionResponse.
//
// NOTE: this remains a closed discriminated union rather than the open `kind: Kind` base contract the
// types-layout spec prefers for extensible families. Opening it requires @flighthq/particles to move
// from a central `switch (collider.kind)` to registry dispatch (as effects/filters do); that is a
// particles-package refactor surfaced as a follow-up, not done here. See report.
export type ParticleCollider = CircleCollider | PlaneCollider | RectangleCollider;
