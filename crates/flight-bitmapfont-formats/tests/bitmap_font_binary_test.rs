use std::sync::Arc;

use flight_bitmapfont::{get_bitmap_font_glyph, get_bitmap_font_kerning};
use flight_bitmapfont_formats::*;

use crate::support::*;

struct BinaryOptions {
    chars: Option<Vec<BitmapFontCharRecord>>,
    common: Option<(u16, u16)>,
    kernings: Option<Vec<BitmapFontKerningRecord>>,
    pages: Option<Vec<BitmapFontPageRecord>>,
}

fn empty_binary_options() -> BinaryOptions {
    return BinaryOptions {
        chars: None,
        common: None,
        kernings: None,
        pages: None,
    };
}

fn build_binary_font(options: BinaryOptions) -> Vec<u8> {
    let mut blocks = Vec::new();
    if let Some((base, line_height)) = options.common {
        let mut data = vec![0; 15];
        data[0..2].copy_from_slice(&line_height.to_le_bytes());
        data[2..4].copy_from_slice(&base.to_le_bytes());
        blocks.push(make_block(2, &data));
    }
    if let Some(pages) = options.pages {
        let mut data = Vec::new();
        for page in pages {
            data.extend(page.file.bytes());
            data.push(0);
        }
        if !data.is_empty() {
            blocks.push(make_block(3, &data));
        }
    }
    if let Some(chars) = options.chars {
        let mut data = vec![0; chars.len() * 20];
        for (index, character) in chars.iter().enumerate() {
            let offset = index * 20;
            data[offset..offset + 4].copy_from_slice(&character.id.to_le_bytes());
            data[offset + 4..offset + 6].copy_from_slice(&(character.x as u16).to_le_bytes());
            data[offset + 6..offset + 8].copy_from_slice(&(character.y as u16).to_le_bytes());
            data[offset + 8..offset + 10].copy_from_slice(&(character.width as u16).to_le_bytes());
            data[offset + 10..offset + 12]
                .copy_from_slice(&(character.height as u16).to_le_bytes());
            data[offset + 12..offset + 14]
                .copy_from_slice(&(character.xoffset as i16).to_le_bytes());
            data[offset + 14..offset + 16]
                .copy_from_slice(&(character.yoffset as i16).to_le_bytes());
            data[offset + 16..offset + 18]
                .copy_from_slice(&(character.xadvance as i16).to_le_bytes());
            data[offset + 18] = character.page as u8;
        }
        blocks.push(make_block(4, &data));
    }
    if let Some(kernings) = options.kernings {
        let mut data = vec![0; kernings.len() * 10];
        for (index, pair) in kernings.iter().enumerate() {
            let offset = index * 10;
            data[offset..offset + 4].copy_from_slice(&pair.first.to_le_bytes());
            data[offset + 4..offset + 8].copy_from_slice(&pair.second.to_le_bytes());
            data[offset + 8..offset + 10].copy_from_slice(&(pair.amount as i16).to_le_bytes());
        }
        if !data.is_empty() {
            blocks.push(make_block(5, &data));
        }
    }
    let mut out = vec![66, 77, 70, 3];
    for block in blocks {
        out.extend(block);
    }
    return out;
}

fn make_block(kind: u8, data: &[u8]) -> Vec<u8> {
    let mut out = vec![kind];
    out.extend((data.len() as u32).to_le_bytes());
    out.extend(data);
    return out;
}

fn character(id: u32, page: i32, xoffset: i32, yoffset: i32) -> BitmapFontCharRecord {
    return BitmapFontCharRecord {
        height: 10,
        id,
        page,
        width: 8,
        x: 0,
        xadvance: 10.0,
        xoffset,
        y: 0,
        yoffset,
    };
}

