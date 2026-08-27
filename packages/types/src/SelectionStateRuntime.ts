import type { EntityRuntime } from './Entity';
import type { HierarchyNodeAny } from './HierarchyNode';
import type { SelectionSignals } from './SelectionState';

export interface SelectionStateRuntime<NodeType extends HierarchyNodeAny = HierarchyNodeAny> extends EntityRuntime {
  activeNode: NodeType | null;
  selectedNodeSet: Set<NodeType>;
  selectedNodes: NodeType[];
  signals: SelectionSignals<NodeType>;
}
