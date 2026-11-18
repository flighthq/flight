#[cfg(target_os = "linux")]
#[path = "c_consumer_test.rs"]
mod flight_ffi_c_consumer_test;
#[path = "hl_shim_test.rs"]
mod flight_ffi_hl_shim_test;
#[path = "public_perimeter_test.rs"]
mod flight_ffi_public_perimeter_test;
#[path = "task_k_opaque_handle_test.rs"]
mod flight_ffi_task_k_opaque_handle_test;
