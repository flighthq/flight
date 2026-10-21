use std::sync::{Arc, Mutex, RwLock};

use flight_log::{LogData, LogEntry, LogStateRef, LogValue, create_log_state, set_log_sink};
use flight_text_markup::contract::*;

fn log_state(entries: Arc<Mutex<Vec<String>>>) -> LogStateRef {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    set_log_sink(
        &state,
        Some(Arc::new(move |entry: &LogEntry| {
            if let LogData::Record(record) = &entry.data {
                if let Some(LogValue::Str(message)) = record.get("message") {
                    entries.lock().unwrap().push(message.clone());
                }
            }
        })),
    );
    return state;
}

fn issue(kind: TextMarkupIssueKind, tag: &str, value: Option<&str>) -> TextMarkupIssue {
    return TextMarkupIssue {
        kind,
        offset: 0,
        tag: String::from(tag),
        value: value.map(String::from),
    };
}

mod disable_text_markup_guards {
    use super::*;

    #[test]
    fn restores_silent_parser_recovery() {
        let mut guards = create_text_markup_guard_state();
        enable_text_markup_guards(
            &mut guards,
            &log_state(Arc::new(Mutex::new(Vec::new()))),
            Arc::new(|| 0.0),
        );
        disable_text_markup_guards(&mut guards);
        assert!(guards.guard.is_none());
    }
}

mod enable_text_markup_guards {
    use super::*;

    #[test]
    fn names_the_fixing_apis_for_each_lossy_parse_decision() {
        let entries = Arc::new(Mutex::new(Vec::new()));
        let state = log_state(entries.clone());
        let mut guards = create_text_markup_guard_state();
        enable_text_markup_guards(&mut guards, &state, Arc::new(|| 0.0));
        report_text_markup_issue(
            &guards,
            &issue(TextMarkupIssueKind::UnknownTag, "unknown", None),
        );
        report_text_markup_issue(
            &guards,
            &issue(
                TextMarkupIssueKind::UnresolvedFontColor,
                "font",
                Some("red"),
            ),
        );
        report_text_markup_issue(
            &guards,
            &issue(
                TextMarkupIssueKind::UnsafeHref,
                "a",
                Some("javascript:run()"),
            ),
        );
        let messages = entries.lock().unwrap().join("\n");
        assert!(messages.contains("registerMarkupTag"));
        assert!(messages.contains("registerMarkupNamedColors"));
        assert!(messages.contains("unsafe URL scheme"));
    }

    #[test]
    fn warns_once_per_repeated_subject() {
        let entries = Arc::new(Mutex::new(Vec::new()));
        let state = log_state(entries.clone());
        let mut guards = create_text_markup_guard_state();
        enable_text_markup_guards(&mut guards, &state, Arc::new(|| 0.0));
        report_text_markup_issue(
            &guards,
            &issue(TextMarkupIssueKind::UnknownTag, "unknown", None),
        );
        report_text_markup_issue(
            &guards,
            &issue(TextMarkupIssueKind::UnknownTag, "unknown", None),
        );
        assert_eq!(entries.lock().unwrap().len(), 1);
    }

    #[test]
    fn stays_silent_when_disabled() {
        let entries = Arc::new(Mutex::new(Vec::new()));
        let state = log_state(entries.clone());
        let mut guards = create_text_markup_guard_state();
        enable_text_markup_guards(&mut guards, &state, Arc::new(|| 0.0));
        disable_text_markup_guards(&mut guards);
        report_text_markup_issue(
            &guards,
            &issue(TextMarkupIssueKind::UnknownTag, "unknown", None),
        );
        assert!(entries.lock().unwrap().is_empty());
    }
}
