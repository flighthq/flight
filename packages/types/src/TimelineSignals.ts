import type { Signal } from './Signal';
import type { TimelineFrameEvent } from './TimelineFrameEvent';

// Per-frame lifecycle signals for a Timeline, armed by enableTimelineSignals. The per-frame signals
// carry a TimelineFrameEvent; onComplete and onLoop are bare notifications.
export interface TimelineSignals {
  onComplete: Signal<() => void>;
  onEnterFrame: Signal<(event: TimelineFrameEvent) => void>;
  onExitFrame: Signal<(event: TimelineFrameEvent) => void>;
  onFrameConstructed: Signal<(event: TimelineFrameEvent) => void>;
  onLoop: Signal<() => void>;
}
