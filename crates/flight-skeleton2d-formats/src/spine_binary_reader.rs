use crate::types::ByteReader;

pub fn create_spine_binary_reader(bytes: &[u8]) -> ByteReader<'_> {
    return ByteReader {
        offset: 0,
        view: bytes,
    };
}

pub fn has_spine_binary_bytes(reader: &ByteReader<'_>, count: usize) -> bool {
    return reader
        .offset
        .checked_add(count)
        .is_some_and(|end| end <= reader.view.len());
}

pub fn is_spine_binary_reader_overrun(reader: &ByteReader<'_>) -> bool {
    return reader.offset > reader.view.len();
}

fn mark_spine_binary_overrun(reader: &mut ByteReader<'_>) {
    reader.offset = reader.view.len().saturating_add(1);
}

pub fn read_spine_binary_boolean(reader: &mut ByteReader<'_>) -> bool {
    return read_spine_binary_byte(reader) != 0;
}

pub fn read_spine_binary_byte(reader: &mut ByteReader<'_>) -> u8 {
    if !has_spine_binary_bytes(reader, 1) {
        mark_spine_binary_overrun(reader);
        return 0;
    }
    let value = reader.view[reader.offset];
    reader.offset += 1;
    return value;
}

pub fn read_spine_binary_float(reader: &mut ByteReader<'_>) -> f32 {
    if !has_spine_binary_bytes(reader, 4) {
        mark_spine_binary_overrun(reader);
        return 0.0;
    }
    let bytes: [u8; 4] = reader.view[reader.offset..reader.offset + 4]
        .try_into()
        .expect("four bytes");
    reader.offset += 4;
    return f32::from_be_bytes(bytes);
}

pub fn read_spine_binary_int(reader: &mut ByteReader<'_>) -> i32 {
    if !has_spine_binary_bytes(reader, 4) {
        mark_spine_binary_overrun(reader);
        return 0;
    }
    let bytes: [u8; 4] = reader.view[reader.offset..reader.offset + 4]
        .try_into()
        .expect("four bytes");
    reader.offset += 4;
    return i32::from_be_bytes(bytes);
}

fn read_spine_binary_raw_varint(reader: &mut ByteReader<'_>) -> u32 {
    let mut result = 0_u32;
    for shift in [0_u32, 7, 14, 21, 28] {
        let byte = read_spine_binary_byte(reader);
        result |= u32::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            break;
        }
    }
    return result;
}

pub fn read_spine_binary_signed_varint(reader: &mut ByteReader<'_>) -> i32 {
    let raw = read_spine_binary_raw_varint(reader);
    return ((raw >> 1) as i32) ^ -((raw & 1) as i32);
}

pub fn read_spine_binary_string(reader: &mut ByteReader<'_>) -> Option<String> {
    let byte_count = read_spine_binary_varint(reader) as usize;
    if byte_count == 0 {
        return None;
    }
    if byte_count == 1 {
        return Some(String::new());
    }
    let length = byte_count - 1;
    if !has_spine_binary_bytes(reader, length) {
        mark_spine_binary_overrun(reader);
        return None;
    }
    let start = reader.offset;
    reader.offset += length;
    return Some(String::from_utf8_lossy(&reader.view[start..start + length]).into_owned());
}

pub fn read_spine_binary_unsigned_short(reader: &mut ByteReader<'_>) -> u16 {
    if !has_spine_binary_bytes(reader, 2) {
        mark_spine_binary_overrun(reader);
        return 0;
    }
    let bytes: [u8; 2] = reader.view[reader.offset..reader.offset + 2]
        .try_into()
        .expect("two bytes");
    reader.offset += 2;
    return u16::from_be_bytes(bytes);
}

pub fn read_spine_binary_varint(reader: &mut ByteReader<'_>) -> u32 {
    return read_spine_binary_raw_varint(reader);
}

pub fn skip_spine_binary_bytes(reader: &mut ByteReader<'_>, count: usize) {
    if !has_spine_binary_bytes(reader, count) {
        mark_spine_binary_overrun(reader);
        return;
    }
    reader.offset += count;
}
