import type { Entity } from './Entity';
import type { NodeAny } from './Node';
import type { Signal } from './Signal';

export interface NodeSignals extends Entity {
  onChildAdded: Signal<(child: NodeAny) => void>;
  onChildRemoved: Signal<(child: NodeAny) => void>;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}
