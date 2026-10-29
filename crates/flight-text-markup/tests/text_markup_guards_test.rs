//! flight-compiler: target-native

use std::sync::{Arc, Mutex};

use flight_text_markup::contract::*;

fn issue() -> TextMarkupIssue {
    return TextMarkupIssue {
        kind: TextMarkupIssueKind::UnknownTag,
        offset: 0,
        tag: String::from("widget"),
        value: None,
    };
}

mod report_text_markup_issue {
    use super::*;

    #[test]
    fn is_silent_when_no_guard_is_installed() {
        let state = create_text_markup_guard_state();
        report_text_markup_issue(&state, &issue());
    }
}

mod set_text_markup_guard {
    use super::*;

    #[test]
    fn replaces_the_active_guard_instead_of_accumulating_callbacks() {
        let mut state = create_text_markup_guard_state();
        let first = Arc::new(Mutex::new(Vec::new()));
        let second = Arc::new(Mutex::new(Vec::new()));
        let first_seen = first.clone();
        set_text_markup_guard(
            &mut state,
            Some(Arc::new(move |value: &TextMarkupIssue| {
                first_seen.lock().unwrap().push(value.tag.clone());
            })),
        );
        let second_seen = second.clone();
        set_text_markup_guard(
            &mut state,
            Some(Arc::new(move |value: &TextMarkupIssue| {
                second_seen.lock().unwrap().push(value.tag.clone());
            })),
        );
        report_text_markup_issue(&state, &issue());
        assert!(first.lock().unwrap().is_empty());
        assert_eq!(*second.lock().unwrap(), vec![String::from("widget")]);
    }
}
