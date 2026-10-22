use flight_entity::{Ref, Uint8Array};

#[derive(Clone)]
pub struct SwfReader {
    pub bit_position: u8,
    pub end: usize,
    pub pos: usize,
    pub source: Ref<Box<Uint8Array>>,
    pub valid: bool,
}

fn create_swf_reader(source: Ref<Box<Uint8Array>>, start: usize, end: usize) -> SwfReader {
    return SwfReader {
        bit_position: 0,
        end,
        pos: start,
        source,
        valid: true,
    };
}

fn align_swf_reader_to_byte(reader: &mut SwfReader) {
    if reader.bit_position == 0 {
        return;
    }
    reader.bit_position = 0;
    reader.pos += 1;
}

fn read_swf_encoded_uint32(reader: &mut SwfReader) -> u64 {
    let mut value: u64 = 0;
    for index in 0..ENCODED_UINT32_MAX_BYTES {
        let byte = read_swf_uint8(reader);
        value += u64::from(byte & 0x7f) << (7 * index);
        if byte & 0x80 == 0 {
            break;
        }
    }
    return value;
}

fn read_swf_fixed8(reader: &mut SwfReader) -> f32 {
    let value = read_swf_uint16(reader) as i16;
    return f32::from(value) / FIXED_8_8_ONE;
}

// flight-lint: allow(f64) TypeScript number arithmetic preserves authored text fields up to the full byte-sized bit count
fn read_swf_signed_bits(reader: &mut SwfReader, count: u8) -> f64 {
    let value = read_swf_unsigned_bits(reader, count);
    if count == 0 {
        return 0.0;
    }
    let sign = 2.0_f64.powi(i32::from(count) - 1);
    if value >= sign {
        return value - 2.0_f64.powi(i32::from(count));
    }
    return value;
}

fn read_swf_string(reader: &mut SwfReader) -> String {
    align_swf_reader_to_byte(reader);
    let start = reader.pos;
    let source = reader.source.read().unwrap();
    while reader.pos < reader.end && reader.pos < source.len() && source[reader.pos] != 0 {
        reader.pos += 1;
    }
    if reader.pos >= reader.end || reader.pos >= source.len() {
        reader.valid = false;
        return String::new();
    }
    let bytes = &source[start..reader.pos];
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    let value = String::from_utf8_lossy(bytes).into_owned();
    reader.pos += 1;
    return value;
}

fn read_swf_uint16(reader: &mut SwfReader) -> u16 {
    let low = u16::from(read_swf_uint8(reader));
    let high = u16::from(read_swf_uint8(reader));
    return low + high * 0x100;
}

fn read_swf_uint32(reader: &mut SwfReader) -> u32 {
    let low = u32::from(read_swf_uint16(reader));
    let high = u32::from(read_swf_uint16(reader));
    return low + high * 0x10000;
}

fn read_swf_uint8(reader: &mut SwfReader) -> u8 {
    align_swf_reader_to_byte(reader);
    if reader.pos >= reader.end {
        reader.valid = false;
        return 0;
    }
    let source = reader.source.read().unwrap();
    if reader.pos >= source.len() {
        reader.valid = false;
        return 0;
    }
    let value = source[reader.pos];
    reader.pos += 1;
    return value;
}

// flight-lint: allow(f64) TypeScript number accumulation defines the precision and overflow behavior of arbitrary-width bit fields
fn read_swf_unsigned_bits(reader: &mut SwfReader, count: u8) -> f64 {
    let mut value = 0.0_f64;
    for _ in 0..count {
        if reader.pos >= reader.end {
            reader.valid = false;
            return 0.0;
        }
        let source = reader.source.read().unwrap();
        if reader.pos >= source.len() {
            reader.valid = false;
            return 0.0;
        }
        value = value * 2.0 + f64::from((source[reader.pos] >> (7 - reader.bit_position)) & 1);
        reader.bit_position += 1;
        if reader.bit_position == 8 {
            reader.bit_position = 0;
            reader.pos += 1;
        }
    }
    return value;
}

impl SwfReader {
    pub fn new(source: Ref<Box<Uint8Array>>, start: usize, end: usize) -> Self {
        return create_swf_reader(source, start, end);
    }

    pub fn align_to_byte(&mut self) {
        align_swf_reader_to_byte(self);
    }

    pub fn read_encoded_uint32(&mut self) -> u64 {
        return read_swf_encoded_uint32(self);
    }

    pub fn read_fixed8(&mut self) -> f32 {
        return read_swf_fixed8(self);
    }

    // flight-lint: allow(f64) delegates the source-compatible TypeScript number result
    pub fn read_signed_bits(&mut self, count: u8) -> f64 {
        return read_swf_signed_bits(self, count);
    }

    pub fn read_string(&mut self) -> String {
        return read_swf_string(self);
    }

    pub fn read_uint16(&mut self) -> u16 {
        return read_swf_uint16(self);
    }

    pub fn read_uint32(&mut self) -> u32 {
        return read_swf_uint32(self);
    }

    pub fn read_uint8(&mut self) -> u8 {
        return read_swf_uint8(self);
    }

    // flight-lint: allow(f64) delegates the source-compatible TypeScript number result
    pub fn read_unsigned_bits(&mut self, count: u8) -> f64 {
        return read_swf_unsigned_bits(self, count);
    }
}

const ENCODED_UINT32_MAX_BYTES: usize = 5;
const FIXED_8_8_ONE: f32 = 0x100 as f32;
