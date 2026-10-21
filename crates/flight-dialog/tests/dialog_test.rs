use std::sync::{Arc, Mutex};

use flight_dialog::contract::*;
use flight_entity::{FlightError, FlightErrorKind};
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};

use crate::{block_on, ok};

fn message(text: &str) -> MessageDialogOptions {
    return MessageDialogOptions {
        title: None,
        message: text.to_string(),
        detail: None,
        buttons: None,
        kind: None,
        checkbox_label: None,
        checkbox_checked: None,
        default_id: None,
        cancel_id: None,
        parent_window: None,
        signal: None,
    };
}

fn fake_message() -> HostMessageDialogCapability {
    return HostMessageDialogCapability {
        provider: Arc::new(()),
        confirm: Arc::new(|_options: &MessageDialogOptions| ok(true)),
        message: Arc::new(|_options: &MessageDialogOptions| {
            return ok(MessageDialogResult {
                button_index: 2,
                cancelled: false,
                checkbox_checked: false,
            });
        }),
    };
}

/// The source's `severityHost`: records each message's kind and the options it received.
fn severity_host(observed: &Arc<Mutex<Vec<MessageDialogOptions>>>) -> HostMessageDialogCapability {
    let keep = observed.clone();
    return HostMessageDialogCapability {
        provider: Arc::new(()),
        confirm: Arc::new(|_options: &MessageDialogOptions| ok(true)),
        message: Arc::new(move |options: &MessageDialogOptions| {
            keep.lock().unwrap().push(options.clone());
            return ok(MessageDialogResult {
                button_index: 0,
                cancelled: false,
                checkbox_checked: false,
            });
        }),
    };
}

fn kinds(observed: &Arc<Mutex<Vec<MessageDialogOptions>>>) -> Vec<&'static str> {
    return observed
        .lock()
        .unwrap()
        .iter()
        .map(|options| options.kind.map_or("none", get_message_dialog_kind_string))
        .collect();
}

fn aborted(signal: &Option<AbortSignal>) -> bool {
    return signal.as_ref().is_some_and(is_abort_signal_aborted);
}

mod get_message_dialog_kind_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_message_dialog_kind_string(MessageDialogKind::Question),
            "question"
        );
        assert_eq!(
            get_message_dialog_kind_string(MessageDialogKind::Warning),
            "warning"
        );
    }
}

mod parse_message_dialog_kind {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_message_dialog_kind("info"),
            Some(MessageDialogKind::Info)
        );
        assert_eq!(parse_message_dialog_kind("Info"), None);
    }
}

mod show_confirm_dialog {
    use super::*;

    #[test]
    fn delegates_confirmation_through_the_explicit_message_slot() {
        assert!(block_on(show_confirm_dialog(&fake_message(), &message("sure?"))).unwrap());
    }

    #[test]
    fn forwards_a_live_signal_through_the_explicit_message_slot() {
        let seen: Arc<Mutex<Option<MessageDialogOptions>>> = Arc::new(Mutex::new(None));
        let keep = seen.clone();
        let mut host = fake_message();
        host.confirm = Arc::new(move |options: &MessageDialogOptions| {
            *keep.lock().unwrap() = Some(options.clone());
            return ok(true);
        });
        let controller = create_abort_controller();
        let mut options = message("sure?");
        options.signal = Some(controller.signal.clone());
        block_on(show_confirm_dialog(&host, &options)).unwrap();
        let seen = seen.lock().unwrap().clone().unwrap();
        assert_eq!(seen.message, "sure?");
        assert!(seen.kind.is_none());
        abort_controller(&controller, None);
        assert!(aborted(&seen.signal));
    }

    #[test]
    fn passes_a_provider_rejection_through() {
        let mut host = fake_message();
        host.confirm = Arc::new(|_options: &MessageDialogOptions| {
            let rejected: DialogProviderFuture<bool> =
                Box::pin(std::future::ready(Err(FlightError {
                    kind: FlightErrorKind::Error,
                    message: "dismissed".to_string(),
                })));
            return rejected;
        });
        assert_eq!(
            block_on(show_confirm_dialog(&host, &message("sure?")))
                .unwrap_err()
                .message,
            "dismissed"
        );
    }
}

mod show_error_box {
    use super::*;

