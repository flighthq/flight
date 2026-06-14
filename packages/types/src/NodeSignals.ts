import type { HierarchyNode } from './HasHierarchy';
import type { Signal } from './Signal';

export interface NodeSignals {
  onChildAdded: Signal<(child: HierarchyNode) => void>;
  onChildRemoved: Signal<(child: HierarchyNode) => void>;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}
