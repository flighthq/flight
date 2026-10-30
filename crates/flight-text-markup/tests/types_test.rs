mod create_text_markup_guard_state {
    use super::*;

    #[test]
    fn allocates_a_distinct_entity_per_guard_slot() {
        let mut first = create_text_markup_guard_state();
        let mut second = create_text_markup_guard_state();
        assert_ne!(
            flight_entity::get_entity_uid(&mut first),
            flight_entity::get_entity_uid(&mut second)
        );
    }

    #[test]
    fn creates_an_empty_guard_slot() {
        let state = create_text_markup_guard_state();
        assert!(state.guard.is_none());
    }
}

use flight_text_markup::contract::*;

mod get_text_markup_issue_kind_string {
    use super::*;

    #[test]
    fn maps_each_closed_issue_kind_to_its_source_name() {
        assert_eq!(
            get_text_markup_issue_kind_string(TextMarkupIssueKind::UnknownTag),
            "unknown-tag"
        );
        assert_eq!(
            get_text_markup_issue_kind_string(TextMarkupIssueKind::UnresolvedFontColor),
            "unresolved-font-color"
        );
        assert_eq!(
            get_text_markup_issue_kind_string(TextMarkupIssueKind::UnsafeHref),
            "unsafe-href"
        );
    }
}

mod parse_text_markup_issue_kind {
    use super::*;

    #[test]
    fn parses_the_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_text_markup_issue_kind("unknown-tag"),
            Some(TextMarkupIssueKind::UnknownTag)
        );
        assert_eq!(
            parse_text_markup_issue_kind("unsafe-href"),
            Some(TextMarkupIssueKind::UnsafeHref)
        );
        assert_eq!(parse_text_markup_issue_kind(""), None);
    }
}
