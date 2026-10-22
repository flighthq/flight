// flight-lint: conform-skip(createByteReader, hasByteReaderBytes, readByteReaderU8, readByteReaderU16, readByteReaderU24, readByteReaderU24BigEndian, readByteReaderU32, readByteReaderU32BigEndian, readByteReaderU64, skipByteReader) D8: defined once in flight-buffer (generic byte cursor); re-exported here, not redefined

mod detect_texture_container;
mod explain_texture_container_parse;
mod parse_atf;
mod parse_basis;
mod parse_dds;
mod parse_ktx2;
mod select_texture_container;
mod texture_level_layout;
mod types;

pub mod contract;

pub use contract::compute_texture_container_levels;
pub use contract::create_byte_reader;
pub use contract::detect_texture_container;
pub use contract::explain_texture_container_parse;
pub use contract::get_atf_parse_failure_reason;
pub use contract::get_basis_parse_failure_reason;
pub use contract::get_dds_parse_failure_reason;
pub use contract::get_ktx2_parse_failure_reason;
pub use contract::get_texture_container_level_byte_length;
pub use contract::has_byte_reader_bytes;
pub use contract::parse_atf;
pub use contract::parse_basis;
pub use contract::parse_dds;
pub use contract::parse_ktx2;
pub use contract::read_byte_reader_u8;
pub use contract::read_byte_reader_u16;
pub use contract::read_byte_reader_u24;
pub use contract::read_byte_reader_u24_big_endian;
pub use contract::read_byte_reader_u32;
pub use contract::read_byte_reader_u32_big_endian;
pub use contract::read_byte_reader_u64;
pub use contract::select_texture_container;
pub use contract::skip_byte_reader;

pub use contract::ByteReader;
pub use contract::TextureContainer;
pub use contract::TextureContainerFormat;
pub use contract::TextureContainerKind;
pub use contract::TextureContainerLevel;
pub use contract::TextureContainerLevels;
pub use contract::TextureContainerParseExplanation;
pub use contract::TextureContainerParseFailureReason;
pub use contract::TextureContainerSupercompression;
