use std::cell::RefCell;
use std::rc::Rc;

use flight_log::{LogData, LogEntry, LogValue, clear_log_once_keys, set_log_sink};
use flight_textsegment::contract::set_intl_segmenter_available;
use flight_textsegment::*;

thread_local! {
    static ENTRIES: RefCell<Vec<LogEntry>> = const { RefCell::new(Vec::new()) };
}

fn begin_log_capture() {
    clear_log_once_keys();
    ENTRIES.with(|entries| entries.borrow_mut().clear());
    set_log_sink(Some(Rc::new(|entry| {
        ENTRIES.with(|entries| entries.borrow_mut().push(entry.clone()));
    })));
}

fn end_test() {
    disable_text_segment_guards();
    set_intl_segmenter_available(None);
    set_log_sink(None);
}

mod disable_text_segment_guards {
    use super::*;

    #[test]
    fn restores_silent_missing_engine_recovery() {
        begin_log_capture();
        enable_text_segment_guards();
        disable_text_segment_guards();
        set_intl_segmenter_available(Some(false));
        let result = segment_graphemes(&web_text_segmenter_backend(), "text", None);
        assert!(result.is_empty());
        ENTRIES.with(|entries| assert!(entries.borrow().is_empty()));
        end_test();
    }
}

mod enable_text_segment_guards {
    use super::*;

    #[test]
    fn warns_once_and_names_the_provider_type_when_intl_segmenter_is_absent() {
        begin_log_capture();
        enable_text_segment_guards();
        set_intl_segmenter_available(Some(false));
        let first = segment_graphemes(&web_text_segmenter_backend(), "first", None);
        let second = segment_graphemes(&web_text_segmenter_backend(), "second", None);
        assert!(first.is_empty());
        assert!(second.is_empty());
        ENTRIES.with(|entries| {
            let entries = entries.borrow();
            assert_eq!(entries.len(), 1);
            let LogData::Record(data) = &entries[0].data else {
                panic!("expected record log data");
            };
            let Some(LogValue::Str(message)) = data.get("message") else {
                panic!("expected message string");
            };
            assert!(message.contains("HostTextSegmenterCapability"));
        });
        end_test();
    }

    #[test]
    fn stays_silent_when_the_bundled_intl_provider_is_available() {
        begin_log_capture();
        enable_text_segment_guards();
        let result = segment_graphemes(&web_text_segmenter_backend(), "text", None);
        assert!(!result.is_empty());
        ENTRIES.with(|entries| assert!(entries.borrow().is_empty()));
        end_test();
    }
}