#[test]
fn rejects_empty_wrong_header_and_missing_required_blocks() {
    let guard = guard_state();
    assert!(parse_bitmap_font_binary(&guard, &[], None, None).is_none());
    assert!(parse_bitmap_font_binary(&guard, &[0, 0, 0, 3], None, None).is_none());
    assert!(parse_bitmap_font_binary(&guard, &[66, 77, 70, 2], None, None).is_none());
    let no_common = build_binary_font(BinaryOptions {
        chars: Some(vec![character(65, 0, 0, 0)]),
        ..empty_binary_options()
    });
    assert!(parse_bitmap_font_binary(&guard, &no_common, None, None).is_none());
    let no_chars = build_binary_font(BinaryOptions {
        common: Some((24, 32)),
        ..empty_binary_options()
    });
    assert!(parse_bitmap_font_binary(&guard, &no_chars, None, None).is_none());
}

#[test]
fn parses_minimal_binary_metrics_glyph_and_negative_offsets() {
    let guard = guard_state();
    let bytes = build_binary_font(BinaryOptions {
        chars: Some(vec![character(65, 0, -3, -1)]),
        common: Some((24, 32)),
        pages: Some(vec![BitmapFontPageRecord {
            file: "font.png".to_string(),
            id: 0,
        }]),
        ..empty_binary_options()
    });
    let font = parse_bitmap_font_binary(&guard, &bytes, Some(&page_options()), None).unwrap();
    let glyph = get_bitmap_font_glyph(&font, 65).unwrap();
    let glyph = glyph.read().unwrap();
    assert_eq!(glyph.width, 8);
    assert_eq!(glyph.advance, 10.0);
    assert_eq!(glyph.bearing_x, -3);
    assert_eq!(glyph.bearing_y, 25);
}

#[test]
fn parses_kernings_and_multiple_pages() {
    let guard = guard_state();
    let bytes = build_binary_font(BinaryOptions {
        chars: Some(vec![character(65, 0, 0, 0), character(66, 1, 0, 0)]),
        common: Some((24, 32)),
        kernings: Some(vec![BitmapFontKerningRecord {
            amount: -2.0,
            first: 65,
            second: 86,
        }]),
        pages: Some(vec![
            BitmapFontPageRecord {
                file: "font0.png".to_string(),
                id: 0,
            },
            BitmapFontPageRecord {
                file: "font1.png".to_string(),
                id: 1,
            },
        ]),
    });
    let font = parse_bitmap_font_binary(&guard, &bytes, Some(&page_options()), None).unwrap();
    assert_eq!(font.read().unwrap().pages.len(), 2);
    assert_eq!(get_bitmap_font_kerning(&font, 65, 86), -2.0);
}

#[test]
fn rejects_unresolved_pages_and_tolerates_truncated_blocks() {
    let guard = guard_state();
    let bytes = build_binary_font(BinaryOptions {
        chars: Some(vec![character(65, 0, 0, 0)]),
        common: Some((24, 32)),
        pages: Some(vec![BitmapFontPageRecord {
            file: "font.png".to_string(),
            id: 0,
        }]),
        ..empty_binary_options()
    });
    assert!(parse_bitmap_font_binary(&guard, &bytes, None, None).is_none());
    let truncated = &bytes[..bytes.len() - 5];
    assert!(parse_bitmap_font_binary(&guard, truncated, Some(&page_options()), None).is_none());
}

#[test]
fn binary_resolver_receives_declared_page_file() {
    let guard = guard_state();
    let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
    let captured = seen.clone();
    let page = atlas();
    let bytes = build_binary_font(BinaryOptions {
        chars: Some(vec![character(65, 0, 0, 0)]),
        common: Some((24, 32)),
        pages: Some(vec![BitmapFontPageRecord {
            file: "font.png".to_string(),
            id: 0,
        }]),
        ..empty_binary_options()
    });
    let options = BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |id, file| {
            captured.lock().unwrap().push((id, file.to_string()));
            Some(page.clone())
        })),
    };
    assert!(parse_bitmap_font_binary(&guard, &bytes, Some(&options), None).is_some());
    assert_eq!(*seen.lock().unwrap(), vec![(0, "font.png".to_string())]);
}

mod parse_bitmap_font_binary {
    use super::*;

    #[test]
    fn exposes_the_binary_front_end() {
        assert!(parse_bitmap_font_binary(&guard_state(), &[], None, None).is_none());
    }
}
