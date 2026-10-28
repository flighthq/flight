use std::collections::HashMap;
use std::sync::Arc;

use flight_registry::*;

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

mod concat_kind_map {
    use super::*;

    #[test]
    fn lets_an_overlay_entry_win_over_the_base() {
        let base = with_kind_map_entry(&empty_kind_map(), "a".to_string(), "base".to_string());
        let overlay =
            with_kind_map_entry(&empty_kind_map(), "a".to_string(), "overlay".to_string());

        let composed = concat_kind_map(&base, &overlay);
        assert_eq!(
            composed.entries.get("a").map(String::as_str),
            Some("overlay")
        );
    }

    #[test]
    fn preserves_base_entries_that_the_overlay_does_not_mention() {
        let base = with_kind_map_entry(&empty_kind_map(), "a".to_string(), "base".to_string());
        let overlay =
            with_kind_map_entry(&empty_kind_map(), "b".to_string(), "overlay".to_string());
        let composed = concat_kind_map(&base, &overlay);

        assert_eq!(composed.entries.get("a").map(String::as_str), Some("base"));
        assert_eq!(
            composed.entries.get("b").map(String::as_str),
            Some("overlay")
        );
    }

    #[test]
    fn retains_base_positions_and_appends_new_overlay_keys_in_order() {
        let base = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "a".to_string(), "a0".to_string()),
            "b".to_string(),
            "b0".to_string(),
        );
        let overlay = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "a".to_string(), "a1".to_string()),
            "c".to_string(),
            "c1".to_string(),
        );

        let composed = concat_kind_map(&base, &overlay);
        assert_eq!(composed.key_order, ["a", "b", "c"]);
    }
}

mod get_kind_map_keys {
    use super::*;

    #[test]
    fn clears_out_first_so_a_reused_vector_does_not_accumulate() {
        let mut out = vec!["stale".to_string()];
        get_kind_map_keys(&mut out, &empty_kind_map::<String>());

        assert!(out.is_empty());
    }

    #[test]
    fn lists_all_keys_sorted() {
        let table = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "b".to_string(), "1".to_string()),
            "a".to_string(),
            "2".to_string(),
        );
        let mut out = Vec::new();
        get_kind_map_keys(&mut out, &table);

        assert_eq!(out, ["a", "b"]);
    }

    #[test]
    fn sorts_by_utf16_code_units_like_javascript() {
        let table = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "\u{e000}".to_string(), "bmp".to_string()),
            "\u{10000}".to_string(),
            "astral".to_string(),
        );
        let mut out = Vec::new();
        get_kind_map_keys(&mut out, &table);

        assert_eq!(out, ["\u{10000}", "\u{e000}"]);
    }
}

mod with_kind_map_entry {
    use super::*;

    #[test]
    fn is_last_write_wins_for_a_key_without_moving_it() {
        let table = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "a".to_string(), "1".to_string()),
            "a".to_string(),
            "2".to_string(),
        );

        assert_eq!(table.entries.get("a").map(String::as_str), Some("2"));
        assert_eq!(table.key_order, ["a"]);
    }

    #[test]
    fn preserves_generic_callback_values() {
        let callback: Arc<dyn Fn(i32) -> i32 + Send + Sync> = Arc::new(|value| value + 1);
        let after = with_kind_map_entry(&empty_kind_map(), "callback".to_string(), callback);

        assert_eq!(after.entries["callback"](2), 3);
    }

    #[test]
    fn returns_a_replacement_and_mutates_nothing() {
        let before: KindMap<String> = empty_kind_map();
        let after = with_kind_map_entry(&before, "a".to_string(), "v".to_string());

        assert!(before.entries.is_empty());
        assert_eq!(after.entries.get("a").map(String::as_str), Some("v"));
        assert_ne!(
            &after as *const KindMap<String>,
            &before as *const KindMap<String>
        );
    }
}

mod without_kind_map_entry {
    use super::*;

    #[test]
    fn does_not_mutate_the_table_it_was_given() {
        let before = with_kind_map_entry(&empty_kind_map(), "a".to_string(), "v".to_string());
        let after = without_kind_map_entry(&before, "a".to_string());

        assert_eq!(before.entries.get("a").map(String::as_str), Some("v"));
        assert!(after.entries.is_empty());
    }

    #[test]
    fn removes_the_key_from_the_result() {
        let table = without_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "a".to_string(), "v".to_string()),
            "a".to_string(),
        );

        assert!(!table.entries.contains_key("a"));
        assert!(table.key_order.is_empty());
    }

    #[test]
    fn reinserting_a_removed_key_appends_it_at_the_end() {
        let before = with_kind_map_entry(
            &with_kind_map_entry(&empty_kind_map(), "a".to_string(), "1".to_string()),
            "b".to_string(),
            "2".to_string(),
        );
        let removed = without_kind_map_entry(&before, "a".to_string());
        let reinserted = with_kind_map_entry(&removed, "a".to_string(), "3".to_string());

        assert_eq!(reinserted.key_order, ["b", "a"]);
    }
}
