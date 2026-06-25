//! `PlayMode` — how a `Timeline` behaves when it reaches its last frame.

/// Playback wrap behavior for a `Timeline`.
///
/// - `Loop` (the default) wraps back to frame 1 and emits `onLoop`.
/// - `Once` stops on the last frame and emits `onComplete`.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PlayMode {
    #[default]
    Loop,
    Once,
}
