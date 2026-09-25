import type { CircleCollider } from './CircleCollider.ts';
import type { PlaneCollider } from './PlaneCollider.ts';
import type { RectangleCollider } from './RectangleCollider.ts';
import type { SphereCollider } from './SphereCollider.ts';

// Closed by design: collider evaluation runs per-particle per-frame; registry dispatch would be a measurable cost.
export type ParticleCollider = CircleCollider | PlaneCollider | RectangleCollider | SphereCollider;
