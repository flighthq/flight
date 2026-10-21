use flight_font_formats::SyntheticFontOptions;

pub(crate) fn font_options() -> SyntheticFontOptions {
    return SyntheticFontOptions {
        advances: None,
        codepoints: None,
        charstrings: None,
        cid: None,
        glyphs: None,
        flavor: None,
        omit_table: None,
        units_per_em: None,
    };
}

pub(crate) fn font_view(bytes: Box<[u8]>) -> flight_buffer::ArrayBufferView {
    let length = bytes.len();
    let buffer = flight_buffer::create_array_buffer_from_bytes(bytes);
    return flight_buffer::create_array_buffer_view(
        &buffer,
        0,
        length,
        flight_buffer::ArrayBufferViewKind::Uint8Array,
    )
    .unwrap();
}
