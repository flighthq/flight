import type { BlendMode } from './BlendMode';
import type { Kind } from './Entity';

// Everything a Scene2D document contains that some consumer has to be registered for. The question half
// of the scene↔consumer seam: a scene knows WHAT is in it, and only the holder of a registry knows
// whether anything is bound to serve it, so this reports kinds and never verdicts.
//
// Unlike Scene3DKindUsage, `nodeKinds` is a real requirement here: the 2D pipeline dispatches every node
// through the renderer registry (`registerRenderer(state, kind, renderer)`), where the 3D pipeline
// collects meshes structurally and registers nothing per node kind.
//
// Not yet reported: texture source kinds. A 2D document reaches textures through several unrelated
// shapes — sprite data, tilemap atlases, and the texture-fill shape commands — and reporting only the
// ones that are cheap to reach would be worse than reporting none, because a caller would read the
// absence as "no resolver needed". Add them when all three paths can be walked, not before.
export interface Scene2DKindUsage {
  // Distinct blend modes any node requests. On the GL backend each non-default mode needs a
  // realization registered; the Canvas and DOM backends express them natively.
  blendModes: BlendMode[];
  materialKinds: Kind[];
  nodeKinds: Kind[];
  // Command keys appearing in any recorded shape stream, which a backend that rasterizes shapes must
  // have handlers for. A scene whose shapes all tessellate on the GPU never replays these.
  shapeCommandKeys: string[];
}
