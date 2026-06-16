import type { EntityRuntime } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { Node, NodeTraits } from './Node';

export interface HasTransform3D {
  localMatrix: Matrix4;
}

export interface HasTransform3DRuntime extends EntityRuntime {
  worldMatrix: Matrix4 | null;
}

export type Transform3DNode<Traits extends object = NodeTraits> = Node<Traits> & HasTransform3D;
