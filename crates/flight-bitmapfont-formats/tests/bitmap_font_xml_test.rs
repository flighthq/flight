use std::sync::{Arc, Mutex};

use flight_bitmapfont::{
    get_bitmap_font_glyph, get_bitmap_font_kerning, get_bitmap_font_metrics, get_bitmap_font_page,
};
use flight_bitmapfont_formats::*;

use crate::support::*;

#[test]
fn xml_parses_well_formed_font_silently_with_exact_mapping() {
    let guard = guard_state();
    let page = atlas();
    let expected = page.clone();
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
    };
    let mut diagnostics = Vec::new();
    let font =
        parse_bitmap_font_xml(&guard, FNT_XML, Some(&options), Some(&mut diagnostics)).unwrap();
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
fn xml_passes_page_id_and_file_to_resolver() {
    let guard = guard_state();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let captured = seen.clone();
    let page = atlas();
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |id, file| {
            captured.lock().unwrap().push((id, file.to_string()));
            Some(page.clone())
        })),
    };
    assert!(parse_bitmap_font_xml(&guard, FNT_XML, Some(&options), None).is_some());
    assert_eq!(*seen.lock().unwrap(), vec![(0, "test_0.png".to_string())]);
}

#[test]
fn xml_rejects_malformed_missing_required_and_unresolved_documents() {
    let guard = guard_state();
    assert!(
        parse_bitmap_font_xml(
            &guard,
            "<font><common/></font>",
            Some(&page_options()),
            None,
        )
        .is_none()
    );
    assert!(parse_bitmap_font_xml(&guard, "not xml at all", Some(&page_options()), None).is_none());
    assert!(parse_bitmap_font_xml(&guard, FNT_XML, None, None).is_none());
}

#[test]
fn xml_defaults_optional_page_and_file_attributes() {
    let guard = guard_state();
    let text = concat!(
        "<font><common lineHeight=\"10\" base=\"8\"/>",
        "<pages><page id=\"0\"/></pages>",
        "<chars><char id=\"65\" x=\"0\" y=\"0\" width=\"1\" height=\"1\" xoffset=\"0\" yoffset=\"0\" xadvance=\"1\"/></chars>",
        "</font>"
    );
    assert!(parse_bitmap_font_xml(&guard, text, Some(&page_options()), None).is_some());
}

mod parse_bitmap_font_xml {
    use super::*;

    #[test]
    fn exposes_the_xml_front_end() {
        assert!(parse_bitmap_font_xml(&guard_state(), "", None, None).is_none());
    }
}
