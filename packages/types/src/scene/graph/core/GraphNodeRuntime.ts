import type { GraphNode } from './GraphNode';
import type { NodeRuntime } from './NodeRuntime';

export interface GraphNodeRuntime<G extends symbol> extends NodeRuntime {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  graph: G;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
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
