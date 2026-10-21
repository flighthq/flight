use flight_stream::AbortSignal;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn ok<T: Send + 'static>(value: T) -> DialogProviderFuture<T> {
        return Box::pin(std::future::ready(Ok(value)));
    }

    fn message(text: &str) -> MessageDialogOptions {
        return MessageDialogOptions {
            message: text.to_string(),
            ..MessageDialogOptions::default()
        };
    }

    fn message_host(
        kinds: &Arc<Mutex<Vec<Option<MessageDialogKind>>>>,
    ) -> HostMessageDialogCapability {
        let keep = kinds.clone();
        return HostMessageDialogCapability {
            provider: Arc::new(()),
            confirm: Arc::new(|options: &MessageDialogOptions| ok(options.message == "sure?")),
            message: Arc::new(move |options: &MessageDialogOptions| {
                keep.lock().unwrap().push(options.kind);
                return ok(MessageDialogResult {
                    button_index: options.message.len() as i32,
                    cancelled: false,
                    checkbox_checked: false,
                });
            }),
        };
    }

    fn compare(call: impl Fn(&HostMessageDialogCapability, bool) -> MessageDialogResult) {
        let (a, b) = (
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        assert_eq!(
            call(&message_host(&a), true),
            call(&message_host(&b), false)
        );
        assert_eq!(*a.lock().unwrap(), *b.lock().unwrap());
        assert_eq!(a.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_message_dialog_capability_show_confirm_dialog_matches_show_confirm_dialog() {
        let kinds = Arc::new(Mutex::new(Vec::new()));
        let host = message_host(&kinds);
        assert_eq!(
            block_on(host.show_confirm_dialog(&message("sure?"))).unwrap(),
            block_on(show_confirm_dialog(&host, &message("sure?"))).unwrap()
        );
        assert!(block_on(host.show_confirm_dialog(&message("sure?"))).unwrap());
    }

    #[test]
    fn host_message_dialog_capability_show_error_box_matches_show_error_box() {
        compare(|host, method| {
            let pending = if method {
                host.show_error_box("Fatal", "boom", None)
            } else {
                show_error_box(host, "Fatal", "boom", None)
            };
            return block_on(pending).unwrap();
        });
    }

    #[test]
    fn host_message_dialog_capability_show_error_dialog_matches_show_error_dialog() {
        compare(|host, method| {
            let pending = if method {
                host.show_error_dialog(&message("boom"))
            } else {
                show_error_dialog(host, &message("boom"))
            };
            return block_on(pending).unwrap();
        });
    }

    #[test]
    fn host_message_dialog_capability_show_info_dialog_matches_show_info_dialog() {
        compare(|host, method| {
            let pending = if method {
                host.show_info_dialog(&message("note"))
            } else {
                show_info_dialog(host, &message("note"))
            };
            return block_on(pending).unwrap();
        });
    }

    #[test]
    fn host_message_dialog_capability_show_message_dialog_matches_show_message_dialog() {
        compare(|host, method| {
            let pending = if method {
                host.show_message_dialog(&message("hello"))
            } else {
                show_message_dialog(host, &message("hello"))
            };
            return block_on(pending).unwrap();
        });
    }

    #[test]
    fn host_message_dialog_capability_show_warning_dialog_matches_show_warning_dialog() {
        compare(|host, method| {
            let pending = if method {
                host.show_warning_dialog(&message("careful"))
            } else {
                show_warning_dialog(host, &message("careful"))
            };
            return block_on(pending).unwrap();
        });
    }

    #[test]
    fn host_prompt_dialog_capability_show_prompt_dialog_matches_show_prompt_dialog() {
        let host = HostPromptDialogCapability {
            provider: Arc::new(()),
            prompt: Arc::new(|options: &PromptDialogOptions| ok(Some(options.message.clone()))),
        };
        let options = PromptDialogOptions {
            message: "name?".to_string(),
            ..PromptDialogOptions::default()
        };
        assert_eq!(
            block_on(host.show_prompt_dialog(&options)).unwrap(),
            block_on(show_prompt_dialog(&host, &options)).unwrap()
        );
    }
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MessageDialogKind string union; the TS package exports no get_/parse_ free functions
pub fn get_message_dialog_kind_string(value: MessageDialogKind) -> &'static str {
    return match value {
        MessageDialogKind::Info => "info",
        MessageDialogKind::Warning => "warning",
        MessageDialogKind::Error => "error",
        MessageDialogKind::Question => "question",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MessageDialogKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_message_dialog_kind(value: &str) -> Option<MessageDialogKind> {
    return match value {
        "info" => Some(MessageDialogKind::Info),
        "warning" => Some(MessageDialogKind::Warning),
        "error" => Some(MessageDialogKind::Error),
        "question" => Some(MessageDialogKind::Question),
        _ => None,
    };
}

/// Asks the host to confirm; the provider's Promise (its answer or its rejection) is returned as is.
pub fn show_confirm_dialog(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
) -> DialogProviderFuture<bool> {
    return (host_message_dialog.confirm)(options);
}

/// Shows an error-severity message box with `title` and `content`, forwarding `signal` only when one
/// is given (the source omits the field otherwise).
pub fn show_error_box(
    host_message_dialog: &HostMessageDialogCapability,
    title: &str,
    content: &str,
    signal: Option<&AbortSignal>,
) -> DialogProviderFuture<MessageDialogResult> {
    let options = MessageDialogOptions {
        title: Some(title.to_string()),
        message: content.to_string(),
        detail: None,
        buttons: None,
        kind: Some(MessageDialogKind::Error),
        checkbox_label: None,
        checkbox_checked: None,
        default_id: None,
        cancel_id: None,
        parent_window: None,
        signal: signal.cloned(),
    };
    return (host_message_dialog.message)(&options);
}

/// Shows `options` as an error-severity message (a copy with `kind` set to error).
pub fn show_error_dialog(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
) -> DialogProviderFuture<MessageDialogResult> {
    return show_message_with_kind(host_message_dialog, options, MessageDialogKind::Error);
}

/// Shows `options` as an info-severity message (a copy with `kind` set to info).
pub fn show_info_dialog(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
) -> DialogProviderFuture<MessageDialogResult> {
    return show_message_with_kind(host_message_dialog, options, MessageDialogKind::Info);
}

/// Shows a message with `options` exactly as given.
pub fn show_message_dialog(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
) -> DialogProviderFuture<MessageDialogResult> {
    return (host_message_dialog.message)(options);
}

// The source's `{ ...options, kind }`: a copy of the caller's options with the severity replaced.
fn show_message_with_kind(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
    kind: MessageDialogKind,
) -> DialogProviderFuture<MessageDialogResult> {
    let mut with_kind = options.clone();
    with_kind.kind = Some(kind);
    return (host_message_dialog.message)(&with_kind);
}

/// Prompts for text; the answer is the entered text or `None` (the source's `null`).
pub fn show_prompt_dialog(
    host_prompt_dialog: &HostPromptDialogCapability,
    options: &PromptDialogOptions,
) -> DialogProviderFuture<Option<String>> {
    return (host_prompt_dialog.prompt)(options);
}

/// Shows `options` as a warning-severity message (a copy with `kind` set to warning).
pub fn show_warning_dialog(
    host_message_dialog: &HostMessageDialogCapability,
    options: &MessageDialogOptions,
) -> DialogProviderFuture<MessageDialogResult> {
    return show_message_with_kind(host_message_dialog, options, MessageDialogKind::Warning);
}

impl HostMessageDialogCapability {
    pub fn show_confirm_dialog(
        &self,
        options: &MessageDialogOptions,
    ) -> DialogProviderFuture<bool> {
        return show_confirm_dialog(self, options);
    }

    pub fn show_error_box(
        &self,
        title: &str,
        content: &str,
        signal: Option<&AbortSignal>,
    ) -> DialogProviderFuture<MessageDialogResult> {
        return show_error_box(self, title, content, signal);
    }

    pub fn show_error_dialog(
        &self,
        options: &MessageDialogOptions,
    ) -> DialogProviderFuture<MessageDialogResult> {
        return show_error_dialog(self, options);
    }

    pub fn show_info_dialog(
        &self,
        options: &MessageDialogOptions,
    ) -> DialogProviderFuture<MessageDialogResult> {
        return show_info_dialog(self, options);
    }

    pub fn show_message_dialog(
        &self,
        options: &MessageDialogOptions,
    ) -> DialogProviderFuture<MessageDialogResult> {
        return show_message_dialog(self, options);
    }

    pub fn show_warning_dialog(
        &self,
        options: &MessageDialogOptions,
    ) -> DialogProviderFuture<MessageDialogResult> {
        return show_warning_dialog(self, options);
    }
}

impl HostPromptDialogCapability {
    pub fn show_prompt_dialog(
        &self,
        options: &PromptDialogOptions,
    ) -> DialogProviderFuture<Option<String>> {
        return show_prompt_dialog(self, options);
    }
}
