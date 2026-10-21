use std::collections::HashMap;

use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d_formats::contract::*;

const PATH: u64 = 12;
const RECTANGLE: u64 = 7;
const SHAPE: u64 = 3;

mod collect_rive_core_type_counts {
    use super::*;

    #[test]
    fn counts_each_core_type_present() {
        let mut counts = HashMap::new();
        assert!(collect_rive_core_type_counts(
            &mut counts,
            &rive_file(&[SHAPE, PATH, PATH, RECTANGLE], 7),
            None,
        ));
        assert_eq!(counts.get(&SHAPE), Some(&1));
        assert_eq!(counts.get(&PATH), Some(&2));
        assert_eq!(counts.get(&RECTANGLE), Some(&1));
    }

    #[test]
    fn reports_why_through_the_diagnostics_it_is_handed() {
        let mut counts = HashMap::new();
        let mut diagnostics = Vec::new();
        assert!(!collect_rive_core_type_counts(
            &mut counts,
            &rive_file(&[], 6),
            Some(&mut diagnostics),
        ));
        assert!(
            diagnostic_kinds(&diagnostics)
                .iter()
                .any(|kind| *kind == "rive.unsupported-version")
        );
    }

    #[test]
    fn returns_an_empty_map_for_a_readable_file_that_declares_no_objects() {
        let mut counts = HashMap::from([(999, 4)]);
        assert!(collect_rive_core_type_counts(
            &mut counts,
            &rive_file(&[], 7),
            None,
        ));
        assert!(counts.is_empty());
    }

    #[test]
    fn returns_false_for_an_unreadable_file() {
        for bytes in [
            vec![0x4e, 0x4f, 0x50, 0x45, 7, 0, 0],
            rive_file(&[], 6),
            vec![0x52, 0x49, 0x56, 0x45],
        ] {
            let mut counts = HashMap::from([(SHAPE, 1)]);
            assert!(!collect_rive_core_type_counts(&mut counts, &bytes, None));
            assert!(counts.is_empty());
        }
    }
}

mod is_readable_rive {
    use super::*;

    #[test]
    fn calls_an_empty_document_readable() {
        assert!(is_readable_rive(&rive_file(&[], 7)));
    }

    #[test]
    fn separates_a_readable_file_from_one_this_reader_cannot_traverse() {
        assert!(is_readable_rive(&rive_file(&[SHAPE], 7)));
        assert!(!is_readable_rive(&rive_file(&[], 6)));
        assert!(!is_readable_rive(&[0x4e, 0x4f, 0x50, 0x45]));
    }
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn encode_var_uint(value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut remaining = value;
    loop {
        let group = (remaining % 128) as u8;
        remaining /= 128;
        bytes.push(if remaining > 0 { group | 0x80 } else { group });
        if remaining == 0 {
            return bytes;
        }
    }
}

fn rive_file(type_keys: &[u64], major: u64) -> Vec<u8> {
    let mut bytes = vec![0x52, 0x49, 0x56, 0x45];
    bytes.extend(encode_var_uint(major));
    bytes.extend(encode_var_uint(0));
    bytes.extend(encode_var_uint(0));
    bytes.push(0);
    for type_key in type_keys {
        bytes.extend(encode_var_uint(*type_key));
        bytes.push(0);
    }
    return bytes;
}
