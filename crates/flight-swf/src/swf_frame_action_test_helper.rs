use flight_entity::Uint8Array;

struct AbcFixtureWriter {
    bytes: Vec<u8>,
}

pub fn build_frame_script_abc(handler_name_index: Option<u32>) -> Box<Uint8Array> {
    let handler_name_index = handler_name_index.unwrap_or(3);
    let mut writer = AbcFixtureWriter { bytes: Vec::new() };

    write_abc_u16(&mut writer, 16);
    write_abc_u16(&mut writer, 46);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 6);
    write_abc_string(&mut writer, "Main");
    write_abc_string(&mut writer, "addFrameScript");
    write_abc_string(&mut writer, "stop");
    write_abc_string(&mut writer, "frame1");
    write_abc_string(&mut writer, "");
    write_abc_u30(&mut writer, 2);
    write_abc_u8(&mut writer, 0x16);
    write_abc_u30(&mut writer, 5);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 5);
    for name_index in 1..=4 {
        write_abc_u8(&mut writer, 0x07);
        write_abc_u30(&mut writer, 1);
        write_abc_u30(&mut writer, name_index);
    }

    write_abc_u30(&mut writer, 2);
    for _ in 0..2 {
        write_abc_u30(&mut writer, 0);
        write_abc_u30(&mut writer, 0);
        write_abc_u30(&mut writer, 0);
        write_abc_u8(&mut writer, 0);
    }
    write_abc_u30(&mut writer, 0);

    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 1);
    write_abc_u8(&mut writer, 0);
    write_abc_u30(&mut writer, 0);
    write_abc_u30(&mut writer, 0);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 4);
    write_abc_u8(&mut writer, 0x01);
    write_abc_u30(&mut writer, 0);
    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 0);
    write_abc_u30(&mut writer, 0);

    write_abc_u30(&mut writer, 1);
    write_abc_u30(&mut writer, 0);
    write_abc_u30(&mut writer, 0);

    write_abc_u30(&mut writer, 2);
    let constructor_code = [
        0xd0, 0x30, 0x5d, 0x02, 0x24, 0x00, 0xd0, 0x66, 0x04, 0x4f, 0x02, 0x02, 0x47,
    ];
    write_abc_method_body(&mut writer, 0, 3, &constructor_code);
    let handler_code = [
        0xd0,
        0x30,
        0x5d,
        handler_name_index as u8,
        0x4f,
        handler_name_index as u8,
        0x00,
        0x47,
    ];
    write_abc_method_body(&mut writer, 1, 2, &handler_code);

    return writer.bytes.into_boxed_slice();
}

fn write_abc_method_body(writer: &mut AbcFixtureWriter, method: u32, max_stack: u32, code: &[u8]) {
    write_abc_u30(writer, method);
    write_abc_u30(writer, max_stack);
    write_abc_u30(writer, 1);
    write_abc_u30(writer, 1);
    write_abc_u30(writer, 2);
    write_abc_u30(writer, code.len() as u32);
    writer.bytes.extend_from_slice(code);
    write_abc_u30(writer, 0);
    write_abc_u30(writer, 0);
}

fn write_abc_string(writer: &mut AbcFixtureWriter, value: &str) {
    write_abc_u30(writer, value.len() as u32);
    writer.bytes.extend_from_slice(value.as_bytes());
}

fn write_abc_u16(writer: &mut AbcFixtureWriter, value: u16) {
    write_abc_u8(writer, value as u8);
    write_abc_u8(writer, (value >> 8) as u8);
}

fn write_abc_u30(writer: &mut AbcFixtureWriter, value: u32) {
    let mut remaining = value;
    loop {
        let byte = remaining % 0x80;
        remaining /= 0x80;
        write_abc_u8(
            writer,
            if remaining > 0 {
                byte as u8 | 0x80
            } else {
                byte as u8
            },
        );
        if remaining == 0 {
            return;
        }
    }
}

fn write_abc_u8(writer: &mut AbcFixtureWriter, value: u8) {
    writer.bytes.push(value);
}
