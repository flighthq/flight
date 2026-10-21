use crate::support::font_options;
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_font_formats::*;

fn view(bytes: &[u8]) -> ArrayBufferView {
    let buffer = create_array_buffer_from_bytes(bytes.to_vec().into_boxed_slice());
    return create_array_buffer_view(&buffer, 0, bytes.len(), ArrayBufferViewKind::DataView)
        .unwrap();
}
fn two_subtables(wider_format: u16) -> Vec<u8> {
    let mut table = vec![0; 32];
    for (at, value) in [
        (2, 2u16),
        (4, 3),
        (6, 1),
        (12, 3),
        (14, 10),
        (20, 4),
        (24, wider_format),
    ] {
        table[at..at + 2].copy_from_slice(&value.to_be_bytes());
    }
    table[8..12].copy_from_slice(&20u32.to_be_bytes());
    table[16..20].copy_from_slice(&24u32.to_be_bytes());
    return table;
}
fn font_with_mappings() -> Box<[u8]> {
    return create_synthetic_font(Some(&SyntheticFontOptions {
        codepoints: Some(vec![(65.0, 1.0), (66.0, 2.0), (0x4e2d as f32, 3.0)]),
        ..font_options()
    }));
}

mod find_open_type_unicode_subtable {
    use super::*;
    #[test]
    fn finds_the_declared_subtable() {
        let font = font_with_mappings();
        let directory = read_sfnt_table_directory(&font).unwrap();
        let cmap = directory.tables.get("cmap").unwrap();
        assert!(
            find_open_type_unicode_subtable(&view(&font), cmap.offset, cmap.length, font.len())
                > cmap.offset as i32
        );
    }
    #[test]
    fn returns_negative_one_when_no_unicode_mapping_is_declared() {
        let mut font = font_with_mappings();
        let directory = read_sfnt_table_directory(&font).unwrap();
        let cmap = directory.tables.get("cmap").unwrap();
        font[cmap.offset + 4..cmap.offset + 6].copy_from_slice(&1u16.to_be_bytes());
        font[cmap.offset + 6..cmap.offset + 8].copy_from_slice(&0u16.to_be_bytes());
        assert_eq!(
            find_open_type_unicode_subtable(&view(&font), cmap.offset, cmap.length, font.len()),
            -1
        );
    }
    #[test]
    fn skips_unreadable_wider_repertoire_formats() {
        let bytes = two_subtables(0);
        assert_eq!(
            find_open_type_unicode_subtable(&view(&bytes), 0, bytes.len(), bytes.len()),
            20
        );
    }
    #[test]
    fn prefers_a_readable_wider_repertoire_subtable() {
        let bytes = two_subtables(12);
        assert_eq!(
            find_open_type_unicode_subtable(&view(&bytes), 0, bytes.len(), bytes.len()),
            24
        );
    }
    #[test]
    fn reads_dataview_offsets_and_retains_first_equal_rank_choice() {
        let bytes = two_subtables(4);
        let mut storage = vec![91, 92, 93];
        storage.extend_from_slice(&bytes);
        let buffer = create_array_buffer_from_bytes(storage.into_boxed_slice());
        let view = create_array_buffer_view(&buffer, 3, bytes.len(), ArrayBufferViewKind::DataView)
            .unwrap();
        assert_eq!(
            find_open_type_unicode_subtable(&view, 0, bytes.len(), bytes.len()),
            24
        );
        let storage = flight_buffer::get_array_buffer_storage(&buffer);
        storage.write().unwrap()[3 + 14..3 + 16].copy_from_slice(&1u16.to_be_bytes());
        assert_eq!(
            find_open_type_unicode_subtable(&view, 0, bytes.len(), bytes.len()),
            20
        );
    }
}

mod rank_open_type_unicode_encoding {
    use super::*;
    #[test]
    fn ranks_full_repertoire_above_basic_multilingual_mappings() {
        assert!(rank_open_type_unicode_encoding(3, 10) > rank_open_type_unicode_encoding(3, 1));
        assert!(rank_open_type_unicode_encoding(0, 4) > rank_open_type_unicode_encoding(0, 3));
    }
    #[test]
    fn rejects_platforms_that_are_not_unicode_mappings() {
        assert_eq!(rank_open_type_unicode_encoding(1, 0), -1);
        assert_eq!(rank_open_type_unicode_encoding(3, 0), -1);
    }
}

