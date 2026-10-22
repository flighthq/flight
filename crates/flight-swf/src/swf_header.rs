use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::{Ref, Uint8Array};

use crate::{
    SWF_HEADER_PREFIX_LENGTH, SwfHeader, read_swf_header_rectangle, read_swf_header_uint32,
    uncompress_swf_source,
};

pub fn parse_swf_header(
    source: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> Option<SwfHeader> {
    let uncompressed = uncompress_swf_source(source, deflate, lzma, None)?;
    let data = uncompressed.read().unwrap();
    if data.len() < SWF_HEADER_MIN_LENGTH {
        return None;
    }
    let version = data[3];
    let file_length = read_swf_header_uint32(&data, 4);
    if version == 0
        || file_length < SWF_HEADER_MIN_LENGTH as u32
        || file_length as usize > data.len()
    {
        return None;
    }
    let data = &data[..file_length as usize];
    let stage_bounds = read_swf_header_rectangle(data, SWF_HEADER_PREFIX_LENGTH)?;
    if stage_bounds.next_pos + 4 > data.len() {
        return None;
    }
    let frame_rate_raw =
        u16::from(data[stage_bounds.next_pos]) + u16::from(data[stage_bounds.next_pos + 1]) * 0x100;
    return Some(SwfHeader {
        file_length,
        frame_rate: f32::from(frame_rate_raw) / SWF_FIXED_8_8_ONE,
        stage_bounds: stage_bounds.rect,
        version,
    });
}

const SWF_FIXED_8_8_ONE: f32 = 0x100 as f32;
const SWF_HEADER_MIN_LENGTH: usize = 12;
