use flight_entity::{Record, entries};

pub const NET_FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded;charset=UTF-8";

fn encode_form_component(value: &str) -> String {
    let mut encoded = String::new();
    let hex = b"0123456789ABCDEF";
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'*') {
            encoded.push(char::from(byte));
        } else if byte == b' ' {
            encoded.push('+');
        } else {
            encoded.push('%');
            encoded.push(char::from(hex[usize::from(byte >> 4)]));
            encoded.push(char::from(hex[usize::from(byte & 15)]));
        }
    }
    return encoded;
}

pub fn format_net_form_body(fields: &Record<String>) -> String {
    let mut pairs = Vec::new();
    entries(&mut pairs, fields);
    return pairs
        .into_iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                encode_form_component(key),
                encode_form_component(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");
}
