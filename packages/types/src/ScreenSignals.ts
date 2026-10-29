import type { Entity } from './Entity.ts';
import type { ScreenInfo, ScreenPermissionState } from './Screen.ts';
import type { ScreenChangeEvent } from './ScreenChangeEvent.ts';
import type { Signal } from './Signal.ts';

// Screen change event entity. Enable delivery with attachScreenSignals; the signals stay inert until
// then. onScreenMetricsChanged carries the full ScreenChangeEvent (including changedMetrics); the
// add/remove signals carry just the affected ScreenInfo.
export interface ScreenSignals extends Entity {
  onScreenAdded: Signal<Readonly<ScreenInfo>>;
  onScreenMetricsChanged: Signal<Readonly<ScreenChangeEvent>>;
  onScreenRemoved: Signal<Readonly<ScreenInfo>>;
}

export interface ScreenPermissionChange extends Entity {
  onChange: Signal<ScreenPermissionState>;
}
