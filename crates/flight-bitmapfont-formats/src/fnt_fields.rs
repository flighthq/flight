use std::collections::HashMap;

pub(crate) fn parse_fnt_fields(rest: &str) -> HashMap<String, String> {
    let bytes = rest.as_bytes();
    let mut fields = HashMap::new();
    let mut index = 0;
    while index < bytes.len() {
        while index < bytes.len() && !is_key_start(bytes[index]) {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }
        let key_start = index;
        index += 1;
        while index < bytes.len() && is_key_continue(bytes[index]) {
            index += 1;
        }
        let key_end = index;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            index = key_start + 1;
            continue;
        }
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let value;
        if index < bytes.len() && bytes[index] == b'"' {
            index += 1;
            let value_start = index;
            while index < bytes.len() && bytes[index] != b'"' {
                index += 1;
            }
            if index >= bytes.len() {
                break;
            }
            value = &rest[value_start..index];
            index += 1;
        } else {
            let value_start = index;
            while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            if value_start == index {
                continue;
            }
            value = &rest[value_start..index];
        }
        fields.insert(rest[key_start..key_end].to_string(), value.to_string());
    }
    return fields;
}

pub(crate) fn read_fnt_number(value: Option<&String>) -> Option<f32> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let parsed = if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u64::from_str_radix(hex, 16)
            .ok()
            .map(|number| number as f64)
    } else if let Some(binary) = value
        .strip_prefix("0b")
        .or_else(|| value.strip_prefix("0B"))
    {
        u64::from_str_radix(binary, 2)
            .ok()
            .map(|number| number as f64)
    } else if let Some(octal) = value
        .strip_prefix("0o")
        .or_else(|| value.strip_prefix("0O"))
    {
        u64::from_str_radix(octal, 8)
            .ok()
            .map(|number| number as f64)
    } else {
        value.parse::<f64>().ok()
    }?;
    if !parsed.is_finite() {
        return None;
    }
    return Some(parsed as f32);
}

pub(crate) fn f32_to_i32(value: f32) -> i32 {
    return value as i32;
}

pub(crate) fn f32_to_u32(value: f32) -> u32 {
    return value as u32;
}

fn is_key_start(value: u8) -> bool {
    return value.is_ascii_alphabetic() || value == b'_';
}

fn is_key_continue(value: u8) -> bool {
    return value.is_ascii_alphanumeric() || value == b'_';
}
