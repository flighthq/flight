use std::sync::Arc;

use flight_entity::*;

fn empty_record<V>() -> Record<V> {
    let construct: fn() -> Record<V> = Default::default;
    return construct();
}

fn record_with_pairs<V>(pairs: Vec<(&str, V)>) -> Record<V> {
    let mut record = empty_record();
    for (key, value) in pairs {
        set_record_value(&mut record, key.to_string(), value);
    }
    return record;
}

mod delete_record_value {
    use super::*;

    #[test]
    fn removes_present_keys_and_reports_absent_keys() {
        let mut record = record_with_pairs(vec![("a", 1), ("b", 2)]);
        assert!(delete_record_value(&mut record, "a"));
        assert!(!delete_record_value(&mut record, "a"));
        assert_eq!(get_record_value(&record, "a"), None);
        assert_eq!(get_record_value(&record, "b"), Some(&2));
    }

    #[test]
    fn reindexes_every_shifted_entry_after_deletion() {
        let mut record = record_with_pairs(vec![("a", 1), ("b", 2), ("c", 3), ("d", 4)]);
        assert!(delete_record_value(&mut record, "b"));
        assert_eq!(get_record_value(&record, "c"), Some(&3));
        assert_eq!(get_record_value(&record, "d"), Some(&4));
        assert_eq!(get_record_keys(&record), ["a", "c", "d"]);
    }

    #[test]
    fn reinserting_an_ordinary_key_moves_it_to_the_end() {
        let mut record = record_with_pairs(vec![("a", 1), ("b", 2)]);
        assert!(delete_record_value(&mut record, "a"));
        set_record_value(&mut record, "a".to_string(), 3);
        assert_eq!(get_record_keys(&record), ["b", "a"]);
    }
}

mod entries {
    use super::*;

    #[test]
    fn returns_values_in_the_same_javascript_order_as_keys() {
        let record = record_with_pairs(vec![("later", 1), ("2", 2), ("0", 3), ("last", 4)]);
        let actual: Vec<(&str, i32)> = entries(&record)
            .into_iter()
            .map(|(key, value)| (key, *value))
            .collect();
        assert_eq!(actual, [("0", 3), ("2", 2), ("later", 1), ("last", 4)]);
    }

    #[test]
    fn borrows_arbitrary_nonclone_values() {
        struct NonClone {
            value: i32,
        }
        let record = record_with_pairs(vec![("item", NonClone { value: 7 })]);
        let actual = entries(&record);
        assert_eq!(actual[0].0, "item");
        assert_eq!(actual[0].1.value, 7);
    }
}

mod get_record_keys {
    use super::*;

    #[test]
    fn matches_javascript_integer_index_boundaries_and_canonical_spelling() {
        let record = record_with_pairs(vec![
            ("b", 0),
            ("4294967295", 0),
            ("2", 0),
            ("01", 0),
            ("0", 0),
            ("4294967294", 0),
            ("1", 0),
            ("-0", 0),
            ("00", 0),
            ("3", 0),
            ("a", 0),
            ("1.0", 0),
            ("+1", 0),
            (" 1", 0),
            ("0000000001", 0),
        ]);
        assert_eq!(
            get_record_keys(&record),
            [
                "0",
                "1",
                "2",
                "3",
                "4294967294",
                "b",
                "4294967295",
                "01",
                "-0",
                "00",
                "a",
                "1.0",
                "+1",
                " 1",
                "0000000001",
            ]
        );
    }

    #[test]
    fn empty_records_have_no_keys() {
        let record = empty_record::<String>();
        assert!(get_record_keys(&record).is_empty());
        assert!(entries(&record).is_empty());
    }
}

mod get_record_value {
    use super::*;

    #[test]
    fn distinguishes_explicit_unknown_null_from_missing() {
        let mut record: Record<Unknown> = empty_record();
        set_record_value(&mut record, "null".to_string(), None);
        assert!(has_record_key(&record, "null"));
        assert!(get_record_value(&record, "null").is_some());
        assert!(get_record_value(&record, "null").unwrap().is_none());
        assert!(get_record_value(&record, "missing").is_none());
    }

    #[test]
    fn preserves_unknown_object_identity() {
        let shared: Arc<dyn std::any::Any + Send + Sync> = Arc::new(String::from("shared"));
        let mut record: Record<Unknown> = empty_record();
        set_record_value(&mut record, "value".to_string(), Some(shared.clone()));
        let stored = get_record_value(&record, "value")
            .and_then(Option::as_ref)
            .unwrap();
        assert!(Arc::ptr_eq(stored, &shared));
    }

    #[test]
    fn keeps_optional_unknown_absence_distinct_from_explicit_null() {
        let absent: Option<Unknown> = None;
        let explicit_null: Option<Unknown> = Some(None);
        assert!(absent.is_none());
        assert!(explicit_null.is_some());
        assert!(explicit_null.unwrap().is_none());
    }
}

mod has_record_key {
    use super::*;

    #[test]
    fn follows_insertions_and_deletions() {
        let mut record = empty_record();
        assert!(!has_record_key(&record, "item"));
        set_record_value(&mut record, "item".to_string(), 1);
        assert!(has_record_key(&record, "item"));
        assert!(delete_record_value(&mut record, "item"));
        assert!(!has_record_key(&record, "item"));
    }
}

mod set_record_value {
    use super::*;

    #[test]
    fn replaces_without_duplicating_or_moving_an_existing_key() {
        let mut record = record_with_pairs(vec![("a", 1), ("b", 2)]);
        set_record_value(&mut record, "a".to_string(), 3);
        assert_eq!(get_record_value(&record, "a"), Some(&3));
        assert_eq!(get_record_keys(&record), ["a", "b"]);
        assert_eq!(entries(&record).len(), 2);
    }

    #[test]
    fn reinserted_integer_indices_return_to_numeric_order() {
        let mut record = record_with_pairs(vec![("10", 10), ("2", 2), ("ordinary", 0)]);
        assert!(delete_record_value(&mut record, "2"));
        set_record_value(&mut record, "2".to_string(), 22);
        assert_eq!(get_record_keys(&record), ["2", "10", "ordinary"]);
        assert_eq!(get_record_value(&record, "2"), Some(&22));
    }
}
