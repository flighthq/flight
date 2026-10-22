//! The uniform-ring byte-order diagnostic (TS `explainWgpuUniformEndianness.ts`).

use flight_platform::PlatformEndianness;

use crate::types::{WgpuUniformEndiannessExplanation, WgpuUniformEndiannessStatus};

/// Whether the integer fields written into the float uniform ring are validated on this host (TS
/// `explainWgpuUniformEndianness`). The two views share bytes, so the layout is host-determined;
/// only little-endian hosts are validated.
pub fn explain_wgpu_uniform_endianness() -> WgpuUniformEndiannessExplanation {
    let endianness = probe_endianness();
    return WgpuUniformEndiannessExplanation {
        endianness,
        status: if endianness == PlatformEndianness::Little {
            WgpuUniformEndiannessStatus::Validated
        } else {
            WgpuUniformEndiannessStatus::Unvalidated
        },
    };
}

fn probe_endianness() -> PlatformEndianness {
    let bytes = 0x0102_u16.to_ne_bytes();
    if bytes[0] == 0x01 {
        return PlatformEndianness::Big;
    }
    if bytes[0] == 0x02 {
        return PlatformEndianness::Little;
    }
    return PlatformEndianness::Unknown;
}
