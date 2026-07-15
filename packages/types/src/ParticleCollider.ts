import type { CircleCollider } from './CircleCollider';
import type { PlaneCollider } from './PlaneCollider';
import type { RectangleCollider } from './RectangleCollider';
import type { SphereCollider } from './SphereCollider';

// Closed by design: collider evaluation runs per-particle per-frame; registry dispatch would be a measurable cost.
export type ParticleCollider = CircleCollider | PlaneCollider | RectangleCollider | SphereCollider;
