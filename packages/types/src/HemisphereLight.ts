import type { Light } from './Light';

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Does not cast shadows.
export interface HemisphereLight extends Light {
  groundColor: number;
  intensity: number;
  kind: 'HemisphereLight';
  skyColor: number;
}

export const HemisphereLightKind = 'HemisphereLight';
