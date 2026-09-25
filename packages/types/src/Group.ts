import type { Node3D, Node3DRuntime } from './Node3D.ts';
export interface Group extends Node3D {}
export type GroupRuntime = Node3DRuntime;
export const GroupKind = 'Group';
