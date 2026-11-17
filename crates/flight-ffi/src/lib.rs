#![allow(clippy::missing_safety_doc)]
// Async wrappers convert a settled value through the synchronous return body in place.
#![allow(clippy::redundant_closure_call)]

mod async_callback;
mod import_diagnostic_list;

include!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
