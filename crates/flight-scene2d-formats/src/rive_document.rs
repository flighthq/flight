use std::collections::HashMap;

use flight_entity::Uint8Array;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::rive_core_properties::{get_rive_core_property_field_type, is_rive_core_bytes_property};
use crate::types::{
    RiveCoreObject, RiveDocument, RiveDocumentHeader, RiveFieldType, RiveProperty,
    RivePropertyFieldType, RiveValue,
};

struct RiveCursor<'a> {
    bytes: &'a Uint8Array,
    overflowed: bool,
    position: usize,
    unknown_property_key: u64,
}

fn decode_rive_utf8(bytes: &Uint8Array, start: usize, length: usize) -> String {
    let mut result = String::new();
    let mut index = start;
    let end = start + length;
    while index < end {
        let first = bytes[index];
        index += 1;
        let point = if first < 0x80 {
            u32::from(first)
        } else if first < 0xe0 {
            let second = bytes.get(index).copied().unwrap_or(0);
            index += 1;
            (u32::from(first & 0x1f) << 6) | u32::from(second & 0x3f)
        } else if first < 0xf0 {
            let second = bytes.get(index).copied().unwrap_or(0);
            let third = bytes.get(index + 1).copied().unwrap_or(0);
            index += 2;
            (u32::from(first & 0x0f) << 12)
                | (u32::from(second & 0x3f) << 6)
                | u32::from(third & 0x3f)
        } else {
            let second = bytes.get(index).copied().unwrap_or(0);
            let third = bytes.get(index + 1).copied().unwrap_or(0);
            let fourth = bytes.get(index + 2).copied().unwrap_or(0);
            index += 3;
            (u32::from(first & 0x07) << 18)
                | (u32::from(second & 0x3f) << 12)
                | (u32::from(third & 0x3f) << 6)
                | u32::from(fourth & 0x3f)
        };
        result.push(char::from_u32(point).unwrap_or(char::REPLACEMENT_CHARACTER));
    }
    return result;
}

// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
pub fn parse_rive_document(
    source: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<RiveDocument> {
    let mut cursor = RiveCursor {
        bytes: source,
        overflowed: false,
        position: 0,
        unknown_property_key: 0,
    };
    let Some(header) = read_rive_header(&mut cursor) else {
        report_rive_reject(diagnostics.as_deref_mut(), "rive.invalid-header", None);
        return None;
    };
    if header.major_version != RIVE_SUPPORTED_MAJOR_VERSION {
        report_rive_reject(
            diagnostics.as_deref_mut(),
            "rive.unsupported-version",
            Some(HashMap::from([
                (
                    "major".to_string(),
                    ImportDiagnosticDetailValue::Number(header.major_version as f32),
                ),
                (
                    "supported".to_string(),
                    ImportDiagnosticDetailValue::Number(RIVE_SUPPORTED_MAJOR_VERSION as f32),
                ),
            ])),
        );
        return None;
    }
    let field_types = header
        .table_of_contents
        .iter()
        .map(|entry| (entry.key, entry.r#type))
        .collect::<HashMap<_, _>>();
    let mut objects = Vec::new();
    while cursor.position < cursor.bytes.len() {
        let Some(object) = read_rive_core_object(&mut cursor, &field_types) else {
            if cursor.overflowed {
                report_rive_reject(
                    diagnostics.as_deref_mut(),
                    "rive.truncated-object-stream",
                    None,
                );
            } else {
                report_rive_reject(
                    diagnostics.as_deref_mut(),
                    "rive.unknown-property-width",
                    Some(HashMap::from([(
                        "propertyKey".to_string(),
                        ImportDiagnosticDetailValue::Number(cursor.unknown_property_key as f32),
                    )])),
                );
            }
            return None;
        };
        objects.push(object);
    }
    return Some(RiveDocument { header, objects });
}

fn read_rive_bytes(cursor: &mut RiveCursor<'_>) -> Box<[u8]> {
    let length = read_rive_var_uint(cursor);
    let Ok(length) = usize::try_from(length) else {
        cursor.overflowed = true;
        return Box::new([]);
    };
    let Some(end) = cursor.position.checked_add(length) else {
        cursor.overflowed = true;
        return Box::new([]);
    };
    if cursor.overflowed || end > cursor.bytes.len() {
        cursor.overflowed = true;
        return Box::new([]);
    }
    let start = cursor.position;
    cursor.position = end;
    return cursor.bytes[start..end].to_vec().into_boxed_slice();
}

fn read_rive_core_object(
    cursor: &mut RiveCursor<'_>,
    field_types: &HashMap<u64, RiveFieldType>,
) -> Option<RiveCoreObject> {
    let type_key = read_rive_var_uint(cursor);
    if cursor.overflowed {
        return None;
    }
    let mut properties = Vec::new();
    loop {
        let key = read_rive_var_uint(cursor);
        if cursor.overflowed {
            return None;
        }
        if key == 0 {
            return Some(RiveCoreObject {
                properties,
                type_key,
            });
        }
        let field_type = u32::try_from(key)
            .ok()
            .and_then(get_rive_core_property_field_type)
            .or_else(|| field_types.get(&key).copied());
        let Some(field_type) = field_type else {
            cursor.unknown_property_key = key;
            return None;
        };
        let value = read_rive_value(cursor, field_type, key);
        if cursor.overflowed {
            return None;
        }
        properties.push(RiveProperty {
            key,
            r#type: field_type,
            value,
        });
    }
}

fn read_rive_float32(cursor: &mut RiveCursor<'_>) -> f32 {
    let Some(end) = cursor.position.checked_add(4) else {
        cursor.overflowed = true;
        return 0.0;
    };
    if end > cursor.bytes.len() {
        cursor.overflowed = true;
        return 0.0;
    }
    let bytes = &cursor.bytes[cursor.position..end];
    cursor.position = end;
    return f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
}

fn read_rive_header(cursor: &mut RiveCursor<'_>) -> Option<RiveDocumentHeader> {
    if cursor.bytes.len() < RIVE_FINGERPRINT.len()
        || cursor.bytes[..RIVE_FINGERPRINT.len()] != RIVE_FINGERPRINT
    {
        return None;
    }
    cursor.position = RIVE_FINGERPRINT.len();
    let major_version = read_rive_var_uint(cursor);
    let minor_version = read_rive_var_uint(cursor);
    let file_id = read_rive_var_uint(cursor);
    if cursor.overflowed {
        return None;
    }
    let mut keys = Vec::new();
    loop {
        let key = read_rive_var_uint(cursor);
        if cursor.overflowed {
            return None;
        }
        if key == 0 {
            break;
        }
        keys.push(key);
    }
    let mut table_of_contents = Vec::new();
    let mut word = 0;
    let mut bit = FIELD_TYPE_BITS_PER_WORD;
    for key in keys {
        if bit == FIELD_TYPE_BITS_PER_WORD {
            word = read_rive_uint32(cursor);
            bit = 0;
            if cursor.overflowed {
                return None;
            }
        }
        table_of_contents.push(RivePropertyFieldType {
            key,
            r#type: to_rive_field_type((word >> bit) & 3),
        });
        bit += 2;
    }
    return Some(RiveDocumentHeader {
        file_id,
        major_version,
        minor_version,
        table_of_contents,
    });
}

fn read_rive_string(cursor: &mut RiveCursor<'_>) -> String {
    let length = read_rive_var_uint(cursor);
    let Ok(length) = usize::try_from(length) else {
        cursor.overflowed = true;
        return String::new();
    };
    let Some(end) = cursor.position.checked_add(length) else {
        cursor.overflowed = true;
        return String::new();
    };
    if cursor.overflowed || end > cursor.bytes.len() {
        cursor.overflowed = true;
        return String::new();
    }
    let start = cursor.position;
    cursor.position = end;
    return decode_rive_utf8(cursor.bytes, start, length);
}

fn read_rive_uint32(cursor: &mut RiveCursor<'_>) -> u32 {
    let Some(end) = cursor.position.checked_add(4) else {
        cursor.overflowed = true;
        return 0;
    };
    if end > cursor.bytes.len() {
        cursor.overflowed = true;
        return 0;
    }
    let bytes = &cursor.bytes[cursor.position..end];
    cursor.position = end;
    return u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
}

fn read_rive_value(cursor: &mut RiveCursor<'_>, field_type: RiveFieldType, key: u64) -> RiveValue {
    return match field_type {
        RiveFieldType::String => {
            if u32::try_from(key).is_ok_and(is_rive_core_bytes_property) {
                RiveValue::Bytes(read_rive_bytes(cursor))
            } else {
                RiveValue::String(read_rive_string(cursor))
            }
        }
        RiveFieldType::Double => RiveValue::Double(read_rive_float32(cursor)),
        RiveFieldType::Color => RiveValue::Color(read_rive_uint32(cursor)),
        RiveFieldType::Uint => RiveValue::Uint(read_rive_var_uint(cursor)),
    };
}

fn read_rive_var_uint(cursor: &mut RiveCursor<'_>) -> u64 {
    let mut result = 0_u64;
    let mut shift = 0_u32;
    loop {
        let Some(byte) = cursor.bytes.get(cursor.position).copied() else {
            cursor.overflowed = true;
            return 0;
        };
        cursor.position += 1;
        let payload = u64::from(byte & 0x7f);
        if payload != 0 {
            let Some(value) = payload.checked_shl(shift) else {
                cursor.overflowed = true;
                return 0;
            };
            let Some(value) = result.checked_add(value) else {
                cursor.overflowed = true;
                return 0;
            };
            result = value;
        }
        if byte & 0x80 == 0 {
            return result;
        }
        shift += 7;
    }
}

fn report_rive_reject(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    kind: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Reject,
        kind,
        "parseRiveDocument",
        detail,
    );
}

fn to_rive_field_type(value: u32) -> RiveFieldType {
    return match value {
        1 => RiveFieldType::String,
        2 => RiveFieldType::Double,
        3 => RiveFieldType::Color,
        _ => RiveFieldType::Uint,
    };
}

const FIELD_TYPE_BITS_PER_WORD: u32 = 8;
const RIVE_FINGERPRINT: [u8; 4] = [0x52, 0x49, 0x56, 0x45];
const RIVE_SUPPORTED_MAJOR_VERSION: u64 = 7;
