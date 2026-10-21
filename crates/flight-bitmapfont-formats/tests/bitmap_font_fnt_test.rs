use std::sync::{Arc, Mutex};

use flight_bitmapfont::{
    get_bitmap_font_glyph, get_bitmap_font_kerning, get_bitmap_font_metrics, get_bitmap_font_page,
};
use flight_bitmapfont_formats::*;
use flight_importdiagnostics::ImportDiagnosticDetailValue;

use crate::support::*;

const FNT_ASTRAL: &str = concat!(
    "info face=\"Test\" size=32 unicode=1\n",
    "common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1 packed=0\n",
    "page id=0 file=\"test_0.png\"\n",
    "chars count=2\n",
    "char id=128512 x=0 y=0 width=7 height=8 xoffset=1 yoffset=0 xadvance=9 page=0 chnl=15\n",
    "char id=65 x=8 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15\n",
    "kernings count=1\n",
    "kerning first=128512 second=65 amount=-3"
);

#[test]
fn fnt_round_trips_glyphs_kernings_metrics_and_authored_order() {
    let guard = guard_state();
    let options = page_options();
    let font = parse_bitmap_font_fnt(&guard, FNT_TEXT, Some(&options), None).unwrap();
    let formatted = format_bitmap_font_fnt(&font);
    assert!(formatted.find("char id=65").unwrap() < formatted.find("char id=86").unwrap());
    assert!(formatted.contains("page id=0 file=\"\""));
    let reparsed = parse_bitmap_font_fnt(&guard, &formatted, Some(&options), None).unwrap();
    for codepoint in [65, 86] {
        let a = get_bitmap_font_glyph(&font, codepoint).unwrap();
        let b = get_bitmap_font_glyph(&reparsed, codepoint).unwrap();
        assert_eq!(*a.read().unwrap(), *b.read().unwrap());
    }
    assert_eq!(get_bitmap_font_kerning(&reparsed, 65, 86), -2.0);
    assert_eq!(
        *get_bitmap_font_metrics(&reparsed),
        *get_bitmap_font_metrics(&font)
    );
}

#[test]
fn fnt_round_trips_supplementary_plane_kerning_pair() {
    let guard = guard_state();
    let options = page_options();
    let font = parse_bitmap_font_fnt(&guard, FNT_ASTRAL, Some(&options), None).unwrap();
    let text = format_bitmap_font_fnt(&font);
    assert!(text.contains("kerning first=128512 second=65 amount=-3"));
    let reparsed = parse_bitmap_font_fnt(&guard, &text, Some(&options), None).unwrap();
    assert_eq!(get_bitmap_font_kerning(&reparsed, 0x1f600, 65), -3.0);
}

#[test]
fn fnt_parses_glyphs_metrics_kerning_and_page_identity_silently() {
    let guard = guard_state();
    let page = atlas();
    let expected = page.clone();
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
    };
    let mut diagnostics = Vec::new();
    let font =
        parse_bitmap_font_fnt(&guard, FNT_TEXT, Some(&options), Some(&mut diagnostics)).unwrap();
    assert!(diagnostics.is_empty());
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(0)).unwrap(),
        &expected
    ));
    let glyph = get_bitmap_font_glyph(&font, 65).unwrap();
    let glyph = glyph.read().unwrap();
    assert_eq!(
        (glyph.advance, glyph.bearing_x, glyph.bearing_y, glyph.width),
        (9.0, 1, 21, 7)
    );
    drop(glyph);
    assert_eq!(get_bitmap_font_kerning(&font, 65, 86), -2.0);
    assert_eq!(get_bitmap_font_kerning(&font, 86, 65), 0.0);
    let metrics = get_bitmap_font_metrics(&font);
    assert_eq!(
        (metrics.ascent, metrics.descent, metrics.line_gap),
        (26.0, 6.0, 0.0)
    );
}

