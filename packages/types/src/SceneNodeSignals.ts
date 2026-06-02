import type { SceneHierarchyNode } from './HasSceneHierarchy';
import type { Signal } from './Signal';

export interface SceneSignals {
  onChildAdded: Signal<(child: SceneHierarchyNode) => void>;
  onChildRemoved: Signal<(child: SceneHierarchyNode) => void>;
  onChildrenChanged: Signal<() => void>;
  onChildrenOrderChanged: Signal<() => void>;
  onParentChanged: Signal<() => void>;
}
