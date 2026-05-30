import type { Entity, EntityRuntime } from './Entity';
import type { GraphNode, GraphNodeTraits, NullGraph } from './GraphNode';
import type { Matrix } from './Matrix';

export interface HasTransform2D extends Entity {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface HasTransform2DRuntime extends EntityRuntime {
  localTransform2D: Matrix | null;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform2D: Matrix | null;
}

export type GraphTransform2DNode<
  GraphKind extends symbol = typeof NullGraph,
  Traits extends object = GraphNodeTraits,
> = GraphNode<GraphKind, Traits> & HasTransform2D;