#[test]
fn fnt_passes_page_ids_and_files_and_routes_multiple_pages() {
    let guard = guard_state();
    let page0 = atlas();
    let page1 = atlas();
    let first = page0.clone();
    let second = page1.clone();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let captured = seen.clone();
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |id, file| {
            captured.lock().unwrap().push((id, file.to_string()));
            Some(if id == 0 {
                page0.clone()
            } else {
                page1.clone()
            })
        })),
    };
    let font = parse_bitmap_font_fnt(&guard, FNT_MULTIPAGE, Some(&options), None).unwrap();
    assert_eq!(
        *seen.lock().unwrap(),
        vec![(0, "test_0.png".to_string()), (1, "test_1.png".to_string())]
    );
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(0)).unwrap(),
        &first
    ));
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
fn fnt_rejects_malformed_and_unresolved_documents() {
    let guard = guard_state();
    assert!(
        parse_bitmap_font_fnt(
            &guard,
            "this is not a bitmap font",
            Some(&page_options()),
            None,
        )
        .is_none()
    );
    assert!(parse_bitmap_font_fnt(&guard, FNT_TEXT, None, None).is_none());
    let missing = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(|_id, _file| None)),
    };
    assert!(parse_bitmap_font_fnt(&guard, FNT_TEXT, Some(&missing), None).is_none());
}

#[test]
fn fnt_reports_dropped_records_once_per_kind_in_source_order() {
    let guard = guard_state();
    let text = concat!(
        "common lineHeight=32 base=26\n",
        "page id=0 file=\"a.png\"\n",
        "page file=\"nopage.png\"\n",
        "char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8 page=0\n",
        "char x=0 y=0 width=8 height=8\n",
        "kerning first=65 second=66 amount=-1\n",
        "kerning first=65 amount=-1"
    );
    let mut diagnostics = Vec::new();
    assert!(
        parse_bitmap_font_fnt(&guard, text, Some(&page_options()), Some(&mut diagnostics),)
            .is_some()
    );
    assert_eq!(
        diagnostics
            .iter()
            .map(|entry| entry.kind.as_str())
            .collect::<Vec<_>>(),
        vec![
            "bmfont.page-unreadable",
            "bmfont.char-unreadable",
            "bmfont.kerning-unreadable"
        ]
    );
}

#[test]
fn fnt_aggregates_many_dropped_chars_and_stays_silent_when_clean() {
    let guard = guard_state();
    let mut text = concat!(
        "common lineHeight=32 base=26\n",
        "char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8 page=0\n"
    )
    .to_string();
    for _ in 0..5 {
        text.push_str("char x=0 y=0 width=8 height=8\n");
    }
    let mut diagnostics = Vec::new();
    parse_bitmap_font_fnt(&guard, &text, Some(&page_options()), Some(&mut diagnostics));
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap().get("records"),
        Some(&ImportDiagnosticDetailValue::Number(5.0))
    );
    diagnostics.clear();
    let font = parse_bitmap_font_fnt(
        &guard,
        FNT_MULTIPAGE,
        Some(&page_options()),
        Some(&mut diagnostics),
    )
    .unwrap();
    assert!(get_bitmap_font_glyph(&font, 65).is_some());
    assert!(diagnostics.is_empty());
}

#[test]
fn fnt_duplicate_fields_use_the_last_value_and_page_defaults_to_zero() {
    let guard = guard_state();
    let text = concat!(
        "common lineHeight=1 lineHeight=32 base=26\n",
        "page id=0 file=\"a file.png\"\n",
        "char id=65 id=66 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8"
    );
    let font = parse_bitmap_font_fnt(&guard, text, Some(&page_options()), None).unwrap();
    assert!(get_bitmap_font_glyph(&font, 65).is_none());
    assert!(get_bitmap_font_glyph(&font, 66).is_some());
    assert_eq!(get_bitmap_font_metrics(&font).ascent, 26.0);
}

mod format_bitmap_font_fnt {
    use super::*;

    #[test]
    fn emits_a_trailing_newline() {
        let guard = guard_state();
        let font = parse_bitmap_font_fnt(&guard, FNT_TEXT, Some(&page_options()), None).unwrap();
        assert!(format_bitmap_font_fnt(&font).ends_with('\n'));
    }
}

mod parse_bitmap_font_fnt {
    use super::*;

    #[test]
    fn exposes_the_text_front_end() {
        assert!(parse_bitmap_font_fnt(&guard_state(), "", None, None).is_none());
    }
}
