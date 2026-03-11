import type { NodeRuntime } from '../../../core/NodeRuntime';
import type { GraphNode } from './GraphNode';

export interface GraphNodeRuntime<G extends symbol> extends NodeRuntime {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  children: GraphNode<G>[] | null;
  graph: G;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  parent: GraphNode<G> | null;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;

  canAddChild: (target: GraphNode<G>, child: GraphNode<G>) => boolean;
  onChildrenChanged: (target: GraphNode<G>) => void;
  onChildrenOrderChanged: (target: GraphNode<G>) => void;
  onParentChanged: (target: GraphNode<G>) => void;
}
