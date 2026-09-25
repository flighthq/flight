import type { Node3D } from './Node3D.ts';
export type Node3DVisitor = (node: Readonly<Node3D>, depth: number) => boolean | void;
