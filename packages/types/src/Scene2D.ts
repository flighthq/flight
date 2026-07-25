import type { Entity, EntityRuntime } from './Entity';
import type { Node2D } from './Node2D';
import type { Scene2DSignals } from './Scene2DSignals';
import type { ViewportAlign } from './ViewportAlign';
import type { ViewportScaleMode } from './ViewportScaleMode';

// The Scene2D is the presentation context for a 2D display tree, not a node in it. It owns a display-object
// `root`, the fit context that maps that root into the view (`align`, `scaleMode`), its logical view
// dimensions (`scene2dWidth`/`scene2dHeight`), and its background `color`. Fit is the Scene2D's own concern — the
// bedrock `Viewport` is just the drawable rect a scene renders into, so a Scene2D carries the fit fields
// directly rather than being one. Because it is an Entity rather than a Node it cannot be nested as a child
// anywhere — root-ness is unrepresentable-as-nestable by construction. The scene2d a display object belongs to
// is resolved by walking to its root and reading the root runtime's scene2d back-pointer, so
// `getScene2DRoot` stays a cheap lazy walk with no per-node propagation.
export interface Scene2D extends Entity {
  align: ViewportAlign;
  color: number | null;
  root: Node2D;
  scaleMode: ViewportScaleMode;
  scene2dHeight: number;
  scene2dWidth: number;
}

export interface Scene2DRuntime extends EntityRuntime {
  scene2dSignals: Scene2DSignals | null;
}
