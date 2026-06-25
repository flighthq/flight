import type { ScreenInfo } from './Screen';

// What kind of display change an event reports: a screen attached, a screen detached, or an existing
// screen's metrics (bounds, work area, scale, orientation) changed.
export type ScreenChangeKind = 'ScreenAdded' | 'ScreenMetricsChanged' | 'ScreenRemoved';

// Which metric groups changed in a ScreenMetricsChanged event. Each flag is true when that group of
// fields differs from the prior snapshot.
export interface ScreenChangedMetrics {
  bounds: boolean;
  workArea: boolean;
  scaleFactor: boolean;
  orientation: boolean;
}

// A single display change delivered to a ScreenBackend subscriber. `screen` is the affected display;
// `changedMetrics` is non-null only for ScreenMetricsChanged events and null for add/remove.
export interface ScreenChangeEvent {
  kind: ScreenChangeKind;
  screen: ScreenInfo;
  changedMetrics: ScreenChangedMetrics | null;
}
