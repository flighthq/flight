use std::sync::Arc;

use flight_bitmapfont::{
    BitmapFontEncoding, get_bitmap_font_glyph, get_bitmap_font_kerning, get_bitmap_font_metrics,
    get_bitmap_font_page,
};
use flight_bitmapfont_formats::contract::*;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};

use crate::support::*;

fn sample_record() -> BitmapFontRecord {
    return BitmapFontRecord {
        base: 26.0,
        chars: vec![
            BitmapFontCharRecord {
                height: 8,
                id: 65,
                page: 0,
                width: 7,
                x: 0,
                xadvance: 9.0,
                xoffset: 1,
                y: 0,
                yoffset: 5,
            },
            BitmapFontCharRecord {
                height: 8,
                id: 86,
                page: 0,
                width: 6,
                x: 8,
                xadvance: 8.0,
                xoffset: 0,
                y: 0,
                yoffset: 0,
            },
        ],
        encoding: BitmapFontEncoding::Raster,
        kernings: vec![BitmapFontKerningRecord {
            amount: -2.0,
            first: 65,
            second: 86,
        }],
        line_height: 32.0,
        pages: vec![BitmapFontPageRecord {
            file: "test_0.png".to_string(),
            id: 0,
        }],
    };
}

#[test]
fn build_maps_records_and_preserves_page_identity() {
    let guard = guard_state();
    let page = atlas();
    let expected = page.clone();
    let font = build_bitmap_font_from_record(
        &guard,
        &sample_record(),
        Some(&BitmapFontParseOptions {
            resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
        }),
    )
    .unwrap();
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
    assert_eq!(get_bitmap_font_kerning(&font, 65, 86), -2.0);
    let metrics = get_bitmap_font_metrics(&font);
    assert_eq!(
        (metrics.ascent, metrics.descent, metrics.line_gap),
        (26.0, 6.0, 0.0)
    );
}

#[test]
fn build_carries_encoding_and_multiple_pages() {
    let guard = guard_state();
    let page0 = atlas();
    let page1 = atlas();
    let mut record = sample_record();
    record.encoding = BitmapFontEncoding::Sdf;
    record.pages.push(BitmapFontPageRecord {
        file: "test_1.png".to_string(),
        id: 1,
    });
    record.chars[1].page = 1;
    let first = page0.clone();
    let second = page1.clone();
    let font = build_bitmap_font_from_record(
        &guard,
        &record,
        Some(&BitmapFontParseOptions {
            resolve_page: Some(Arc::new(move |id, _file| {
                Some(if id == 0 {
                    page0.clone()
                } else {
                    page1.clone()
                })
            })),
        }),
    )
    .unwrap();
    assert_eq!(font.read().unwrap().encoding, BitmapFontEncoding::Sdf);
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(0)).unwrap(),
        &first
    ));
    assert!(Arc::ptr_eq(
        &get_bitmap_font_page(&font, Some(1)).unwrap(),
        &second
    ));
    assert_eq!(
        get_bitmap_font_glyph(&font, 86)
            .unwrap()
            .read()
            .unwrap()
            .page,
        1
    );
}

#[test]
fn build_tolerates_unreferenced_unresolved_pages() {
    let guard = guard_state();
    let page0 = atlas();
    let mut record = sample_record();
    record.pages.push(BitmapFontPageRecord {
        file: "unused.png".to_string(),
        id: 1,
    });
    let font = build_bitmap_font_from_record(
        &guard,
        &record,
        Some(&BitmapFontParseOptions {
            resolve_page: Some(Arc::new(move |id, _file| (id == 0).then(|| page0.clone()))),
        }),
    );
    assert!(font.is_some());
}

#[test]
fn build_rejects_unresolved_referenced_pages_and_missing_resolver() {
    let guard = guard_state();
    assert!(build_bitmap_font_from_record(&guard, &sample_record(), None).is_none());
    assert!(
        build_bitmap_font_from_record(
            &guard,
            &sample_record(),
            Some(&BitmapFontParseOptions {
                resolve_page: Some(Arc::new(|_id, _file| None)),
            }),
        )
        .is_none()
    );
    let mut record = sample_record();
    record.pages.clear();
    assert!(build_bitmap_font_from_record(&guard, &record, Some(&page_options())).is_none());
}

#[test]
fn reports_one_diagnostic_per_dropped_kind_in_source_order() {
    let mut diagnostics = Vec::new();
    report_dropped_bitmap_font_records(Some(&mut diagnostics), "parseSomething", 1, 7, 2);
    assert_eq!(diagnostics.len(), 3);
    assert_eq!(diagnostics[0].kind, "bmfont.page-unreadable");
    assert_eq!(diagnostics[1].kind, "bmfont.char-unreadable");
    assert_eq!(diagnostics[2].kind, "bmfont.kerning-unreadable");
    assert_eq!(diagnostics[0].origin, "parseSomething");
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
    assert_eq!(
        diagnostics[1].detail.as_ref().unwrap().get("records"),
        Some(&ImportDiagnosticDetailValue::Number(7.0))
    );
}

#[test]
fn reports_nothing_for_zero_counts_and_uses_caller_origin() {
    let mut diagnostics = Vec::new();
    report_dropped_bitmap_font_records(Some(&mut diagnostics), "parseBitmapFontXmlRecord", 0, 1, 0);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].kind, "bmfont.char-unreadable");
    assert_eq!(diagnostics[0].origin, "parseBitmapFontXmlRecord");
}

mod build_bitmap_font_from_record {
    use super::*;

    #[test]
    fn exposes_the_shared_record_builder() {
        assert!(build_bitmap_font_from_record(&guard_state(), &sample_record(), None).is_none());
    }
}

mod report_dropped_bitmap_font_records {
    use super::*;

    #[test]
    fn exposes_the_shared_drop_reporter() {
        let mut diagnostics = Vec::new();
        report_dropped_bitmap_font_records(Some(&mut diagnostics), "test", 0, 0, 0);
        assert!(diagnostics.is_empty());
    }
}
