import type { ScreenInfo } from './Screen';
import type { ScreenChangeEvent } from './ScreenChangeEvent';
import type { Signal } from './Signal';

// Screen change event entity. Enable delivery with attachScreenSignals; the signals stay inert until
// then. onScreenMetricsChanged carries the full ScreenChangeEvent (including changedMetrics); the
// add/remove signals carry just the affected ScreenInfo.
export interface ScreenSignals {
  onScreenAdded: Signal<(screen: Readonly<ScreenInfo>) => void>;
  onScreenMetricsChanged: Signal<(event: Readonly<ScreenChangeEvent>) => void>;
  onScreenRemoved: Signal<(screen: Readonly<ScreenInfo>) => void>;
}
