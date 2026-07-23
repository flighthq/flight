import type { Node, NodeTraits } from './Node';
import type { ViewportAlign } from './ViewportAlign';
import type { ViewportScaleMode } from './ViewportScaleMode';

export interface StageFitContext<Traits extends object = NodeTraits> {
  align: ViewportAlign;
  root: Node<Traits> | null;
  scaleMode: ViewportScaleMode;
}
