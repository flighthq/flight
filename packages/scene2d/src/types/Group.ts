import type { Node2D, Node2DRuntime } from './Node2D.ts';

export const GroupKind = 'Group';

// A 2D display-object container with no content of its own; children carry the drawing. 3D scenes use
// bare nodes as groups, so this is the 2D concept only.
export interface Group extends Node2D {}

export type GroupRuntime = Node2DRuntime;
