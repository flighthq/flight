import type { Attachment2D } from './Attachment2D';
import type { PathWinding } from './ShapeCommand';
import type { Skin2D } from './Skin2D';

// A deformable 2D vector PATH attached to a slot — the third member of the attachment family beside
// RegionAttachment2D (rigid quad) and MeshAttachment2D (deformable triangle mesh). Its deformed world
// coordinates are produced by `deformSkeleton2DPathAttachment` into a `Path`'s `data` stream, under the
// verb stream this attachment carries.
//
// Skinning it needs no new machinery: `Skin2D` stores influence counts plus (boneIndex, localX, localY,
// weight) with no triangles and no UVs anywhere in it, so the weighting is geometry-agnostic and the math
// is identical to a mesh vertex. That is why this type exists rather than a parallel skinned-path model.
//
// Two skin modes, matching MeshAttachment2D:
//   - WEIGHTED (`skin` non-null): each coordinate pair is Σ weight · (boneWorld · localOffset) over its
//     influences. `vertices` is null.
//   - RIGID (`skin` null): `vertices` holds the setup-pose local coordinates and the whole path follows
//     the slot's bone world transform.
//
// THE CONTROL-POINT RULE, and it is a rule about the DATA rather than about any code that reads it. A
// `Path`'s `data` is a flat coordinate stream in which every pair is a point, CUBIC CONTROL POINTS
// INCLUDED. An authoring tool treats a handle as an offset from its anchor, but once lowered to a command
// stream a handle is an ABSOLUTE coordinate and needs influences of its own. Where the source format
// STATES a handle's weights, an importer uses them — some formats weight a cubic vertex's own position,
// its in-handle and its out-handle independently. Where it does not, the handle INHERITS THE INFLUENCE
// SET OF THE VERTEX IT BELONGS TO: the same bone indices and the same weights, with its own local offsets.
// The handle then travels RIGIDLY with its anchor, which is what "the curve follows the bone" means
// visually. Interpolating a handle's influences across the two vertices its segment spans would shear the
// tangent and bend the curve wrong, and inheriting where authored weights exist would discard them.
//
// The consequence worth stating: with that rule applied at import, a handle is simply another entry in
// the influence stream and NOTHING AT RUNTIME NEEDS A HANDLE CONCEPT. `pointCount` therefore counts every
// coordinate pair, anchors and handles alike, and equals `skin.influenceCounts.length` when weighted.
// Expect roughly 3× the influence stream of a mesh with the same anchor count, since a cubic vertex
// carries two handles — a memory note, not an architectural one.
export interface PathAttachment2D extends Attachment2D {
  // The verb stream the deformed coordinates belong to. Deforming never changes it: bones move points,
  // they do not change a line into a curve.
  commands: number[];
  kind: 'PathAttachment2D';
  pointCount: number;
  skin?: Skin2D | null;
  vertices?: Float32Array | null;
  winding: PathWinding;
}

export const PathAttachment2DKind = 'PathAttachment2D';
