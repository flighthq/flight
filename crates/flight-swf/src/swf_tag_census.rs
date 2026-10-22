use std::collections::HashMap;

use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::{Ref, Uint8Array};

use crate::{
    SWF_HEADER_PREFIX_LENGTH, SWF_TAG_NAMES, parse_swf_header, read_swf_header_rectangle,
    read_swf_header_uint32, uncompress_swf_source,
};

pub fn collect_swf_tag_counts(
    source: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> Option<HashMap<u32, u32>> {
    let header = parse_swf_header(source, deflate, lzma)?;
    let uncompressed = uncompress_swf_source(source, deflate, lzma, None)?;
    let uncompressed = uncompressed.read().unwrap();
    let data = &uncompressed[..header.file_length as usize];
    let stage_bounds = read_swf_header_rectangle(data, SWF_HEADER_PREFIX_LENGTH)?;
    let mut pos = stage_bounds.next_pos + 4;
    let mut counts = HashMap::new();
    while pos < data.len() {
        if pos + 2 > data.len() {
            return None;
        }
        let tag_header = u16::from(data[pos]) + u16::from(data[pos + 1]) * 0x100;
        pos += 2;
        let code = u32::from(tag_header >> 6);
        let short_length = usize::from(tag_header & 0x3f);
        let length = if short_length == SWF_TAG_LONG_FORM_LENGTH {
            if pos + 4 > data.len() {
                return None;
            }
            let value = read_swf_header_uint32(data, pos) as usize;
            pos += 4;
            value
        } else {
            short_length
        };
        if length > data.len() - pos {
            return None;
        }
        pos += length;
        if code == 0 {
            break;
        }
        *counts.entry(code).or_insert(0) += 1;
    }
    return Some(counts);
}

pub fn get_swf_tag_name(code: u32) -> String {
    for (known_code, name) in SWF_TAG_NAMES {
        if *known_code == code {
            return (*name).to_string();
        }
    }
    return format!("Unknown({code})");
}

const SWF_TAG_LONG_FORM_LENGTH: usize = 0x3f;
