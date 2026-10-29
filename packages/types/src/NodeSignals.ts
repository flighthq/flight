import type { Entity } from './Entity.ts';
import type { NodeAny } from './Node.ts';
import type { Signal } from './Signal.ts';

export interface NodeSignals extends Entity {
  onChildAdded: Signal<NodeAny>;
  onChildRemoved: Signal<NodeAny>;
  onChildrenChanged: Signal<void>;
  onChildrenOrderChanged: Signal<void>;
  onParentChanged: Signal<void>;
}
