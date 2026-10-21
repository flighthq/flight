use crate::contract::*;
use flight_entity::Ref;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::*;
    use flight_signals::{connect_signal, emit_signal};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn content_can_share_matches_the_free_probe_and_provider_answer() {
        let content = text_content("hello");
        let expected = content.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut host = content_host();
        host.can_share_content = Arc::new(move |content| {
            assert!(Arc::ptr_eq(&content, &expected));
            count.fetch_add(1, Ordering::SeqCst);
            return false;
        });
        assert_eq!(host.can_share(&content), can_share_content(&host, &content));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn content_share_matches_the_free_command_and_rejection() {
        let mut host = content_host();
        host.share_content = Arc::new(|_| Box::pin(async { Err(provider_error()) }));
        let content = text_content("hello");
        assert_eq!(
            block_on(host.share(&content)),
            block_on(share_content(&host, &content))
        );
        assert_eq!(block_on(host.share(&content)), Err(provider_error()));
    }

    #[test]
    fn content_share_text_matches_the_free_text_payload() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert_eq!(
                *content.read().unwrap(),
                ShareContent::Text(ShareTextContent {
                    text: "literal text".to_string(),
                    title: None,
                    url: None
                })
            );
            Box::pin(async { Ok(false) })
        });
        assert_eq!(
            block_on(host.share_text("literal text")),
            block_on(share_text(&host, "literal text"))
        );
    }

    #[test]
    fn content_share_url_matches_the_free_url_payload() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert_eq!(
                *content.read().unwrap(),
                ShareContent::Url(ShareUrlContent {
                    text: None,
                    title: None,
                    url: "literal url".to_string()
                })
            );
            Box::pin(async { Ok(false) })
        });
        assert_eq!(
            block_on(host.share_url("literal url")),
            block_on(share_url(&host, "literal url"))
        );
    }

    #[test]
    fn content_share_with_result_matches_identity_and_broadcast_of_the_free_command() {
        let state = share_state();
        let signals = enable_share_signals();
        let result = share_result();
        let expected = result.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |actual| {
                assert!(Arc::ptr_eq(actual, &expected));
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_share_signals(&state, &signals);
        let output = result.clone();
        let mut host = content_host();
        host.share_content_with_result = Arc::new(move |_| {
            let output = output.clone();
            Box::pin(async move { Ok(output) })
        });
        let content = title_content("flight");
        let method = block_on(host.share_with_result(&content, &state)).unwrap();
        let function = block_on(share_content_with_result(&host, &content, &state)).unwrap();
        assert!(Arc::ptr_eq(&method, &function));
        assert!(Arc::ptr_eq(&method, &result));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn files_can_share_matches_the_free_probe_for_valid_and_invalid_payloads() {
        let mut host = files_host();
        host.can_share_content = Arc::new(|_| false);
        let files = vec![share_file()];
        assert_eq!(host.can_share(&files), can_share_files(&host, &files));
        assert_eq!(host.can_share(&[]), can_share_files(&host, &[]));
    }

    #[test]
    fn files_share_matches_the_free_command_and_descriptor_identity() {
        let file = share_file();
        let expected = file.clone();
        let mut host = files_host();
        host.share_content = Arc::new(move |content| {
            assert!(Arc::ptr_eq(&content.read().unwrap().files[0], &expected));
            Box::pin(async { Ok(false) })
        });
        assert_eq!(
            block_on(host.share(&[file.clone()])),
            block_on(share_files(&host, &[file]))
        );
    }

    #[test]
    fn has_fields_matches_the_free_predicate_across_optional_vectors() {
        let mut content = ShareContent::Title(ShareTitleContent {
            text: None,
            title: String::new(),
            url: None,
        });
        assert_eq!(content.has_fields(), has_share_content_fields(&content));
        content = ShareContent::Title(ShareTitleContent {
            text: Some("text".to_string()),
            title: String::new(),
            url: None,
        });
        assert_eq!(content.has_fields(), has_share_content_fields(&content));
        assert!(content.has_fields());
    }

    #[test]
    fn is_valid_matches_the_free_data_envelope_check() {
        let file = share_file();
        assert_eq!(
            file.read().unwrap().is_valid(),
            is_share_file_valid(&file.read().unwrap())
        );
        file.write().unwrap().data_url = "data:missing-comma".to_string();
        assert_eq!(
            file.read().unwrap().is_valid(),
            is_share_file_valid(&file.read().unwrap())
        );
        assert!(!file.read().unwrap().is_valid());
    }

    #[test]
    fn new_matches_enable_without_attaching_and_with_independent_entities() {
        let method = ShareSignals::new();
        let function = enable_share_signals();
        assert_eq!(
            method
                .read()
                .unwrap()
                .on_share_result
                .data
                .read()
                .unwrap()
                .is_none(),
            function
                .read()
                .unwrap()
                .on_share_result
                .data
                .read()
                .unwrap()
                .is_none()
        );
        assert!(!Arc::ptr_eq(&method, &function));
        let state = share_state();
        let calls = Arc::new(AtomicUsize::new(0));
        for signals in [&method, &function] {
            let calls = calls.clone();
            connect_signal(
                &signals.read().unwrap().on_share_result,
                Arc::new(move |_| {
                    calls.fetch_add(1, Ordering::SeqCst);
                }),
                None,
            );
        }
        block_on(share_content_with_result(
            &content_host(),
            &text_content("inert"),
            &state,
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn state_attach_matches_free_idempotence_and_delivery() {
        let method_state = share_state();
        let free_state = share_state();
        let signals = enable_share_signals();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        method_state.attach(&signals);
        method_state.attach(&signals);
        attach_share_signals(&free_state, &signals);
        attach_share_signals(&free_state, &signals);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("method"),
            &method_state,
        ))
        .unwrap();
        let method_calls = calls.swap(0, Ordering::SeqCst);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("free"),
            &free_state,
        ))
        .unwrap();
        assert_eq!(method_calls, calls.load(Ordering::SeqCst));
        assert_eq!(method_calls, 1);
    }

    #[test]
    fn state_detach_matches_the_free_operation_without_clearing_listeners() {
        let method_state = share_state();
        let free_state = share_state();
        let signals = enable_share_signals();
        let signal = signals.read().unwrap().on_share_result.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_share_signals(&method_state, &signals);
        attach_share_signals(&free_state, &signals);
        method_state.detach(&signals);
        detach_share_signals(&free_state, &signals);
        for state in [&method_state, &free_state] {
            block_on(share_content_with_result(
                &content_host(),
                &text_content("detached"),
                state,
            ))
            .unwrap();
        }
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        emit_signal(&signal, &share_result());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn state_dispose_matches_detaching_and_clearing_the_free_groups() {
        let method_state = share_state();
        let free_state = share_state();
        let calls = Arc::new(AtomicUsize::new(0));
        let method_group = enable_share_signals();
        let free_group = enable_share_signals();
        for (state, signals) in [(&method_state, &method_group), (&free_state, &free_group)] {
            let calls = calls.clone();
            connect_signal(
                &signals.read().unwrap().on_share_result,
                Arc::new(move |_| {
                    calls.fetch_add(1, Ordering::SeqCst);
                }),
                None,
            );
            attach_share_signals(state, signals);
        }
        method_state.dispose(&method_group);
        dispose_share_signals(&free_state, &free_group);
        for (state, signals) in [(&method_state, &method_group), (&free_state, &free_group)] {
            block_on(share_content_with_result(
                &content_host(),
                &text_content("disposed"),
                state,
            ))
            .unwrap();
            emit_signal(&signals.read().unwrap().on_share_result, &share_result());
            assert!(
                signals
                    .read()
                    .unwrap()
                    .on_share_result
                    .data
                    .read()
                    .unwrap()
                    .is_none()
            );
        }
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

impl HostShareContentCapability {
    pub fn can_share(&self, content: &Ref<ShareContent>) -> bool {
        return can_share_content(self, content);
    }

    pub async fn share(&self, content: &Ref<ShareContent>) -> ShareCommandResult {
        return share_content(self, content).await;
    }

    pub async fn share_text(&self, text: &str) -> ShareCommandResult {
        return share_text(self, text).await;
    }

    pub async fn share_url(&self, url: &str) -> ShareCommandResult {
        return share_url(self, url).await;
    }

    pub async fn share_with_result(
        &self,
        content: &Ref<ShareContent>,
        state: &ShareState,
    ) -> ShareOutcome {
        return share_content_with_result(self, content, state).await;
    }
}

impl HostShareFilesCapability {
    pub fn can_share(&self, files: &[Ref<ShareFile>]) -> bool {
        return can_share_files(self, files);
    }

    pub async fn share(&self, files: &[Ref<ShareFile>]) -> ShareCommandResult {
        return share_files(self, files).await;
    }
}

impl ShareContent {
    pub fn has_fields(&self) -> bool {
        return has_share_content_fields(self);
    }
}

impl ShareFile {
    pub fn is_valid(&self) -> bool {
        return is_share_file_valid(self);
    }
}

impl ShareSignals {
    pub fn new() -> Ref<Self> {
        return enable_share_signals();
    }
}

impl ShareState {
    pub fn attach(&self, signals: &Ref<ShareSignals>) {
        return attach_share_signals(self, signals);
    }

    pub fn detach(&self, signals: &Ref<ShareSignals>) {
        return detach_share_signals(self, signals);
    }

    pub fn dispose(&self, signals: &Ref<ShareSignals>) {
        return dispose_share_signals(self, signals);
    }
}
