import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { ShapeCommandToken } from './ShapeCommand';

export interface ShapeData extends Node2DData {
  commands: ShapeCommandToken[];
}

export interface ShapeRuntime extends Node2DRuntime {
  shapeBoundsCommandRegistryRevision: number;
}

export interface Shape extends Node2D {
  data: ShapeData;
}

export const ShapeKind = 'Shape';
