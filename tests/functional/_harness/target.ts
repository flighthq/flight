import type { CanvasRenderState, DomRenderState, GlRenderState, WgpuRenderState } from '@flighthq/sdk';
import type { DisplayObject, SceneGraphSyncPolicy } from '@flighthq/sdk';

export interface FunctionalTargetOptions {
  width: number;
  height: number;
  background?: number;
  kinds?: readonly symbol[];
  contextAttributes?: { alpha?: boolean };
  syncPolicy?: SceneGraphSyncPolicy;
  clip?: boolean;
  cache?: boolean;
}

export interface FunctionalCanvasTarget {
  kind: 'canvas';
  state: CanvasRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalGlTarget {
  kind: 'webgl';
  state: GlRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalWgpuTarget {
  kind: 'webgpu';
  state: WgpuRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalDomTarget {
  kind: 'dom';
  state: DomRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export type FunctionalTarget = FunctionalCanvasTarget | FunctionalGlTarget | FunctionalWgpuTarget | FunctionalDomTarget;
