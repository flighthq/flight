use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

use flight_entity::{FlightError, FlightErrorKind, get_record_value};
use flight_regexp::*;

fn syntax_error(run: impl FnOnce()) -> FlightError {
    let payload = catch_unwind(AssertUnwindSafe(run)).expect_err("the call must throw");
    return match payload.downcast::<FlightError>() {
        Ok(error) => *error,
        Err(_) => panic!("panic payload must be a FlightError"),
    };
}

mod create_reg_exp {
    use super::*;

    #[test]
    fn canonicalizes_flags_and_exposes_source_with_zero_last_index() {
        let expression = create_reg_exp("a/b", "ymgid");
        let expression = expression.read().unwrap();
        assert_eq!(expression.source, "a\\/b");
        assert_eq!(expression.flags, "dgimy");
        assert_eq!(expression.last_index, 0);
    }

    #[test]
    fn exposes_the_javascript_empty_and_line_terminator_sources() {
        assert_eq!(create_reg_exp("", "").read().unwrap().source, "(?:)");
        assert_eq!(
            create_reg_exp("a\nb\u{2028}c", "").read().unwrap().source,
            "a\\nb\\u2028c"
        );
        assert_eq!(create_reg_exp("[a/b]", "").read().unwrap().source, "[a/b]");
        assert_eq!(create_reg_exp("\\\n", "").read().unwrap().source, "\\n");
        assert_eq!(create_reg_exp("\\\r", "").read().unwrap().source, "\\r");
        assert_eq!(
            create_reg_exp("\\\u{2029}", "").read().unwrap().source,
            "\\u2029"
        );
    }

    #[test]
    fn returns_distinct_mutable_identities_for_equivalent_expressions() {
        let first = create_reg_exp("a", "g");
        let second = create_reg_exp("a", "g");
        assert!(!Arc::ptr_eq(&first, &second));
        first.write().unwrap().last_index = 3;
        assert_eq!(second.read().unwrap().last_index, 0);
    }

    #[test]
    fn throws_syntax_error_for_duplicate_invalid_and_incompatible_flags() {
        for flags in ["gg", "q", "uv"] {
            let error = syntax_error(|| {
                create_reg_exp("a", flags);
            });
            assert_eq!(error.kind, FlightErrorKind::SyntaxError);
        }
    }

    #[test]
    fn throws_syntax_error_for_an_invalid_pattern() {
        let error = syntax_error(|| {
            create_reg_exp("(", "");
        });
        assert_eq!(error.kind, FlightErrorKind::SyntaxError);
        assert!(error.message.contains("Invalid regular expression"));
    }
}

mod exec_reg_exp {
    use super::*;

    #[test]
    fn global_failure_resets_last_index_and_unflagged_exec_ignores_it() {
        let global = create_reg_exp("a", "g");
        global.write().unwrap().last_index = 2;
        assert!(exec_reg_exp(&global, "bb").is_none());
        assert_eq!(global.read().unwrap().last_index, 0);

        let plain = create_reg_exp("a", "");
        plain.write().unwrap().last_index = 7;
        assert_eq!(exec_reg_exp(&plain, "ba").unwrap().index, 1);
        assert_eq!(plain.read().unwrap().last_index, 7);
    }

    #[test]
    fn global_search_advances_from_the_original_shared_last_index() {
        let expression = create_reg_exp("a", "g");
        let alias = expression.clone();
        assert_eq!(exec_reg_exp(&expression, "a_a").unwrap().index, 0);
        assert_eq!(alias.read().unwrap().last_index, 1);
        assert_eq!(exec_reg_exp(&alias, "a_a").unwrap().index, 2);
        assert_eq!(expression.read().unwrap().last_index, 3);
    }

    #[test]
    fn last_index_at_and_past_the_utf16_length_follows_javascript_boundaries() {
        let at_end = create_reg_exp("(?:)", "g");
        at_end.write().unwrap().last_index = 2;
        assert_eq!(exec_reg_exp(&at_end, "😀").unwrap().index, 2);
        assert_eq!(at_end.read().unwrap().last_index, 2);

        let past_end = create_reg_exp("(?:)", "g");
        past_end.write().unwrap().last_index = 3;
        assert!(exec_reg_exp(&past_end, "😀").is_none());
        assert_eq!(past_end.read().unwrap().last_index, 0);

        let nonempty_at_end = create_reg_exp("x", "y");
        nonempty_at_end.write().unwrap().last_index = 2;
        assert!(exec_reg_exp(&nonempty_at_end, "😀").is_none());
        assert_eq!(nonempty_at_end.read().unwrap().last_index, 0);
    }

