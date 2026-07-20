import type { DisplayObject, DisplayObjectTraits } from './DisplayObject';
import type { Entity, EntityRuntime } from './Entity';
import type { StageSignals } from './StageSignals';
import type { Viewport } from './Viewport';

// The Stage is the presentation context for a 2D display tree, not a node in it. It owns a display-object
// `root` and describes how that root fits into the view (inherited from Viewport: `align`, `scaleMode`), its
// view dimensions, and its background `color`. Because it is an Entity rather than a Node it cannot be nested
// as a child anywhere — root-ness is unrepresentable-as-nestable by construction. The stage a display object
// belongs to is resolved by walking to its root and reading the root runtime's stage back-pointer, so
// `getDisplayObjectStage` stays a cheap lazy walk with no per-node propagation.
export interface Stage extends Entity, Viewport<DisplayObjectTraits> {
  color: number | null;
  root: DisplayObject;
  stageHeight: number;
  stageWidth: number;
}

export interface StageRuntime extends EntityRuntime {
  stageSignals: StageSignals | null;
}
