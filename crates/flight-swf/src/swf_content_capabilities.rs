use std::collections::HashMap;

use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::{Ref, Uint8Array};

use crate::{
    SWF_HEADER_PREFIX_LENGTH, SwfContentCapabilities, parse_swf_header, read_swf_header_rectangle,
    read_swf_header_uint32, uncompress_swf_source,
};

pub fn collect_swf_content_capabilities(
    source: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> Option<SwfContentCapabilities> {
    let header = parse_swf_header(source, deflate, lzma)?;
    let uncompressed = uncompress_swf_source(source, deflate, lzma, None)?;
    let uncompressed = uncompressed.read().unwrap();
    let data = &uncompressed[..header.file_length as usize];
    let stage_bounds = read_swf_header_rectangle(data, SWF_HEADER_PREFIX_LENGTH)?;
    let mut pos = stage_bounds.next_pos + 4;
    let mut counts = HashMap::new();
    let mut uses_blend_mode = false;
    let mut uses_filters = false;
    let mut uses_bitmap_fills = false;

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
        let body_start = pos;
        pos += length;
        if code == 0 {
            break;
        }
        *counts.entry(code).or_insert(0) += 1;
        if (code == TAG_PLACE_OBJECT_3 || code == TAG_PLACE_OBJECT_4) && length >= 2 {
            let extended_flags = data[body_start + 1];
            if extended_flags & 0x02 != 0 {
                uses_blend_mode = true;
            }
            if extended_flags & 0x01 != 0 {
                uses_filters = true;
            }
        }
        if SWF_BITMAP_TAGS.contains(&code) {
            uses_bitmap_fills = true;
        }
    }
    return Some(SwfContentCapabilities {
        tag_counts: counts,
        uses_blend_mode,
        uses_filters,
        uses_bitmap_fills,
    });
}

const SWF_BITMAP_TAGS: &[u32] = &[6, 8, 20, 21, 35, 36, 90];
const SWF_TAG_LONG_FORM_LENGTH: usize = 0x3f;
const TAG_PLACE_OBJECT_3: u32 = 70;
const TAG_PLACE_OBJECT_4: u32 = 94;
