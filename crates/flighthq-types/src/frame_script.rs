//! `FrameScript` — a callback invoked on entry to a specific timeline frame.

/// A frame script: code that runs once when the playhead enters the frame it is
/// attached to. Mirrors the TS `FrameScript = (target, frame) => void`.
///
/// The callback receives the opaque target node id (`NodeId`-as-u64, matching
/// the display graph key) and the 1-based frame number.
pub type FrameScript = std::sync::Arc<dyn Fn(u64, u32) + Send + Sync>;
