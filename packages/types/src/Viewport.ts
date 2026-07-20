import type { Entity } from './Entity';
import type { Node, NodeTraits } from './Node';
import type { ViewportAlign } from './ViewportAlign';
import type { ViewportScaleMode } from './ViewportScaleMode';

// A Viewport is the root-owning presentation-context Entity: it owns a `root` node and describes how that root
// is fit into a view (`align`, `scaleMode`). Stage specializes it with view dimensions and a background color.
export interface Viewport<Traits extends object = NodeTraits> extends Entity {
  align: ViewportAlign;
  root: Node<Traits> | null;
  scaleMode: ViewportScaleMode;
}
