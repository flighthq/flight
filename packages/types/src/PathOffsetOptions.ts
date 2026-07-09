import type { PathOffsetEnd } from './PathOffsetEnd';
import type { PathOffsetJoin } from './PathOffsetJoin';

// Options for offsetting a path by a signed distance. `join` picks the corner style on the convex side
// of each vertex (`miter` by default, the sharpest common choice); `end` picks the terminal cap style
// for OPEN paths (`butt` by default, a flat end); both are ignored where they do not apply (closed
// contours ignore `end`). `miterLimit` bounds a miter join's length as a multiple of `|delta|` before it
// falls back to a bevel — the Clipper2 default `2` clips corners sharper than ~60°. `tolerance` is the
// curve-flattening deviation in path units passed to `flattenPath`, defaulting to the same 0.25 the
// flattener uses. `arcTolerance` is the maximum deviation in path units between a `round` join/end arc
// and its true circle, controlling arc tessellation density; it defaults to 0.25, sensible at pixel
// scale (finer values add segments, coarser values remove them).
export interface PathOffsetOptions {
  join?: PathOffsetJoin;
  end?: PathOffsetEnd;
  miterLimit?: number;
  tolerance?: number;
  arcTolerance?: number;
}
