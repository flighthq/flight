use flight_registry::*;

mod clone_ordinal_table {
    use super::*;

    #[test]
    fn returns_an_equal_independent_table() {
        let vocabulary = vec!["Tag0".to_string(), "Tag1".to_string()];
        let mut source: OrdinalTable<String> = create_ordinal_table(&vocabulary);
        source.entries[1] = Some("one".to_string());

        let mut cloned = clone_ordinal_table(&source);
        assert_eq!(cloned, source);
        cloned.entries[0] = Some("zero".to_string());
        assert!(source.entries[0].is_none());
    }
}

mod copy_ordinal_table {
    use super::*;

    #[test]
    fn replaces_the_vocabulary_and_slots_in_the_existing_out() {
        let mut source: OrdinalTable<String> = create_ordinal_table(&["Tag0".to_string()]);
        source.entries[0] = Some("zero".to_string());
        let mut out: OrdinalTable<String> =
            create_ordinal_table(&["A".to_string(), "B".to_string(), "C".to_string()]);

        copy_ordinal_table(&mut out, &source);

        assert_eq!(out, source);
    }
}

mod create_ordinal_table {
    use super::*;

    #[test]
    fn carries_the_vocabulary_through_unchanged() {
        let vocabulary = vec!["Tag0".to_string(), "Tag1".to_string()];
        let table: OrdinalTable<String> = create_ordinal_table(&vocabulary);

        assert_eq!(table.vocabulary, ["Tag0", "Tag1"]);
    }

    #[test]
    fn starts_with_every_ordinal_none_one_per_vocabulary_entry() {
        let vocabulary = vec!["Tag0".to_string(), "Tag1".to_string(), "Tag2".to_string()];
        let table: OrdinalTable<String> = create_ordinal_table(&vocabulary);

        assert_eq!(table.entries.len(), 3);
        assert!(table.entries.iter().all(Option::is_none));
    }
}

mod get_ordinal_table_entry {
    use super::*;

    #[test]
    fn indexes_directly_when_the_ordinal_is_in_range() {
        let table = OrdinalTable {
            entries: vec![Some("zero".to_string()), None],
            vocabulary: vec!["Tag0".to_string(), "Tag1".to_string()],
        };

        assert_eq!(
            get_ordinal_table_entry(&table, 0).map(String::as_str),
            Some("zero")
        );
        assert_eq!(get_ordinal_table_entry(&table, 1), None);
    }

    #[test]
    fn returns_none_out_of_range() {
        let vocabulary = vec!["Tag0".to_string()];
        let table: OrdinalTable<String> = create_ordinal_table(&vocabulary);

        assert_eq!(get_ordinal_table_entry(&table, 1), None);
        assert_eq!(get_ordinal_table_entry(&table, usize::MAX), None);
    }
}
