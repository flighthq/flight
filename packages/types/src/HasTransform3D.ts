import type { EntityRuntime } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { WorldNode } from './WorldNode';

export interface HasTransform3D {
  localMatrix: Matrix4;
}

export interface HasTransform3DRuntime extends EntityRuntime {
  worldMatrix: Matrix4 | null;
}

export type WorldTransform3DNode = WorldNode & HasTransform3D;
