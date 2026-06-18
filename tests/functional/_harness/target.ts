import type { CanvasRenderState, DOMRenderState, WebGLRenderState, WebGPURenderState } from '@flighthq/sdk';
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

export interface FunctionalWebGLTarget {
  kind: 'webgl';
  state: WebGLRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalWebGPUTarget {
  kind: 'webgpu';
  state: WebGPURenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalDOMTarget {
  kind: 'dom';
  state: DOMRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export type FunctionalTarget =
  | FunctionalCanvasTarget
  | FunctionalWebGLTarget
  | FunctionalWebGPUTarget
  | FunctionalDOMTarget;
