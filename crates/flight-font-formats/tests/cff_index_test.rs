use flight_font_formats::*;

fn build_index(entries: &[&str], off_size: usize) -> Vec<u8> {
    if entries.is_empty() {
        return vec![0, 0];
    }
    let mut offsets = vec![1usize];
    for entry in entries {
        offsets.push(offsets[offsets.len() - 1] + entry.len());
    }
    let mut bytes = vec![0; 3 + offsets.len() * off_size];
    bytes[..2].copy_from_slice(&(entries.len() as u16).to_be_bytes());
    bytes[2] = off_size as u8;
    for (index, offset) in offsets.iter().enumerate() {
        for byte in 0..off_size {
            bytes[3 + index * off_size + byte] = (offset >> (8 * (off_size - 1 - byte))) as u8;
        }
    }
    for entry in entries {
        bytes.extend_from_slice(entry.as_bytes());
    }
    return bytes;
}

fn entry_texts(bytes: &[u8], index: &CffIndex) -> Vec<String> {
    return index
        .entries
        .iter()
        .map(|entry| String::from_utf8(bytes[entry.start..entry.end].to_vec()).unwrap())
        .collect();
}

mod read_cff_index {
    use super::*;

    #[test]
    fn carves_the_data_into_one_range_per_entry() {
        let bytes = build_index(&["alpha", "be", "gamma"], 1);
        let index = read_cff_index(&bytes, 0).unwrap();
        assert_eq!(index.entries.len(), 3);
        assert_eq!(entry_texts(&bytes, &index), ["alpha", "be", "gamma"]);
    }

    #[test]
    fn reports_the_byte_just_past_itself() {
        let bytes = build_index(&["alpha", "be"], 1);
        assert_eq!(read_cff_index(&bytes, 0).unwrap().end_offset, bytes.len());
    }

    #[test]
    fn reads_an_empty_index_as_two_bytes_and_no_entries() {
        assert_eq!(
            read_cff_index(&[0, 0, 255], 0),
            Some(CffIndex {
                end_offset: 2,
                entries: vec![]
            })
        );
    }

    #[test]
    fn reads_multibyte_offsets() {
        let bytes = build_index(&["alpha", "be"], 3);
        assert_eq!(
            entry_texts(&bytes, &read_cff_index(&bytes, 0).unwrap()),
            ["alpha", "be"]
        );
    }

    #[test]
    fn preserves_a_legitimately_empty_entry() {
        let bytes = build_index(&["a", "", "c"], 1);
        let index = read_cff_index(&bytes, 0).unwrap();
        assert_eq!(index.entries.len(), 3);
        assert_eq!(entry_texts(&bytes, &index)[1], "");
    }

    #[test]
    fn reads_an_index_that_does_not_start_at_byte_zero() {
        let mut bytes = vec![0; 4];
        bytes.extend_from_slice(&build_index(&["x"], 1));
        assert_eq!(
            entry_texts(&bytes, &read_cff_index(&bytes, 4).unwrap()),
            ["x"]
        );
    }

    #[test]
    fn returns_null_when_the_first_offset_is_not_one() {
        let mut bytes = build_index(&["alpha"], 1);
        bytes[3] = 2;
        assert_eq!(read_cff_index(&bytes, 0), None);
    }

    #[test]
    fn returns_null_for_offsets_that_run_backwards() {
        let mut bytes = build_index(&["alpha", "be"], 1);
        bytes[5] = 1;
        assert_eq!(read_cff_index(&bytes, 0), None);
    }

    #[test]
    fn returns_null_for_an_undefined_offset_width() {
        let mut bytes = build_index(&["alpha"], 1);
        bytes[2] = 9;
        assert_eq!(read_cff_index(&bytes, 0), None);
    }

    #[test]
    fn returns_null_for_truncated_payloads_and_headers() {
        let bytes = build_index(&["alpha", "be"], 1);
        assert_eq!(read_cff_index(&bytes[..bytes.len() - 4], 0), None);
        assert_eq!(read_cff_index(&[0], 0), None);
    }

    #[test]
    fn sliced_storage_uses_view_relative_ranges_and_preserves_source_bytes() {
        let inner = build_index(&["view"], 2);
        let mut storage = vec![55, 66];
        storage.extend_from_slice(&inner);
        storage.push(77);
        let view = &storage[2..storage.len() - 1];
        assert_eq!(
            entry_texts(view, &read_cff_index(view, 0).unwrap()),
            ["view"]
        );
        assert_eq!(view, inner);
    }

    #[test]
    fn nonempty_count_without_offset_size_keeps_the_dataview_range_error() {
        let thrown = std::panic::catch_unwind(|| read_cff_index(&[0, 1], 0)).unwrap_err();
        let error = thrown.downcast::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
    }
}