    #[test]
    fn maps_the_error_box_convenience_call_to_error_severity() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        block_on(show_error_box(
            &severity_host(&observed),
            "Fatal",
            "boom",
            None,
        ))
        .unwrap();
        assert_eq!(kinds(&observed), vec!["error"]);
        let options = observed.lock().unwrap()[0].clone();
        assert_eq!(options.title.as_deref(), Some("Fatal"));
        assert_eq!(options.message, "boom");
        assert!(options.signal.is_none());
    }

    #[test]
    fn forwards_a_given_signal() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let controller = create_abort_controller();
        block_on(show_error_box(
            &severity_host(&observed),
            "Fatal",
            "boom",
            Some(&controller.signal),
        ))
        .unwrap();
        abort_controller(&controller, None);
        assert!(aborted(&observed.lock().unwrap()[0].signal));
    }
}

mod show_error_dialog {
    use super::*;

    #[test]
    fn maps_the_error_convenience_call_to_error_severity() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let mut options = message("boom");
        options.kind = Some(MessageDialogKind::Question);
        options.detail = Some("details".to_string());
        block_on(show_error_dialog(&severity_host(&observed), &options)).unwrap();
        assert_eq!(kinds(&observed), vec!["error"]);
        assert_eq!(
            observed.lock().unwrap()[0].detail.as_deref(),
            Some("details")
        );
        // The caller's options are copied, not changed.
        assert_eq!(options.kind, Some(MessageDialogKind::Question));
    }
}

mod show_info_dialog {
    use super::*;

    #[test]
    fn maps_the_info_convenience_call_to_info_severity() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        block_on(show_info_dialog(
            &severity_host(&observed),
            &message("note"),
        ))
        .unwrap();
        assert_eq!(kinds(&observed), vec!["info"]);
    }
}

mod show_message_dialog {
    use super::*;

    #[test]
    fn delegates_messages_through_the_explicit_message_slot() {
        assert_eq!(
            block_on(show_message_dialog(&fake_message(), &message("hello")))
                .unwrap()
                .button_index,
            2
        );
    }

    #[test]
    fn passes_the_options_through_unchanged() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        block_on(show_message_dialog(
            &severity_host(&observed),
            &message("hello"),
        ))
        .unwrap();
        assert_eq!(kinds(&observed), vec!["none"]);
    }
}

mod show_prompt_dialog {
    use super::*;

    fn prompt(text: &str) -> PromptDialogOptions {
        return PromptDialogOptions {
            title: None,
            message: text.to_string(),
            default_value: None,
            placeholder: None,
            parent_window: None,
            signal: None,
        };
    }

    #[test]
    fn delegates_prompts_through_the_explicit_prompt_slot() {
        let host = HostPromptDialogCapability {
            provider: Arc::new(()),
            prompt: Arc::new(|_options: &PromptDialogOptions| ok(Some("typed".to_string()))),
        };
        assert_eq!(
            block_on(show_prompt_dialog(&host, &prompt("name?"))).unwrap(),
            Some("typed".to_string())
        );
    }

    #[test]
    fn keeps_a_null_answer_distinct_from_an_empty_one() {
        let host = HostPromptDialogCapability {
            provider: Arc::new(()),
            prompt: Arc::new(|options: &PromptDialogOptions| {
                ok(if options.message == "cancel" {
                    None
                } else {
                    Some(String::new())
                })
            }),
        };
        assert_eq!(
            block_on(show_prompt_dialog(&host, &prompt("cancel"))).unwrap(),
            None
        );
        assert_eq!(
            block_on(show_prompt_dialog(&host, &prompt("empty"))).unwrap(),
            Some(String::new())
        );
    }

    #[test]
    fn forwards_the_parent_window_by_identity() {
        let seen = Arc::new(Mutex::new(None));
        let keep = seen.clone();
        let host = HostPromptDialogCapability {
            provider: Arc::new(()),
            prompt: Arc::new(move |options: &PromptDialogOptions| {
                *keep.lock().unwrap() = options.parent_window.clone();
                return ok(None);
            }),
        };
        let window = flight_app::create_app_window();
        let mut options = prompt("name?");
        options.parent_window = Some(window.clone());
        block_on(show_prompt_dialog(&host, &options)).unwrap();
        assert!(Arc::ptr_eq(seen.lock().unwrap().as_ref().unwrap(), &window));
    }
}

mod show_warning_dialog {
    use super::*;

    #[test]
    fn maps_the_warning_convenience_call_to_warning_severity() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        block_on(show_warning_dialog(
            &severity_host(&observed),
            &message("careful"),
        ))
        .unwrap();
        assert_eq!(kinds(&observed), vec!["warning"]);
    }
}
