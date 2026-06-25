import type { SceneNode } from './SceneNode';
export type SceneNodeVisitor = (node: Readonly<SceneNode>, depth: number) => boolean | void;
