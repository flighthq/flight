use std::sync::Arc;

use flight_bitmapfont::{
    BitmapFontEncoding, get_bitmap_font_glyph, get_bitmap_font_kerning, get_bitmap_font_metrics,
    get_bitmap_font_page,
};
use flight_bitmapfont_formats::*;

use crate::support::*;

#[test]
fn json_parses_well_formed_font_silently_with_page_identity() {
    let guard = guard_state();
    let page = atlas();
    let expected = page.clone();
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
    };
    let mut diagnostics = Vec::new();
    let font =
        parse_bitmap_font_json(&guard, FNT_JSON, Some(&options), Some(&mut diagnostics)).unwrap();
    assert!(diagnostics.is_empty());
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(0)).unwrap(),
        &expected
    ));
    let glyph = get_bitmap_font_glyph(&font, 65).unwrap();
    let glyph = glyph.read().unwrap();
    assert_eq!(
        (glyph.advance, glyph.bearing_x, glyph.bearing_y),
        (9.0, 1, 21)
    );
    drop(glyph);
    assert_eq!(get_bitmap_font_kerning(&font, 65, 86), -2.0);
    let metrics = get_bitmap_font_metrics(&font);
    assert_eq!(
        (metrics.ascent, metrics.descent, metrics.line_gap),
        (26.0, 6.0, 0.0)
    );
}

#[test]
fn json_resolves_multiple_pages_and_routes_glyphs() {
    let guard = guard_state();
    let page0 = atlas();
    let page1 = atlas();
    let second = page1.clone();
    let text = r#"{
        "chars":[
          {"height":8,"id":65,"page":0,"width":7,"x":0,"xadvance":9,"xoffset":1,"y":0,"yoffset":0},
          {"height":8,"id":66,"page":1,"width":6,"x":3,"xadvance":8,"xoffset":0,"y":0,"yoffset":0}
        ],
        "common":{"base":26,"lineHeight":32},
        "kernings":[],"pages":["test_0.png","test_1.png"]
    }"#;
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |id, _file| {
            Some(if id == 0 {
                page0.clone()
            } else {
                page1.clone()
            })
        })),
    };
    let font = parse_bitmap_font_json(&guard, text, Some(&options), None).unwrap();
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(1)).unwrap(),
        &second
    ));
    assert_eq!(
        get_bitmap_font_glyph(&font, 65)
            .unwrap()
            .read()
            .unwrap()
            .page,
        0
    );
    assert_eq!(
        get_bitmap_font_glyph(&font, 66)
            .unwrap()
            .read()
            .unwrap()
            .page,
        1
    );
}

#[test]
fn json_reads_distance_field_encoding() {
    let guard = guard_state();
    for (field_type, expected) in [
        ("msdf", BitmapFontEncoding::Msdf),
        ("sdf", BitmapFontEncoding::Sdf),
        ("other", BitmapFontEncoding::Raster),
    ] {
        let text = FNT_JSON.replace(
            "\"pages\":[\"test_0.png\"]",
            &format!(
                "\"distanceField\":{{\"fieldType\":\"{field_type}\"}},\"pages\":[\"test_0.png\"]"
            ),
        );
        let font = parse_bitmap_font_json(&guard, &text, Some(&page_options()), None).unwrap();
        assert_eq!(font.read().unwrap().encoding, expected);
    }
}

#[test]
fn json_matches_text_and_xml_semantics() {
    let guard = guard_state();
    let options = page_options();
    let json = parse_bitmap_font_json(&guard, FNT_JSON, Some(&options), None).unwrap();
    let fnt = parse_bitmap_font_fnt(&guard, FNT_TEXT, Some(&options), None).unwrap();
    let xml = parse_bitmap_font_xml(&guard, FNT_XML, Some(&options), None).unwrap();
    for codepoint in [65, 86] {
        let expected = get_bitmap_font_glyph(&json, codepoint).unwrap();
        assert_eq!(
            *get_bitmap_font_glyph(&fnt, codepoint)
                .unwrap()
                .read()
                .unwrap(),
            *expected.read().unwrap()
        );
        assert_eq!(
            *get_bitmap_font_glyph(&xml, codepoint)
                .unwrap()
                .read()
                .unwrap(),
            *expected.read().unwrap()
        );
    }
    assert_eq!(get_bitmap_font_kerning(&fnt, 65, 86), -2.0);
    assert_eq!(get_bitmap_font_kerning(&xml, 65, 86), -2.0);
}

#[test]
fn json_rejects_malformed_missing_blocks_and_unresolved_pages() {
    let guard = guard_state();
    assert!(parse_bitmap_font_json(&guard, "{ not json", Some(&page_options()), None).is_none());
    assert!(parse_bitmap_font_json(&guard, "{}", Some(&page_options()), None).is_none());
    assert!(parse_bitmap_font_json(&guard, FNT_JSON, None, None).is_none());
}

#[test]
fn json_accepts_chars_object_in_property_order_and_nonstring_page_names() {
    let guard = guard_state();
    let text = r#"{
      "common":{"lineHeight":32,"base":26},
      "chars":{
        "z":{"id":90,"x":0,"y":0,"width":1,"height":1,"xoffset":0,"yoffset":0,"xadvance":1},
        "a":{"id":65,"x":1,"y":0,"width":1,"height":1,"xoffset":0,"yoffset":0,"xadvance":1}
      },
      "pages":[42]
    }"#;
    let font = parse_bitmap_font_json(&guard, text, Some(&page_options()), None).unwrap();
    assert_eq!(font.read().unwrap().glyph_order, vec![90, 65]);
}

mod parse_bitmap_font_json {
    use super::*;

    #[test]
    fn exposes_the_json_front_end() {
        assert!(parse_bitmap_font_json(&guard_state(), "", None, None).is_none());
    }
}
