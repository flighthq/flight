import type { AppWindow } from '@flighthq/app/contract';
import { attachAppWindowRenderContextObserver, detachAppWindowRenderContextObserver } from '@flighthq/app/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type { Surface } from '@flighthq/surface/contract';

import type { HostGlCapability } from './types.ts';

// Forwards the host's GL context-loss ingress for a window surface to the window's onRenderContextLost and
// onRenderContextRestored signals. Attaching again releases the previous host subscription first.
export function attachWindowRenderContext(
  hostGl: Readonly<HostGlCapability>,
  win: AppWindow,
  surface: Readonly<Surface>,
): void {
  detachAppWindowRenderContextObserver(win);
  attachAppWindowRenderContextObserver(
    win,
    hostGl.subscribe(
      surface,
      () => emitSignal(win.onRenderContextLost, undefined),
      () => emitSignal(win.onRenderContextRestored, undefined),
    ),
  );
}

export function detachWindowRenderContext(win: AppWindow): void {
  detachAppWindowRenderContextObserver(win);
}
