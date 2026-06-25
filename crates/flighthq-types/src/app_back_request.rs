//! Veto payload for the application back-button request.

use std::cell::Cell;

/// Payload for `AppLifecycle::on_back_button`. A listener vetoes the default
/// back action by calling [`cancel`](AppBackRequest::cancel). Interior
/// mutability lets a `&`-borrow listener record the veto, which `request_app_back`
/// reads after the emit.
///
/// (TS reads `onBackButton.data?.cancelled` after `cancelSignal`; the Rust
/// signals model resets its cancellation flag at the end of each emit, so the
/// veto lives in this payload instead — mirroring `WindowCloseRequest`.)
#[derive(Debug, Default)]
pub struct AppBackRequest {
    cancelled: Cell<bool>,
}

impl AppBackRequest {
    /// Vetoes the default back action. Call from an `on_back_button` listener
    /// that handled navigation itself.
    pub fn cancel(&self) {
        self.cancelled.set(true);
    }

    /// Returns whether a listener vetoed the back action.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.get()
    }
}
