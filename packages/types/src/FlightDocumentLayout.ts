import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { LayoutNode, LayoutTree } from './Layout';
import type { NodeAny } from './Node';

// The document specialization keeps layout styles inside the recursive values the text codec can
// represent. It is otherwise the same container/item/kind/parentIndex vocabulary as LayoutNode.
export type FlightDocumentLayoutNode = LayoutNode<FlightDocumentFields, FlightDocumentFields>;

export interface FlightDocumentLayoutTree extends LayoutTree {
  nodes: FlightDocumentLayoutNode[];
}

// `targets[index]` names the authored scene node described by `tree.nodes[index]`. The name comes from
// FlightDocumentNode.fields.name; it is not a second node identity or a scene-tree index.
export interface FlightDocumentLayoutDescriptor {
  targets: string[];
  tree: FlightDocumentLayoutTree;
}

// An inert association produced by scene materialization. Measuring the targets, resolving the tree,
// and applying the output rectangles all remain explicit caller work in @flighthq/layout.
export interface FlightDocumentLayoutBinding<N extends NodeAny = NodeAny> {
  targets: N[];
  tree: FlightDocumentLayoutTree;
}
