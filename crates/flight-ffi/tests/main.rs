#[cfg(target_os = "linux")]
#[path = "c_consumer_test.rs"]
mod flight_ffi_c_consumer_test;
#[path = "callback_alias_test.rs"]
mod flight_ffi_callback_alias_test;
#[path = "declared_instantiation_test.rs"]
mod flight_ffi_declared_instantiation_test;
#[path = "hl_shim_test.rs"]
mod flight_ffi_hl_shim_test;
#[path = "node_handle_test.rs"]
mod flight_ffi_node_handle_test;
#[path = "public_perimeter_test.rs"]
mod flight_ffi_public_perimeter_test;
#[path = "reachability_census_test.rs"]
mod flight_ffi_reachability_census_test;
#[path = "../reachability.rs"]
mod flight_ffi_reachability_unit_test;
#[path = "signal_identity_test.rs"]
mod flight_ffi_signal_identity_test;
#[path = "signal_ref_connect_test.rs"]
mod flight_ffi_signal_ref_connect_test;
#[path = "task_k_opaque_handle_test.rs"]
mod flight_ffi_task_k_opaque_handle_test;
#[path = "task_m_residual_skip_test.rs"]
mod flight_ffi_task_m_residual_skip_test;
#[path = "task_s_capability_constructor_test.rs"]
mod flight_ffi_task_s_capability_constructor_test;
