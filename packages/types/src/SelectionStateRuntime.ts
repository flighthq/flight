import type { EntityRuntime } from './Entity.ts';
import type { HierarchyNodeAny } from './HierarchyNode.ts';
import type { SelectionSignals } from './SelectionState.ts';

export interface SelectionStateRuntime<NodeType extends HierarchyNodeAny = HierarchyNodeAny> extends EntityRuntime {
  activeNode: NodeType | null;
  selectedNodeSet: Set<NodeType>;
  selectedNodes: NodeType[];
  signals: SelectionSignals<NodeType>;
}