mod read_open_type_codepoint_map {
    use super::*;
    #[test]
    fn maps_every_stated_codepoint() {
        let font = font_with_mappings();
        let map = read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
            .unwrap();
        assert_eq!(map.get(&65), Some(&1));
        assert_eq!(map.get(&66), Some(&2));
        assert_eq!(map.get(&0x4e2d), Some(&3));
    }
    #[test]
    fn omits_uncovered_codepoints_instead_of_mapping_them_to_zero() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            codepoints: Some(vec![(65.0, 1.0)]),
            ..font_options()
        }));
        let map = read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
            .unwrap();
        assert!(!map.contains_key(&66));
        assert_eq!(map.len(), 1);
    }
    #[test]
    fn does_not_map_the_required_terminator_segment() {
        let font = font_with_mappings();
        assert!(
            !read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
                .unwrap()
                .contains_key(&0xffff)
        );
    }
    #[test]
    fn returns_null_without_cmap() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            omit_table: Some("cmap".to_string()),
            ..font_options()
        }));
        assert!(
            read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
                .is_none()
        );
    }
    #[test]
    fn returns_null_for_an_unreadable_subtable_format() {
        let mut font = font_with_mappings();
        let directory = read_sfnt_table_directory(&font).unwrap();
        let cmap = directory.tables.get("cmap").unwrap();
        let relative =
            u32::from_be_bytes(font[cmap.offset + 8..cmap.offset + 12].try_into().unwrap())
                as usize;
        font[cmap.offset + relative..cmap.offset + relative + 2]
            .copy_from_slice(&6u16.to_be_bytes());
        assert!(read_open_type_codepoint_map(&font, &directory).is_none());
    }
    #[test]
    fn reads_format_twelve_groups_above_the_bmp_and_skips_zero_glyphs() {
        let mut cmap = vec![0; 52];
        cmap[2..4].copy_from_slice(&1u16.to_be_bytes());
        cmap[4..6].copy_from_slice(&3u16.to_be_bytes());
        cmap[6..8].copy_from_slice(&10u16.to_be_bytes());
        cmap[8..12].copy_from_slice(&12u32.to_be_bytes());
        cmap[12..14].copy_from_slice(&12u16.to_be_bytes());
        cmap[24..28].copy_from_slice(&2u32.to_be_bytes());
        for (at, value) in [
            (28, 0x1f600u32),
            (32, 0x1f601),
            (36, 7),
            (40, 1),
            (44, 2),
            (48, 0),
        ] {
            cmap[at..at + 4].copy_from_slice(&value.to_be_bytes());
        }
        let font = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: cmap.into_boxed_slice(),
                tag: pack_sfnt_tag("cmap"),
            }],
        );
        let map = read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
            .unwrap();
        assert_eq!(map.get(&0x1f600), Some(&7));
        assert_eq!(map.get(&0x1f601), Some(&8));
        assert!(!map.contains_key(&1));
        assert_eq!(map.get(&2), Some(&1));
    }
    #[test]
    fn range_offsets_are_relative_to_their_own_slot_and_raw_zero_stays_absent() {
        let mut cmap = vec![0; 46];
        for (at, value) in [
            (2, 1u16),
            (4, 3),
            (6, 1),
            (12, 4),
            (18, 4),
            (26, 66),
            (28, 65535),
            (32, 65),
            (34, 65535),
            (36, 1),
            (38, 1),
            (40, 4),
            (42, 0),
            (44, 0),
        ] {
            cmap[at..at + 2].copy_from_slice(&value.to_be_bytes());
        }
        cmap[8..12].copy_from_slice(&12u32.to_be_bytes());
        // The first glyph slot is 44; a second slot is appended and its delta applies only there.
        cmap.extend_from_slice(&9u16.to_be_bytes());
        let font = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: cmap.into_boxed_slice(),
                tag: pack_sfnt_tag("cmap"),
            }],
        );
        let map = read_open_type_codepoint_map(&font, &read_sfnt_table_directory(&font).unwrap())
            .unwrap();
        assert!(!map.contains_key(&65));
        assert_eq!(map.get(&66), Some(&10));
    }
}
