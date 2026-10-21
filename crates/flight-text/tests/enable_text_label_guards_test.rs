use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_node::NodeRef;

use super::*;

fn log_fixture() -> (LogStateRef, MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(16);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn messages(sink: &MemoryLogSink) -> String {
    let mut messages = Vec::new();
    for entry in {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, sink);
        collected
    } {
        if let LogData::Record(data) = entry.data
            && let Some(LogValue::Str(message)) = data.get("message")
        {
            messages.push(message.clone());
        }
    }
    return messages.join("\n");
}

mod disable_text_label_guards {
    use super::*;

    #[test]
    fn stops_the_warning_a_previously_installed_guard_would_emit() {
        let (log_state, sink) = log_fixture();
        let context = measured_text_context();
        enable_text_label_guards(&context, log_state, Arc::new(|| 0.0));
        disable_text_label_guards(&context);
        let label = create_text_label(Some(&PartialTextLabel {
            data: None,
            layout_context: Some(context),
            node: partial_node2d(),
        }));
        set_text_label_string(&label, "before");
        let node: NodeRef = label.clone();
        ensure_text_layout(&node);
        label.write().unwrap().data.text = "after".to_string();
        ensure_text_layout(&node);
        assert_eq!(messages(&sink), "");
    }
}

mod enable_text_label_guards {
    use super::*;

    #[test]
    fn stays_silent_when_no_guard_is_installed() {
        let label = measured_text_label("");
        set_text_label_string(&label, "before");
        let node: NodeRef = label.clone();
        ensure_text_layout(&node);
        label.write().unwrap().data.text = "after".to_string();
        ensure_text_layout(&node);
    }

    #[test]
    fn stays_silent_when_text_is_changed_via_set_text_label_string() {
        let (log_state, sink) = log_fixture();
        let context = measured_text_context();
        enable_text_label_guards(&context, log_state, Arc::new(|| 0.0));
        let label = create_text_label(Some(&PartialTextLabel {
            data: None,
            layout_context: Some(context),
            node: partial_node2d(),
        }));
        let node: NodeRef = label.clone();
        set_text_label_string(&label, "first");
        ensure_text_layout(&node);
        set_text_label_string(&label, "second");
        ensure_text_layout(&node);
        assert_eq!(messages(&sink), "");
    }

    #[test]
    fn warns_with_both_strings_when_data_text_is_mutated_directly() {
        let (log_state, sink) = log_fixture();
        let context = measured_text_context();
        enable_text_label_guards(&context, log_state, Arc::new(|| 0.0));
        let label = create_text_label(Some(&PartialTextLabel {
            data: None,
            layout_context: Some(context),
            node: partial_node2d(),
        }));
        let node: NodeRef = label.clone();
        set_text_label_string(&label, "original text");
        ensure_text_layout(&node);
        label.write().unwrap().data.text = "changed text".to_string();
        ensure_text_layout(&node);
        let messages = messages(&sink);
        assert!(messages.contains("changed text"));
        assert!(messages.contains("original text"));
        assert!(messages.contains("setTextLabelString"));
    }
}
