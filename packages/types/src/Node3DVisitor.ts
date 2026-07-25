import type { Node3D } from './Node3D';
export type Node3DVisitor = (node: Readonly<Node3D>, depth: number) => boolean | void;
