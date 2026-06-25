//! `TimelineSignals` — the per-frame lifecycle signals armed on a `Timeline`.

use flighthq_signals::Signal;

use crate::timeline_frame_event::TimelineFrameEvent;

/// Lifecycle signals emitted by a `Timeline` while it advances.
///
/// `on_enter_frame` / `on_exit_frame` / `on_frame_constructed` carry a
/// [`TimelineFrameEvent`] describing the frame change; `on_complete` and
/// `on_loop` are bare notifications (`Signal<()>`) fired when the playhead
/// reaches the end of the timeline in `Once` / `Loop` mode respectively.
#[derive(Debug, Default)]
pub struct TimelineSignals {
    pub on_complete: Signal<()>,
    pub on_enter_frame: Signal<TimelineFrameEvent>,
    pub on_exit_frame: Signal<TimelineFrameEvent>,
    pub on_frame_constructed: Signal<TimelineFrameEvent>,
    pub on_loop: Signal<()>,
}
