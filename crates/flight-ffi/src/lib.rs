#![allow(clippy::missing_safety_doc)]
// Async wrappers convert a settled value through the synchronous return body in place.
#![allow(clippy::redundant_closure_call)]

mod async_callback;
mod import_diagnostic_list;

#[cfg(test)]
mod by_value_ownership_test;
#[cfg(test)]
mod generic_carrier_test;
#[cfg(test)]
mod shape_bounds_context_test;

include!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
