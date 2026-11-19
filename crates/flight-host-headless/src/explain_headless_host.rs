//! Why `create_headless_host` returns `None`: a separately importable explainer that re-runs the
//! host's own adapter choice and device request, so it reports exactly what creation would meet.

use crate::headless_device::request_headless_device;
use crate::headless_host::create_headless_host_options;
use crate::types::*;

/// Re-runs adapter choice and the device request for `options` and reports the outcome as plain
/// data: `Ready` with the adapter creation would open, or the reason it returns `None`. The probe
/// device is dropped before returning; nothing is retained.
pub fn explain_headless_host(options: Option<&HeadlessHostOptions>) -> HeadlessHostExplanation {
    let defaults = create_headless_host_options();
    return match request_headless_device(options.unwrap_or(&defaults)) {
        Ok(opened) => {
            opened.device.destroy();
            HeadlessHostExplanation {
                adapter_backend: opened.adapter_backend,
                adapter_name: opened.adapter_name,
                message: String::new(),
                reason: HeadlessHostExplanationReason::Ready,
            }
        }
        Err(explanation) => explanation,
    };
}
