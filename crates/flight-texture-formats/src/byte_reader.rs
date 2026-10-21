use flight_entity::{NonEntityCreateResult, Uint8Array};

use crate::types::ByteReader;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn has_bytes_matches_has_byte_reader_bytes() {
        let reader = ByteReader::new(&[1, 2, 3], Some(1));
        assert_eq!(reader.has_bytes(2), has_byte_reader_bytes(&reader, 2));
    }

    #[test]
    fn new_matches_create_byte_reader() {
        assert_eq!(
            ByteReader::new(&[1, 2, 3], Some(1)),
            create_byte_reader(&[1, 2, 3], Some(1))
        );
    }

    #[test]
    fn read_u16_matches_read_byte_reader_u16() {
        let mut method_reader = ByteReader::new(&[0x34, 0x12], None);
        let mut free_reader = ByteReader::new(&[0x34, 0x12], None);
        assert_eq!(
            method_reader.read_u16(),
            read_byte_reader_u16(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u24_big_endian_matches_read_byte_reader_u24_big_endian() {
        let mut method_reader = ByteReader::new(&[0x12, 0x34, 0x56], None);
        let mut free_reader = ByteReader::new(&[0x12, 0x34, 0x56], None);
        assert_eq!(
            method_reader.read_u24_big_endian(),
            read_byte_reader_u24_big_endian(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u24_matches_read_byte_reader_u24() {
        let mut method_reader = ByteReader::new(&[0x56, 0x34, 0x12], None);
        let mut free_reader = ByteReader::new(&[0x56, 0x34, 0x12], None);
        assert_eq!(
            method_reader.read_u24(),
            read_byte_reader_u24(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u32_big_endian_matches_read_byte_reader_u32_big_endian() {
        let mut method_reader = ByteReader::new(&[0x12, 0x34, 0x56, 0x78], None);
        let mut free_reader = ByteReader::new(&[0x12, 0x34, 0x56, 0x78], None);
        assert_eq!(
            method_reader.read_u32_big_endian(),
            read_byte_reader_u32_big_endian(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u32_matches_read_byte_reader_u32() {
        let mut method_reader = ByteReader::new(&[0x78, 0x56, 0x34, 0x12], None);
        let mut free_reader = ByteReader::new(&[0x78, 0x56, 0x34, 0x12], None);
        assert_eq!(
            method_reader.read_u32(),
            read_byte_reader_u32(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u64_matches_read_byte_reader_u64() {
        let mut method_reader = ByteReader::new(&[0, 0x10, 0, 0, 2, 0, 0, 0], None);
        let mut free_reader = ByteReader::new(&[0, 0x10, 0, 0, 2, 0, 0, 0], None);
        assert_eq!(
            method_reader.read_u64(),
            read_byte_reader_u64(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn read_u8_matches_read_byte_reader_u8() {
        let mut method_reader = ByteReader::new(&[0xab], None);
        let mut free_reader = ByteReader::new(&[0xab], None);
        assert_eq!(
            method_reader.read_u8(),
            read_byte_reader_u8(&mut free_reader)
        );
        assert_eq!(method_reader.offset, free_reader.offset);
    }

    #[test]
    fn skip_matches_skip_byte_reader() {
        let mut method_reader = ByteReader::new(&[0; 8], None);
        let mut free_reader = ByteReader::new(&[0; 8], None);
        method_reader.skip(3);
        skip_byte_reader(&mut free_reader, 3);
        assert_eq!(method_reader.offset, free_reader.offset);
    }
}

pub fn create_byte_reader<'a>(
    bytes: &'a Uint8Array,
    offset: Option<usize>,
) -> NonEntityCreateResult<ByteReader<'a>> {
    return ByteReader {
        view: bytes,
        offset: offset.unwrap_or(0),
    };
}

pub fn has_byte_reader_bytes(reader: &ByteReader<'_>, count: usize) -> bool {
    return reader
        .offset
        .checked_add(count)
        .is_some_and(|end| end <= reader.view.len());
}

pub fn read_byte_reader_u16(reader: &mut ByteReader<'_>) -> u16 {
    let value = u16::from_le_bytes(
        reader.view[reader.offset..reader.offset + 2]
            .try_into()
            .unwrap(),
    );
    reader.offset += 2;
    return value;
}

pub fn read_byte_reader_u24(reader: &mut ByteReader<'_>) -> u32 {
    let offset = reader.offset;
    let value = reader.view[offset] as u32
        | (reader.view[offset + 1] as u32) << 8
        | (reader.view[offset + 2] as u32) << 16;
    reader.offset += 3;
    return value;
}

pub fn read_byte_reader_u24_big_endian(reader: &mut ByteReader<'_>) -> u32 {
    let offset = reader.offset;
    let value = (reader.view[offset] as u32) << 16
        | (reader.view[offset + 1] as u32) << 8
        | reader.view[offset + 2] as u32;
    reader.offset += 3;
    return value;
}

pub fn read_byte_reader_u32(reader: &mut ByteReader<'_>) -> u32 {
    let value = u32::from_le_bytes(
        reader.view[reader.offset..reader.offset + 4]
            .try_into()
            .unwrap(),
    );
    reader.offset += 4;
    return value;
}

pub fn read_byte_reader_u32_big_endian(reader: &mut ByteReader<'_>) -> u32 {
    let value = u32::from_be_bytes(
        reader.view[reader.offset..reader.offset + 4]
            .try_into()
            .unwrap(),
    );
    reader.offset += 4;
    return value;
}

// flight-lint: allow(contract-vocabulary) KTX2 offsets and lengths are unsigned 64-bit fields, but the JS source contract is exact only through 2^53 - 1
pub fn read_byte_reader_u64(reader: &mut ByteReader<'_>) -> u64 {
    let value = u64::from_le_bytes(
        reader.view[reader.offset..reader.offset + 8]
            .try_into()
            .unwrap(),
    );
    reader.offset += 8;
    return value;
}

pub fn read_byte_reader_u8(reader: &mut ByteReader<'_>) -> u8 {
    let value = reader.view[reader.offset];
    reader.offset += 1;
    return value;
}

pub fn skip_byte_reader(reader: &mut ByteReader<'_>, count: usize) {
    reader.offset += count;
}

impl<'a> ByteReader<'a> {
    pub fn new(bytes: &'a Uint8Array, offset: Option<usize>) -> Self {
        return create_byte_reader(bytes, offset);
    }

    pub fn has_bytes(&self, count: usize) -> bool {
        return has_byte_reader_bytes(self, count);
    }

    pub fn read_u16(&mut self) -> u16 {
        return read_byte_reader_u16(self);
    }

    pub fn read_u24(&mut self) -> u32 {
        return read_byte_reader_u24(self);
    }

    pub fn read_u24_big_endian(&mut self) -> u32 {
        return read_byte_reader_u24_big_endian(self);
    }

    pub fn read_u32(&mut self) -> u32 {
        return read_byte_reader_u32(self);
    }

    pub fn read_u32_big_endian(&mut self) -> u32 {
        return read_byte_reader_u32_big_endian(self);
    }

    // flight-lint: allow(contract-vocabulary) KTX2 offsets and lengths are unsigned 64-bit fields, but the JS source contract is exact only through 2^53 - 1
    pub fn read_u64(&mut self) -> u64 {
        return read_byte_reader_u64(self);
    }

    pub fn read_u8(&mut self) -> u8 {
        return read_byte_reader_u8(self);
    }

    pub fn skip(&mut self, count: usize) {
        skip_byte_reader(self, count);
    }
}
