import type { Entity } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { NodeAny } from './Node.ts';

export interface NodeSignals extends Entity {
  onChildAdded: Signal<NodeAny>;
  onChildRemoved: Signal<NodeAny>;
  onChildrenChanged: Signal<void>;
  onChildrenOrderChanged: Signal<void>;
  onParentChanged: Signal<void>;
}
