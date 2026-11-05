import type { ViewportAlign } from '@flighthq/layout/contract';

import type { Node, NodeFields } from './Node.ts';
import type { ViewportScaleMode } from './ViewportScaleMode.ts';

export interface Scene2DFitContext<Fields extends object = NodeFields> {
  align: ViewportAlign;
  root: Node<Fields> | null;
  scaleMode: ViewportScaleMode;
}
