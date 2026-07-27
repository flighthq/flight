import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';

export interface RenderTargetNode2DData extends Node2DData {
  readonly depth: boolean;
  height: number;
  width: number;
}

export interface RenderTargetNode2DOptions {
  readonly depth?: boolean;
  readonly height: number;
  readonly width: number;
}

export interface RenderTargetNode2DRuntime extends Node2DRuntime {}

export interface RenderTargetNode2D extends Node2D {
  data: RenderTargetNode2DData;
}

export const RenderTargetNode2DKind = 'RenderTargetNode2D';
