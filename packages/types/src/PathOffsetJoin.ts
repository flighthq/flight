// How the corner between two consecutive offset edges is filled when offsetting a path outward (the
// convex side of a vertex). `miter` extends the two edge normals to their intersection, falling back to
// `bevel` when the miter grows past `miterLimit`; `bevel` cuts a straight chamfer between the two offset
// edge endpoints; `round` sweeps a circular arc of radius `|delta|` about the vertex; `square` extends
// both edges by `|delta|` and connects them, squaring the corner off at 45°. This is the Clipper2
// `JoinType` vocabulary.
export type PathOffsetJoin = 'bevel' | 'miter' | 'round' | 'square';
