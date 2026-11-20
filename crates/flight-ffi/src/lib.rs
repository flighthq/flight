#![allow(clippy::missing_safety_doc)]
// Async wrappers convert a settled value through the synchronous return body in place.
#![allow(clippy::redundant_closure_call)]

mod async_callback;
#[macro_use]
mod enum_conversion;
mod import_diagnostic_list;
#[cfg(feature = "stand-in-wgpu-host")]
mod stand_in_wgpu_host;

#[cfg(test)]
mod by_value_ownership_test;
#[cfg(test)]
mod declared_instantiation_test;
#[cfg(test)]
mod enum_parameter_test;
#[cfg(test)]
mod generic_carrier_test;
#[cfg(test)]
mod interaction_reentry_runtime_test;
#[cfg(test)]
mod interaction_signal_runtime_test;
#[cfg(test)]
mod node_handle_runtime_test;
#[cfg(test)]
mod render_pass_bracket_runtime_test;
#[cfg(test)]
mod shape_bounds_context_test;
#[cfg(test)]
mod signal_connection_runtime_test;
#[cfg(test)]
mod task_k_runtime_test;
#[cfg(test)]
mod task_m_runtime_test;

include!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
