use crate::awd2_schema::*;
use crate::awd2_types::Awd2Header;
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::Uint8Array;

pub fn parse_awd2_header(
    source: &Uint8Array,
    _deflate: Option<&HostDecompressDeflateCapability>,
    _lzma: Option<&HostDecompressLzmaCapability>,
) -> Option<Awd2Header> {
    if source.len() < AWD2_HEADER_BYTES
        || source[0] != AWD2_MAGIC_0
        || source[1] != AWD2_MAGIC_1
        || source[2] != AWD2_MAGIC_2
        || source[AWD2_VERSION_MAJOR_OFFSET] != AWD2_FORMAT_VERSION
    {
        return None;
    }
    return Some(Awd2Header {
        body_length: read_three_ds_u32(source, 8),
        compression: source[7],
        flags: read_three_ds_u16(source, 5),
        version_major: source[3],
        version_minor: source[4],
    });
}
