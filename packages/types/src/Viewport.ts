import type { Entity } from './Entity';

// A Viewport is the bedrock drawable rectangle: the pixel region a scene is rendered into. It is passive
// plain data — `x`/`y` and `width`/`height` are the rect in device pixels and `devicePixelRatio` the
// backing scale — and it does NOT own its drawable. A renderable surface is a Viewport paired with a
// RenderTarget; many Viewports may cover one target (split-screen, picture-in-picture). A 3D camera reads
// its aspect from a Viewport (`getViewportAspect`); the 2D display tree layers its fit context (`Stage`) on
// top. This is the shared rect both dimensions consume, not a scene-graph node.
export interface Viewport extends Entity {
  devicePixelRatio: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type ViewportLike = Partial<Viewport>;
