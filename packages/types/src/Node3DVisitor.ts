import type { Node3D } from '@flighthq/scene3d/contract';
export type Node3DVisitor = (node: Readonly<Node3D>, depth: number) => boolean | void;