    #[test]
    fn has_indices_returns_utf16_ranges_for_matches_captures_and_named_groups() {
        let expression = create_reg_exp("(?<face>😀)(x)?", "du");
        let result = exec_reg_exp(&expression, "a😀").unwrap();
        assert_eq!(result.index, 1);
        assert_eq!(
            result.matches,
            vec![Some("😀".to_string()), Some("😀".to_string()), None]
        );
        assert_eq!(
            get_record_value(result.groups.as_ref().unwrap(), "face"),
            Some(&Some("😀".to_string()))
        );
        let indices = result.indices.unwrap();
        assert_eq!(
            indices.matches,
            vec![
                Some(RegExpMatchRange { start: 1, end: 3 }),
                Some(RegExpMatchRange { start: 1, end: 3 }),
                None,
            ]
        );
        assert_eq!(
            get_record_value(indices.groups.as_ref().unwrap(), "face"),
            Some(&Some(RegExpMatchRange { start: 1, end: 3 }))
        );
    }

    #[test]
    fn returns_actual_match_captures_unmatched_slots_named_groups_index_and_input() {
        let expression = create_reg_exp("(?<word>a+)(b)?", "i");
        let result = exec_reg_exp(&expression, "xAA!").unwrap();
        assert_eq!(result.index, 1);
        assert_eq!(result.input, "xAA!");
        assert_eq!(
            result.matches,
            vec![Some("AA".to_string()), Some("AA".to_string()), None]
        );
        assert_eq!(
            get_record_value(result.groups.as_ref().unwrap(), "word"),
            Some(&Some("AA".to_string()))
        );
        assert!(result.indices.is_none());
    }

    #[test]
    fn returns_none_for_an_unmatched_named_group_without_dropping_the_key() {
        let expression = create_reg_exp("(?<left>a)|(?<right>b)", "");
        let result = exec_reg_exp(&expression, "a").unwrap();
        let groups = result.groups.unwrap();
        assert_eq!(
            get_record_value(&groups, "left"),
            Some(&Some("a".to_string()))
        );
        assert_eq!(get_record_value(&groups, "right"), Some(&None));
    }

    #[test]
    fn sticky_requires_a_match_at_last_index_and_resets_on_failure() {
        let expression = create_reg_exp("a", "y");
        expression.write().unwrap().last_index = 1;
        assert_eq!(exec_reg_exp(&expression, "ba").unwrap().index, 1);
        assert_eq!(expression.read().unwrap().last_index, 2);
        expression.write().unwrap().last_index = 0;
        assert!(exec_reg_exp(&expression, "ba").is_none());
        assert_eq!(expression.read().unwrap().last_index, 0);
    }

    #[test]
    fn unicode_mode_uses_utf16_indices_and_normalizes_a_mid_surrogate_last_index() {
        let expression = create_reg_exp(".", "gu");
        expression.write().unwrap().last_index = 1;
        let result = exec_reg_exp(&expression, "😀x").unwrap();
        assert_eq!(result.index, 0);
        assert_eq!(result.matches[0], Some("😀".to_string()));
        assert_eq!(expression.read().unwrap().last_index, 2);
    }

    #[test]
    fn zero_length_global_and_sticky_matches_leave_last_index_at_the_match_end() {
        for flags in ["g", "y"] {
            let expression = create_reg_exp("(?:)", flags);
            expression.write().unwrap().last_index = 1;
            assert_eq!(exec_reg_exp(&expression, "ab").unwrap().index, 1);
            assert_eq!(expression.read().unwrap().last_index, 1);
        }
    }
}

mod test_reg_exp {
    use super::*;

    #[test]
    fn does_not_materialize_non_unicode_surrogate_matches() {
        let expression = create_reg_exp(".", "g");
        assert!(test_reg_exp(&expression, "😀"));
        assert_eq!(expression.read().unwrap().last_index, 1);
        assert!(test_reg_exp(&expression, "😀"));
        assert_eq!(expression.read().unwrap().last_index, 2);
    }

    #[test]
    fn returns_ordinary_case_multiline_and_dotall_results() {
        assert!(test_reg_exp(&create_reg_exp("^a.$", "ims"), "A\n"));
        assert!(!test_reg_exp(&create_reg_exp("^a.$", "im"), "A\n"));
        assert!(!test_reg_exp(&create_reg_exp("z", ""), "abc"));
    }

    #[test]
    fn shares_global_state_with_exec_on_the_same_identity() {
        let expression = create_reg_exp("a", "g");
        assert!(test_reg_exp(&expression, "a_a"));
        assert_eq!(expression.read().unwrap().last_index, 1);
        assert_eq!(exec_reg_exp(&expression, "a_a").unwrap().index, 2);
    }

    #[test]
    fn supports_ecmascript_backreferences_lookbehind_and_unicode_sets() {
        assert!(test_reg_exp(&create_reg_exp(r"(a)\1", ""), "aa"));
        assert!(test_reg_exp(&create_reg_exp("(?<=a)b", ""), "ab"));
        assert!(test_reg_exp(
            &create_reg_exp(r"[\p{ASCII}&&\p{Letter}]", "v"),
            "A"
        ));
        assert!(!test_reg_exp(
            &create_reg_exp(r"[\p{ASCII}&&\p{Letter}]", "v"),
            "1"
        ));
    }
}
