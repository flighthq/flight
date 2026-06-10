import type { Signal } from './Signal';
import type { WorldNode } from './WorldNode';

export interface WorldNodeSignals {
  onChildAdded: Signal<(child: WorldNode) => void>;
  onChildRemoved: Signal<(child: WorldNode) => void>;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}
