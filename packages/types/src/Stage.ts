import type { DisplayObject } from './DisplayObject';
import type { Entity, EntityRuntime } from './Entity';
import type { StageSignals } from './StageSignals';
import type { ViewportAlign } from './ViewportAlign';
import type { ViewportScaleMode } from './ViewportScaleMode';

// The Stage is the presentation context for a 2D display tree, not a node in it. It owns a display-object
// `root`, the fit context that maps that root into the view (`align`, `scaleMode`), its logical view
// dimensions (`stageWidth`/`stageHeight`), and its background `color`. Fit is the Stage's own concern — the
// bedrock `Viewport` is just the drawable rect a scene renders into, so a Stage carries the fit fields
// directly rather than being one. Because it is an Entity rather than a Node it cannot be nested as a child
// anywhere — root-ness is unrepresentable-as-nestable by construction. The stage a display object belongs to
// is resolved by walking to its root and reading the root runtime's stage back-pointer, so
// `getDisplayObjectStage` stays a cheap lazy walk with no per-node propagation.
export interface Stage extends Entity {
  align: ViewportAlign;
  color: number | null;
  root: DisplayObject;
  scaleMode: ViewportScaleMode;
  stageHeight: number;
  stageWidth: number;
}

export interface StageRuntime extends EntityRuntime {
  stageSignals: StageSignals | null;
}
