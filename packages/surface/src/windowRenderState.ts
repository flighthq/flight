import type { AppWindow } from '@flighthq/app/contract';
import { attachAppWindowRenderStateObserver, detachAppWindowRenderStateObserver } from '@flighthq/app/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';

import type { HostSurfaceResizeCapability, Surface } from './types.ts';

// Binds a surface's backing store to the window's size and devicePixelRatio: sizes it now and on every
// onResize, so moving the window between displays or zooming is handled. Pair with attachWindowResize,
// the source of the size/DPI updates this reacts to. DOM render states need no surface resize (the
// browser rasterizes DOM at device resolution), so this is for canvas and GPU surfaces.
export function attachWindowRenderState(
  hostSurfaceResize: Readonly<HostSurfaceResizeCapability>,
  win: AppWindow,
  surface: Readonly<Surface>,
): void {
  detachAppWindowRenderStateObserver(win);
  const apply = (): void => {
    hostSurfaceResize.resize(
      surface,
      Math.round(win.width * win.devicePixelRatio),
      Math.round(win.height * win.devicePixelRatio),
    );
  };
  apply();
  const resizeSlot = connectSignal(win.onResize, apply);
  attachAppWindowRenderStateObserver(win, () => disconnectSignal(win.onResize, resizeSlot));
}

export function detachWindowRenderState(win: AppWindow): void {
  detachAppWindowRenderStateObserver(win);
}
