use flight_font_formats::*;

fn font_records(records: &[(&str, u32, u32)]) -> Vec<u8> {
    let mut bytes = vec![0; 12 + records.len() * 16];
    bytes[..4].copy_from_slice(&0x00010000u32.to_be_bytes());
    bytes[4..6].copy_from_slice(&(records.len() as u16).to_be_bytes());
    for (index, (tag, offset, length)) in records.iter().enumerate() {
        let record = 12 + index * 16;
        bytes[record..record + 4].copy_from_slice(tag.as_bytes());
        bytes[record + 8..record + 12].copy_from_slice(&offset.to_be_bytes());
        bytes[record + 12..record + 16].copy_from_slice(&length.to_be_bytes());
    }
    return bytes;
}

mod read_sfnt_table_directory {
    use super::*;

    #[test]
    fn reads_every_table_a_well_formed_synthetic_font_declares() {
        let font = create_synthetic_font(None);
        let directory = read_sfnt_table_directory(&font).unwrap();
        assert!(directory.tables.contains_key("glyf"));
        assert!(directory.tables.contains_key("cmap"));
        assert_eq!(directory.declared_table_count, directory.tables.len());
    }

    #[test]
    fn reports_both_container_flavors_from_the_sfnt_version() {
        let quadratic = create_synthetic_font(None);
        let cff = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..crate::support::font_options()
        }));
        assert_eq!(
            read_sfnt_table_directory(&quadratic).unwrap().sfnt_version,
            0x00010000
        );
        assert_eq!(
            read_sfnt_table_directory(&cff).unwrap().sfnt_version,
            0x4f54544f
        );
    }

    #[test]
    fn gives_each_synthetic_table_a_range_inside_the_file() {
        let font = create_synthetic_font(None);
        let directory = read_sfnt_table_directory(&font).unwrap();
        for tag in &directory.table_order {
            let range = directory.tables.get(tag).unwrap();
            assert!(range.offset + range.length <= font.len());
        }
    }

    #[test]
    fn keeps_declared_count_when_truncation_drops_unreadable_tables() {
        let font = create_synthetic_font(None);
        let whole = read_sfnt_table_directory(&font).unwrap();
        let truncated = read_sfnt_table_directory(&font[..font.len() - 8]).unwrap();
        assert_eq!(truncated.declared_table_count, whole.declared_table_count);
        assert!(truncated.tables.len() < whole.tables.len());
    }

    #[test]
    fn returns_the_null_sentinel_for_short_or_empty_headers() {
        assert_eq!(read_sfnt_table_directory(&[0; 11]), None);
        assert_eq!(read_sfnt_table_directory(&[]), None);
    }

    #[test]
    fn stops_when_header_table_count_exceeds_present_records() {
        let mut bytes = [0; 12];
        bytes[4..6].copy_from_slice(&500u16.to_be_bytes());
        let directory = read_sfnt_table_directory(&bytes).unwrap();
        assert_eq!(directory.declared_table_count, 500);
        assert!(directory.tables.is_empty());
    }

    #[test]
    fn reads_directory_tags_version_and_declared_count() {
        let bytes = font_records(&[("glyf", 12, 0), ("cmap", 28, 0)]);
        let directory = read_sfnt_table_directory(&bytes).unwrap();
        assert!(directory.tables.contains_key("glyf"));
        assert!(directory.tables.contains_key("cmap"));
        assert_eq!(directory.declared_table_count, directory.tables.len());
        assert_eq!(directory.sfnt_version, 0x00010000);
    }

    #[test]
    fn drops_ranges_past_the_actual_buffer_and_stops_before_incomplete_records() {
        let mut bytes = font_records(&[("good", 12, 4), ("bad!", 99, 1)]);
        bytes[4..6].copy_from_slice(&3u16.to_be_bytes());
        let directory = read_sfnt_table_directory(&bytes).unwrap();
        assert_eq!(directory.tables.len(), 1);
        assert_eq!(directory.declared_table_count, 3);
        assert_eq!(
            directory.tables.get("good"),
            Some(&SfntTableRange {
                offset: 12,
                length: 4
            })
        );
    }

    #[test]
    fn returns_null_only_when_the_header_cannot_be_read() {
        assert_eq!(read_sfnt_table_directory(&[0; 11]), None);
        let mut header = vec![0; 12];
        header[4..6].copy_from_slice(&500u16.to_be_bytes());
        let directory = read_sfnt_table_directory(&header).unwrap();
        assert_eq!(directory.declared_table_count, 500);
        assert!(directory.tables.is_empty());
    }

    #[test]
    fn preserves_first_insertion_order_and_last_duplicate_values_in_sliced_storage() {
        let inner = font_records(&[
            ("0002", 12, 0),
            ("0001", 13, 0),
            ("0002", 14, 0),
            ("CFF ", 15, 0),
        ]);
        let mut backing = vec![11, 22];
        backing.extend_from_slice(&inner);
        let directory = read_sfnt_table_directory(&backing[2..]).unwrap();
        assert_eq!(directory.table_order, ["0002", "0001", "CFF "]);
        assert_eq!(directory.tables.get("0002").unwrap().offset, 14);
    }
}

mod read_sfnt_tag {
    use super::*;

    #[test]
    fn reads_the_four_bytes_as_literal_characters() {
        assert_eq!(read_sfnt_tag(&[0x67, 0x6c, 0x79, 0x66], 0), "glyf");
    }
    #[test]
    fn preserves_significant_trailing_space() {
        assert_eq!(read_sfnt_tag(&[0x43, 0x46, 0x46, 0x20], 0), "CFF ");
    }
    #[test]
    fn reads_at_the_given_offset() {
        assert_eq!(read_sfnt_tag(&[0, 0, 0x68, 0x65, 0x61, 0x64], 2), "head");
    }

    #[test]
    fn reads_four_characters_at_the_given_offset_and_preserves_spaces() {
        assert_eq!(read_sfnt_tag(b"glyfCFF ", 0), "glyf");
        assert_eq!(read_sfnt_tag(b"glyfCFF ", 4), "CFF ");
    }

    #[test]
    fn missing_indexed_bytes_follow_from_char_code_zero_coercion() {
        assert_eq!(read_sfnt_tag(b"a", 0), "a\0\0\0");
    }
}
