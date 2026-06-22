//! Web clipboard backend — `TODO(host-web)`.
//!
//! # Why this is not implemented yet (the async/`Send` bridge)
//!
//! The clipboard seam ([`flighthq_types::ClipboardBackend`]) is **async and
//! `Send`**: every method returns
//! `Pin<Box<dyn Future<Output = …> + Send>>`, and the trait itself is
//! `Send + Sync`. On the web the natural implementation is
//! `navigator.clipboard.readText()` / `writeText()`, which return JS promises
//! bridged with `wasm_bindgen_futures::JsFuture`.
//!
//! `JsFuture` (and every value derived from a `js_sys::Promise`) is **not
//! `Send`** — wasm in the browser is single-threaded and JS handles cannot
//! cross threads. So a `navigator.clipboard` backend cannot satisfy the
//! `Future<Output = …> + Send` bound the seam requires. This is the core
//! async-bridge decision for `host-web`.
//!
//! ## Plan
//!
//! Two viable resolutions, to be decided with the owners of `flighthq-types`:
//!
//! 1. **Relax the seam on wasm.** Make the clipboard futures `Send` only off
//!    wasm (a `MaybeSend` alias that is `Send` on native and a no-op marker on
//!    `wasm32`). This is the cleanest fit for a single-threaded web runtime and
//!    keeps native hosts unchanged. Preferred.
//! 2. **Spawn onto a thread-local executor** and surface results through a
//!    `Send` channel whose receiver future is `Send`. This keeps the seam
//!    unchanged but adds an executor dependency and copies every payload across
//!    the boundary.
//!
//! Until the seam is settled, the host does not register a clipboard backend;
//! `flighthq-clipboard`'s own web default / fallback governs behavior. The
//! `set_web_clipboard_backend` entry point is intentionally absent rather than
//! shipping a backend that silently fails the `Send` contract.

// No backend type is exported yet: see the module docs for the async/`Send`
// bridge decision that gates a real `navigator.clipboard` implementation.

#[cfg(test)]
mod tests {
    // Behavioral tests arrive with the backend, once the async/`Send` seam
    // decision in the module docs is resolved.
}
