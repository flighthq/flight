//! Web filesystem backend over OPFS — `TODO(host-web)`.
//!
//! # Why this is not implemented yet (the async/`Send` bridge)
//!
//! The browser's persistent file storage is the **Origin Private File System**
//! (OPFS), reached through `navigator.storage.getDirectory()`. Every OPFS
//! operation is asynchronous and returns a JS promise.
//!
//! [`flighthq_types::FileSystemBackend`] is `Send + Sync`. Bridging OPFS means
//! holding `FileSystemDirectoryHandle` / `FileSystemFileHandle` values and
//! awaiting `JsFuture`s — all of which are **not `Send`** in browser wasm
//! (single-threaded; JS handles are thread-bound). This is the same
//! async/`Send` bridge described in [`crate::clipboard`].
//!
//! ## Plan
//!
//! - Decide the seam shape together with clipboard (see [`crate::clipboard`]):
//!   either a wasm-relaxed `MaybeSend` future alias on the seam, or a
//!   thread-local executor that hands results back over a `Send` channel.
//! - Map the `FileSystemBackend` surface onto OPFS:
//!   - `read_text` / `read_binary` → `FileSystemFileHandle.getFile()` then
//!     `Blob.text()` / `Blob.arrayBuffer()`.
//!   - `write_text` / `write_binary` → `createWritable()` →
//!     `FileSystemWritableFileStream.write()` → `close()`.
//!   - `list` / `stat` → directory-handle iteration and `getFile()` metadata.
//!   - The standard-directory paths (`FileSystemPathKind`) collapse to OPFS
//!     subdirectories, since the web sandbox has no real OS directory tree.
//! - `file watch` has no OPFS equivalent; return the no-op/sentinel the seam
//!   documents.
//!
//! Until the seam is settled, the host registers no filesystem backend;
//! `flighthq-filesystem`'s own default governs behavior.

// No backend type is exported yet: see the module docs for the OPFS async/`Send`
// bridge decision that gates a real implementation.

#[cfg(test)]
mod tests {
    // Behavioral tests arrive with the OPFS backend, once the async/`Send` seam
    // decision in the module docs is resolved.
}
