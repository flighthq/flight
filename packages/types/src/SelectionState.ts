import type { Entity } from './Entity';
import type { HierarchyNodeAny } from './HierarchyNode';
import type { Signal } from './Signal';

declare const SelectionStateNodeTypeKey: unique symbol;

export interface SelectionModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface SelectionSignals<NodeType extends HierarchyNodeAny = HierarchyNodeAny> {
  onActiveChange: Signal<(active: NodeType | null) => void>;
  onChange: Signal<(selected: readonly NodeType[]) => void>;
}

/** Ordered node selection. Its contents are mutated only through @flighthq/selection functions. */
export interface SelectionState<NodeType extends HierarchyNodeAny = HierarchyNodeAny> extends Entity {
  readonly [SelectionStateNodeTypeKey]?: NodeType;
}
