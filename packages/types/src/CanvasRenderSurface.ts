import type { Entity } from './Entity';

export interface CanvasRenderSurfaceCreator extends Entity {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
  destroyRenderSurface(canvas: HTMLCanvasElement): void;
}

export interface CanvasRenderSurfaceOptions {
  readonly contextAttributes?: CanvasRenderingContext2DSettings;
  readonly height: number;
  readonly pixelRatio: number;
  readonly width: number;
}

// A complete Canvas acquisition. Render states receive this Entity rather than independently
// acquiring a 2D context from a raw element. The creator remains visible so every child surface can
// be allocated through the same host seam; ownership itself is private to the implementation so a
// caller-wrapped primary surface and a creator-owned offscreen surface cannot be confused.
export interface CanvasRenderSurface extends Entity {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  readonly creator: Readonly<CanvasRenderSurfaceCreator>;
  readonly options: Readonly<CanvasRenderSurfaceOptions>;
}
