import type { GraphHierarchyNode } from './HasGraphHierarchy';
import type { Signal } from './Signal';

export interface GraphSignals {
  onChildAdded: Signal<(child: GraphHierarchyNode) => void>;
  onChildRemoved: Signal<(child: GraphHierarchyNode) => void>;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}
