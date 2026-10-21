pub struct TestObject {
    pub properties: Vec<TestProperty>,
    pub type_key: u64,
}

pub struct TestProperty {
    pub key: u64,
    pub raw: Vec<u8>,
}

pub fn artboard(name: &str) -> TestObject {
    return object(1, vec![text(4, name), float(7, 100.0), float(8, 100.0)]);
}

pub fn build_rive(objects: Vec<TestObject>) -> Vec<u8> {
    let mut bytes = vec![0x52, 0x49, 0x56, 0x45];
    bytes.extend(encode_var_uint(7));
    bytes.extend(encode_var_uint(0));
    bytes.extend(encode_var_uint(0));
    bytes.push(0);
    for entry in objects {
        bytes.extend(encode_var_uint(entry.type_key));
        for property in entry.properties {
            bytes.extend(encode_var_uint(property.key));
            bytes.extend(property.raw);
        }
        bytes.push(0);
    }
    return bytes;
}

pub fn bytes(key: u64, value: &[u8]) -> TestProperty {
    let mut raw = encode_var_uint(value.len() as u64);
    raw.extend_from_slice(value);
    return TestProperty { key, raw };
}

pub fn encode_var_uint(value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut remaining = value;
    loop {
        let group = (remaining & 0x7f) as u8;
        remaining >>= 7;
        bytes.push(if remaining > 0 { group | 0x80 } else { group });
        if remaining == 0 {
            break;
        }
    }
    return bytes;
}

pub fn float(key: u64, value: f32) -> TestProperty {
    return TestProperty {
        key,
        raw: value.to_le_bytes().to_vec(),
    };
}

pub fn object(type_key: u64, properties: Vec<TestProperty>) -> TestObject {
    return TestObject {
        properties,
        type_key,
    };
}

pub fn text(key: u64, value: &str) -> TestProperty {
    let mut raw = encode_var_uint(value.len() as u64);
    raw.extend_from_slice(value.as_bytes());
    return TestProperty { key, raw };
}

pub fn uint(key: u64, value: u64) -> TestProperty {
    return TestProperty {
        key,
        raw: encode_var_uint(value),
    };
}
