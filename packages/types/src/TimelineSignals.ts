import type { Signal } from './Signal.ts';
import type { TimelineFrameEvent } from './TimelineFrameEvent.ts';

// Per-frame lifecycle signals for a Timeline, armed by enableTimelineSignals. The per-frame signals
// carry a TimelineFrameEvent; onComplete and onLoop are bare notifications.
export interface TimelineSignals {
  onComplete: Signal<void>;
  onEnterFrame: Signal<TimelineFrameEvent>;
  onExitFrame: Signal<TimelineFrameEvent>;
  onFrameConstructed: Signal<TimelineFrameEvent>;
  onLoop: Signal<void>;
}
