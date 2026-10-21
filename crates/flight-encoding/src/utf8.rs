const UTF8_REPLACEMENT_CHARACTER: char = '\u{FFFD}';

fn assert_utf8_window(byte_length: usize, offset: usize, length: usize) {
    if offset.checked_add(length).map_or(true, |end| end > byte_length) {
        flight_entity::throw_range_error("decodeUTF8 window is outside the byte array");
    }
}

pub fn decode_utf8(bytes: &[u8], offset: Option<usize>, length: Option<usize>) -> String {
    let offset = offset.unwrap_or(0);
    let length = length.unwrap_or_else(|| {
        bytes.len().checked_sub(offset).unwrap_or_else(|| {
            flight_entity::throw_range_error("decodeUTF8 window is outside the byte array");
        })
    });
    assert_utf8_window(bytes.len(), offset, length);
    let end = offset + length;
    let mut result = String::new();
    let mut index = offset;
    while index < end {
        let first = bytes[index];
        index += 1;
        if first <= 0x7F {
            result.push(first as char);
            continue;
        }

        if first >= 0xC2 && first <= 0xDF {
            if index < end {
                let second = bytes[index];
                if is_utf8_continuation(second) {
                    index += 1;
                    let code_point =
                        ((first as u32 & 0x1F) << 6) | (second as u32 & 0x3F);
                    result.push(
                        char::from_u32(code_point).unwrap_or(UTF8_REPLACEMENT_CHARACTER),
                    );
                    continue;
                }
            }
            result.push(UTF8_REPLACEMENT_CHARACTER);
            continue;
        }

        if first >= 0xE0 && first <= 0xEF {
            let second_minimum: u8 = if first == 0xE0 { 0xA0 } else { 0x80 };
            let second_maximum: u8 = if first == 0xED { 0x9F } else { 0xBF };
            if index >= end
                || bytes[index] < second_minimum
                || bytes[index] > second_maximum
            {
                result.push(UTF8_REPLACEMENT_CHARACTER);
                continue;
            }
            let second = bytes[index];
            index += 1;
            if index >= end || !is_utf8_continuation(bytes[index]) {
                result.push(UTF8_REPLACEMENT_CHARACTER);
                continue;
            }
            let third = bytes[index];
            index += 1;
            let code_point = ((first as u32 & 0x0F) << 12)
                | ((second as u32 & 0x3F) << 6)
                | (third as u32 & 0x3F);
            result
                .push(char::from_u32(code_point).unwrap_or(UTF8_REPLACEMENT_CHARACTER));
            continue;
        }

        if first >= 0xF0 && first <= 0xF4 {
            let second_minimum: u8 = if first == 0xF0 { 0x90 } else { 0x80 };
            let second_maximum: u8 = if first == 0xF4 { 0x8F } else { 0xBF };
            if index >= end
                || bytes[index] < second_minimum
                || bytes[index] > second_maximum
            {
                result.push(UTF8_REPLACEMENT_CHARACTER);
                continue;
            }
            let second = bytes[index];
            index += 1;
            if index >= end || !is_utf8_continuation(bytes[index]) {
                result.push(UTF8_REPLACEMENT_CHARACTER);
                continue;
            }
            let third = bytes[index];
            index += 1;
            if index >= end || !is_utf8_continuation(bytes[index]) {
                result.push(UTF8_REPLACEMENT_CHARACTER);
                continue;
            }
            let fourth = bytes[index];
            index += 1;
            let code_point = ((first as u32 & 0x07) << 18)
                | ((second as u32 & 0x3F) << 12)
                | ((third as u32 & 0x3F) << 6)
                | (fourth as u32 & 0x3F);
            result
                .push(char::from_u32(code_point).unwrap_or(UTF8_REPLACEMENT_CHARACTER));
            continue;
        }

        result.push(UTF8_REPLACEMENT_CHARACTER);
    }
    return result;
}

pub fn encode_utf8(text: &str) -> Vec<u8> {
    let byte_length = measure_utf8(text);
    let mut result = vec![0u8; byte_length];
    let mut output_index: usize = 0;
    for c in text.chars() {
        let code_point = c as u32;
        output_index = write_utf8_code_point(&mut result, output_index, code_point);
    }
    return result;
}

fn is_utf8_continuation(byte: u8) -> bool {
    return byte >= 0x80 && byte <= 0xBF;
}

fn measure_utf8(text: &str) -> usize {
    let mut byte_length: usize = 0;
    for c in text.chars() {
        let code_point = c as u32;
        if code_point <= 0x7F {
            byte_length += 1;
        } else if code_point <= 0x7FF {
            byte_length += 2;
        } else if code_point <= 0xFFFF {
            byte_length += 3;
        } else {
            byte_length += 4;
        }
    }
    return byte_length;
}

fn write_utf8_code_point(out: &mut [u8], offset: usize, code_point: u32) -> usize {
    let mut index = offset;
    if code_point <= 0x7F {
        out[index] = code_point as u8;
        index += 1;
    } else if code_point <= 0x7FF {
        out[index] = (0xC0 | (code_point >> 6)) as u8;
        index += 1;
        out[index] = (0x80 | (code_point & 0x3F)) as u8;
        index += 1;
    } else if code_point <= 0xFFFF {
        out[index] = (0xE0 | (code_point >> 12)) as u8;
        index += 1;
        out[index] = (0x80 | ((code_point >> 6) & 0x3F)) as u8;
        index += 1;
        out[index] = (0x80 | (code_point & 0x3F)) as u8;
        index += 1;
    } else {
        out[index] = (0xF0 | (code_point >> 18)) as u8;
        index += 1;
        out[index] = (0x80 | ((code_point >> 12) & 0x3F)) as u8;
        index += 1;
        out[index] = (0x80 | ((code_point >> 6) & 0x3F)) as u8;
        index += 1;
        out[index] = (0x80 | (code_point & 0x3F)) as u8;
        index += 1;
    }
    return index;
}
