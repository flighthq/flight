import type { Entity, EntityRuntime } from './Entity';
import type { Matrix } from './Matrix';
import type { Node, NodeTraits } from './Node';

export interface HasTransform2D extends Entity {
  /**
   * Local pivot point that rotation and scale turn around and that aligns to (`x`, `y`). In local
   * units, the same space as children. Defaults to 0,0 (top-left), which reproduces a pivot-free
   * transform. A sprite built from a spritesheet frame sets this to the frame's registration point.
   */
  pivotX: number;
  pivotY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
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

export type Transform2DNode<Traits extends object = NodeTraits> = Node<Traits> & HasTransform2D;
