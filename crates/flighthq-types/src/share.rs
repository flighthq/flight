//! Share seam value types: portable file descriptors, presentation options,
//! the share result, and the share signals group.
//!
//! Ports the new types added to `@flighthq/types` `Share.ts`. `ShareContent`
//! and `ShareBackend` live in [`crate::platform`] alongside the rest of the
//! platform suite; the value-typed companions added by the share upgrade live
//! here.

use flighthq_signals::Signal;

/// A portable file descriptor for sharing. Carries a data URL so the descriptor
/// stays plain data across the SDK; web backends convert it to a DOM `File` at
/// the boundary.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShareFile {
    pub name: String,
    pub mime_type: String,
    pub data_url: String,
}

/// Presentation options for a share invocation. All fields are optional; a host
/// that ignores an option falls back to its default chooser.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShareOptions {
    /// Title shown on the share chooser (Android intent chooser title).
    pub chooser_title: Option<String>,
    /// Activity types to exclude from the iOS/macOS share sheet.
    pub excluded_activity_types: Vec<String>,
}

/// The outcome of a share invocation: whether it completed, which activity/app
/// was chosen (or `None`), and whether the user dismissed the sheet.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShareResult {
    pub completed: bool,
    pub activity_type: Option<String>,
    pub dismissed: bool,
}

/// Signals group for share result events. Emitted by `share_content_with_result`
/// on every attached group. Stays inert until attached via `attach_share_signals`.
#[derive(Clone, Debug, Default)]
pub struct ShareSignals {
    pub on_share_result: Signal<ShareResult>,
}
