import type { Node, NodeTraits } from './Node.ts';
import type { ViewportAlign } from './ViewportAlign.ts';
import type { ViewportScaleMode } from './ViewportScaleMode.ts';

export interface Scene2DFitContext<Traits extends object = NodeTraits> {
  align: ViewportAlign;
  root: Node<Traits> | null;
  scaleMode: ViewportScaleMode;
}
