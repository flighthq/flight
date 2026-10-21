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
