import type { PbrUvSet } from './PbrExtension';

// What a geometry's vertex layout can actually serve when a material's maps ask for a UV set.
//
// A PBR map names its UV set per map (`*MapUvSet`), and the shader reads set 1 from the fixed `a_uv1`
// attribute lane. That lane is bound only when the geometry layout carries a `uv1` semantic; when it
// does not, the attribute is simply left unbound, and GL reads an unbound float attribute as zero. The
// draw succeeds, every texel of that map samples the same corner, and nothing reports it — which is why
// this is a query rather than a return value nobody would look at.
//
// `requestedUvSets` is what the material asked for, `availableUvSets` what the layout can serve, and
// `unservedUvSets` the difference. `samplesAtOrigin` is true exactly when a requested set is unserved,
// naming the observable consequence rather than restating the arithmetic.
export interface MeshGeometryUvSetExplanation {
  availableUvSets: readonly PbrUvSet[];
  requestedUvSets: readonly PbrUvSet[];
  samplesAtOrigin: boolean;
  unservedUvSets: readonly PbrUvSet[];
}
