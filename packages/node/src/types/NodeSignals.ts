import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { NodeAny } from './Node.ts';

export interface NodeSignals extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  onChildAdded: Signal<NodeAny>;
  onChildRemoved: Signal<NodeAny>;
  onChildrenChanged: Signal<void>;
  onChildrenOrderChanged: Signal<void>;
  onParentChanged: Signal<void>;
}
