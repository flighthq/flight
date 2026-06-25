//! `TimelineFrameEvent` — the payload carried by per-frame timeline signals.

/// The payload dispatched to `onEnterFrame` / `onExitFrame` / `onFrameConstructed`
/// when a timeline's playhead changes frames.
///
/// `frame` is the 1-based frame being entered; `previous_frame` is the frame the
/// playhead was on before this change (the `-1` sentinel on the first entry, when
/// the timeline has not yet constructed any frame).
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct TimelineFrameEvent {
    pub frame: u32,
    pub previous_frame: i64,
}
