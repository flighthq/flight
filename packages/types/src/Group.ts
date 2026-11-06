import type { Node3D, Node3DRuntime } from '@flighthq/scene3d/contract';
export interface Group extends Node3D {}
export type GroupRuntime = Node3DRuntime;
export const GroupKind = 'Group';
