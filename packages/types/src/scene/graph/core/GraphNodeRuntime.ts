import type { NodeRuntime } from '../../../core/NodeRuntime';
import type { GraphNodeTraits, NullGraph } from './GraphNode';
import type { GraphNode } from './GraphNode';

export interface GraphNodeRuntime<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> extends NodeRuntime {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  children: (GraphNode<GraphKind, Traits> & Traits[]) | null;
  graph: GraphKind;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  parent: (GraphNode<GraphKind, Traits> & Traits) | null;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;

  canAddChild: (target: GraphNode<GraphKind, Traits>, child: GraphNode<GraphKind, Traits>) => boolean;
  onChildrenChanged: (target: GraphNode<GraphKind, Traits>) => void;
  onChildrenOrderChanged: (target: GraphNode<GraphKind, Traits>) => void;
  onParentChanged: (target: GraphNode<GraphKind, Traits>) => void;
}
