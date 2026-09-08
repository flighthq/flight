import type { MeshGeometry, MeshGeometryUvSetExplanation, PbrUvSet } from '@flighthq/types/contract';

// Explains whether a geometry's vertex layout can serve the UV sets a material's maps ask for. Pure and
// separately importable; retains and mutates nothing.
//
// UV1 is a vertex-layout fact, not a shader feature: there is no HAS_UV1 define and no material-registry
// branch, because the PBR vertex scene declares `a_uv1` at a fixed lane and the upload binds it whenever
// the layout carries `uv1`. That design is what makes the failure silent — a material whose map names UV
// set 1 over a geometry with no `uv1` draws successfully with the attribute unbound, and GL reads an
// unbound float attribute as zero, so every texel of that map samples the map's origin texel. Nothing
// throws and nothing looks wrong in the draw call; the picture is just flat.
//
// So the diagnosis lives here rather than in a guard on the draw path: callers ask, and
// enableGlScene3DUvSetGuards turns the same answer into a warning for callers who want one.
export function explainGlMeshGeometryUvSets(
  geometry: Readonly<MeshGeometry>,
  requestedUvSets: readonly PbrUvSet[],
): MeshGeometryUvSetExplanation {
  const availableUvSets: PbrUvSet[] = [];
  for (const attribute of geometry.layout.attributes) {
    if (attribute.semantic === 'uv0' && !availableUvSets.includes(0)) availableUvSets.push(0);
    if (attribute.semantic === 'uv1' && !availableUvSets.includes(1)) availableUvSets.push(1);
  }

  const requested: PbrUvSet[] = [];
  for (const uvSet of requestedUvSets) {
    if (!requested.includes(uvSet)) requested.push(uvSet);
  }
  requested.sort();

  const unservedUvSets = requested.filter((uvSet) => !availableUvSets.includes(uvSet));
  return {
    availableUvSets: availableUvSets.sort(),
    requestedUvSets: requested,
    samplesAtOrigin: unservedUvSets.length > 0,
    unservedUvSets,
  };
}
