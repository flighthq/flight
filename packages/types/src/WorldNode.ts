import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime } from './Node';

export const WorldGraph: unique symbol = Symbol('WorldGraph');
export const WorldNodeKind: unique symbol = Symbol('WorldNode');

export interface WorldNodeTraits extends HasTransform3D {}

export type WorldNode = Node<typeof WorldGraph, WorldNodeTraits> & WorldNodeTraits;

export type WorldNodeRuntime = NodeRuntime<typeof WorldGraph, WorldNodeTraits> & HasTransform3DRuntime;
