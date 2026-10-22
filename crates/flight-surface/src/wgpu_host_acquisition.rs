//! Construction of the WGPU acquisition Entity a host provider returns (TS `WgpuHostAcquisition`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates an acquisition with empty handles, no format and `Flight` ownership; a provider assigns
/// its device, context, format, ownership and live surface after create (D23 B).
// flight-lint: allow(conform-extra) D12: Rust needs a constructor because the Entity runtime slot is private; TS host providers construct the structural object in their adapters
pub fn create_wgpu_host_acquisition() -> WgpuHostAcquisition {
    let mut out: WgpuHostAcquisition = allocate_entity();
    initialize_wgpu_host_acquisition(&mut out);
    return out;
}

/// The construction initializer of `create_wgpu_host_acquisition`.
// flight-lint: allow(conform-extra) D12: Rust needs an initializer because the Entity runtime slot is private; TS host providers construct the structural object in their adapters
pub fn initialize_wgpu_host_acquisition(out: &mut WgpuHostAcquisition) {
    let empty = WgpuHostAcquisition::default();
    out.context = empty.context;
    out.device = empty.device;
    out.format = empty.format;
    out.ownership = empty.ownership;
    out.surface = empty.surface;
}
