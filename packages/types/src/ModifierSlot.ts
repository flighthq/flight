// The slot taxonomy names WHERE a shading Modifier contributes inside the material shader — the
// injection point its GLSL snippet composes into during the @flighthq/shading compile path. Slots
// order the modifier stack deterministically (Vertex deforms the geometry first, all Normal
// contributions run before shading, Effect after) so a feature-set produces one stable compiled
// variant.
//
// Vertex is the one VERTEX-stage slot: its contribution is spliced into the vertex shader (it moves
// the local `position`/`normal` before the model transform — the vertex-displacement case), where
// every other slot injects into the fragment stage. It therefore sorts before Normal in the
// pipeline, and a backend compiler routes it to the vertex program rather than the fragment one.
//
// Open family: the built-in vocabulary below is canonical PascalCase, simultaneously the registry
// key and the serialized form, so a scene round-trips with no string<->identifier seam. Third-party
// slots namespace with a vendor prefix (e.g. 'acme.Foo').
//
// Ambient and Shadow are reserved: named here in the taxonomy but with no built-in modifier
// targeting them in v1. Add them as const members when a real modifier needs that injection point.
export const ModifierSlot = {
  Diffuse: 'Diffuse',
  Effect: 'Effect',
  Emissive: 'Emissive',
  Normal: 'Normal',
  Specular: 'Specular',
  Vertex: 'Vertex',
} as const;

export type ModifierSlot = string;
