import type { AppWindow } from './AppWindow.ts';
import type { Entity } from './Entity.ts';
import type { GlContextOptions } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { GlRenderStateOptions } from './GlRenderStateOptions.ts';
import type { GlTextureRenderTarget } from './GlRenderTarget.ts';
import type { RenderState } from './RenderState.ts';
import type { RenderTargetDescriptor, RenderTargetDimensions } from './RenderTarget.ts';
import type { Viewport } from './Viewport.ts';

// The explicit application-side assembly for one drawable view. The four components stay independently
// accessible: the window is the logical-size authority, the RenderState is the current command context,
// the RenderTarget owns storage, and the device-pixel Viewport selects the drawable rectangle.
export interface AppRenderView<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends Entity {
  readonly renderState: State;
  readonly renderTarget: Target;
  readonly viewport: Viewport;
  readonly window: AppWindow;
}

export type AppRenderViewResize<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> = (renderState: State, renderTarget: Target, width: number, height: number) => void;

// Width and height are window-derived for an AppRenderView. The remaining target storage axes
// stay caller-selected and are passed unchanged to the backend target allocator.
export type AppRenderViewTargetOptions = Omit<RenderTargetDescriptor, 'height' | 'width'>;

export interface GlAppRenderViewOptions {
  readonly context?: Readonly<GlContextOptions>;
  readonly render?: Readonly<GlRenderStateOptions>;
  readonly target?: Readonly<AppRenderViewTargetOptions>;
}

export type GlAppRenderView = AppRenderView<GlRenderState, GlTextureRenderTarget>;

// The render-layer half of a GL application view: the command state, its storage and the drawable
// rectangle a backend allocates for one acquired context. The application half — the window and the
// resize wiring that reconciles the two — stays in @flighthq/app, which a render backend may
// not import. A caller holding both composes them explicitly rather than through an assembly package.
export interface GlRenderViewResources extends Entity {
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}
