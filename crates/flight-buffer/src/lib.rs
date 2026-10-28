mod byte_reader;
mod types;

pub mod contract;

// Preserve the complete Rust crate-root surface through the wildcard while the explicit exports
// below define the generated TypeScript lane. ArrayBuffer, ArrayBufferView, and Blob are supplied
// natively by the TypeScript host, so only ByteReader has package output.
pub use contract::ByteReader;
pub use contract::create_byte_reader;
pub use contract::has_byte_reader_bytes;
pub use contract::read_byte_reader_u8;
pub use contract::read_byte_reader_u16;
pub use contract::read_byte_reader_u24;
pub use contract::read_byte_reader_u24_big_endian;
pub use contract::read_byte_reader_u32;
pub use contract::read_byte_reader_u32_big_endian;
pub use contract::read_byte_reader_u64;
pub use contract::skip_byte_reader;
pub use contract::*;
