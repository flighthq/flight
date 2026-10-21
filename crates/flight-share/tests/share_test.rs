use crate::common::*;
use flight_entity::{get_entity_uid, set_entity_uid};
use flight_share::contract::*;
use flight_signals::{connect_signal, create_signal, emit_signal};
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Waker};

mod attach_share_signals {
    use super::*;

    #[test]
    fn enables_delivery_from_the_detailed_command_with_the_same_result_object() {
        let state = share_state();
        let result = share_result();
        let returned = result.clone();
        let mut host = content_host();
        host.share_content_with_result = Arc::new(move |_| {
            let result = returned.clone();
            Box::pin(async move { Ok(result) })
        });
        let signals = enable_share_signals();
        let observed = Arc::new(Mutex::new(Vec::new()));
        let retained = observed.clone();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |result| retained.lock().unwrap().push(result.clone())),
            None,
        );
        attach_share_signals(&state, &signals);
        let returned = block_on(share_content_with_result(
            &host,
            &title_content("flight"),
            &state,
        ))
        .unwrap();
        assert!(Arc::ptr_eq(&returned, &result));
        assert!(Arc::ptr_eq(&observed.lock().unwrap()[0], &result));
        result.write().unwrap().activity_type = Some("later provider detail".to_string());
        assert_eq!(
            observed.lock().unwrap()[0]
                .read()
                .unwrap()
                .activity_type
                .as_deref(),
            Some("later provider detail")
        );
        detach_share_signals(&state, &signals);
    }

    #[test]
    fn repeated_attachment_is_idempotent_and_keeps_insertion_order() {
        let state = share_state();
        let order = Arc::new(Mutex::new(Vec::new()));
        let first = enable_share_signals();
        let second = enable_share_signals();
        for (signals, label) in [(&first, "first"), (&second, "second")] {
            let order = order.clone();
            connect_signal(
                &signals.read().unwrap().on_share_result,
                Arc::new(move |_| order.lock().unwrap().push(label)),
                None,
            );
            attach_share_signals(&state, signals);
        }
        attach_share_signals(&state, &first);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("x"),
            &state,
        ))
        .unwrap();
        assert_eq!(*order.lock().unwrap(), ["first", "second"]);
    }

    #[test]
    fn attachment_retains_the_group_strongly_until_detachment() {
        let state = share_state();
        let signals = enable_share_signals();
        let weak = Arc::downgrade(&signals);
        attach_share_signals(&state, &signals);
        drop(signals);
        let retained = weak
            .upgrade()
            .expect("the ordered source Set owns the group strongly");
        detach_share_signals(&state, &retained);
        drop(retained);
        assert!(weak.upgrade().is_none());
    }

    #[test]
    fn independent_contexts_do_not_share_delivery_but_context_clones_do() {
        let first_state = share_state();
        let second_state = share_state();
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let signals = enable_share_signals();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |_| {
                observed.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_share_signals(&first_state, &signals);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("separate"),
            &second_state,
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("same"),
            &first_state.clone(),
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn live_broadcast_skips_removed_groups_and_visits_new_and_reattached_groups() {
        let state = share_state();
        let first = enable_share_signals();
        let removed = enable_share_signals();
        let added = enable_share_signals();
        let order = Arc::new(Mutex::new(Vec::new()));
        let once = Arc::new(AtomicBool::new(false));
        let callback_state = state.clone();
        let callback_first = Arc::downgrade(&first);
        let callback_removed = removed.clone();
        let callback_added = added.clone();
        let callback_order = order.clone();
        connect_signal(
            &first.read().unwrap().on_share_result,
            Arc::new(move |_| {
                callback_order.lock().unwrap().push("first");
                if !once.swap(true, Ordering::SeqCst) {
                    detach_share_signals(&callback_state, &callback_removed);
                    attach_share_signals(&callback_state, &callback_added);
                    let first = callback_first.upgrade().unwrap();
                    detach_share_signals(&callback_state, &first);
                    attach_share_signals(&callback_state, &first);
                }
            }),
            None,
        );
        for (signals, label) in [(&removed, "removed"), (&added, "added")] {
            let order = order.clone();
            connect_signal(
                &signals.read().unwrap().on_share_result,
                Arc::new(move |_| order.lock().unwrap().push(label)),
                None,
            );
        }
        attach_share_signals(&state, &first);
        attach_share_signals(&state, &removed);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("x"),
            &state,
        ))
        .unwrap();
        assert_eq!(*order.lock().unwrap(), ["first", "added", "first"]);
        dispose_share_signals(&state, &first);
        dispose_share_signals(&state, &added);
    }

    #[test]
    fn nested_broadcast_has_an_independent_cursor_and_holds_no_callback_lock() {
        let state = share_state();
        let first = enable_share_signals();
        let second = enable_share_signals();
        let order = Arc::new(Mutex::new(Vec::new()));
        let callback_order = order.clone();
        let callback_state = state.clone();
        let once = AtomicBool::new(false);
        connect_signal(
            &first.read().unwrap().on_share_result,
            Arc::new(move |_| {
                callback_order.lock().unwrap().push("first");
                if !once.swap(true, Ordering::SeqCst) {
                    block_on(share_content_with_result(
                        &content_host(),
                        &text_content("nested"),
                        &callback_state,
                    ))
                    .unwrap();
                }
            }),
            None,
        );
        let callback_order = order.clone();
        connect_signal(
            &second.read().unwrap().on_share_result,
            Arc::new(move |_| callback_order.lock().unwrap().push("second")),
            None,
        );
        attach_share_signals(&state, &first);
        attach_share_signals(&state, &second);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("outer"),
            &state,
        ))
        .unwrap();
        assert_eq!(
            *order.lock().unwrap(),
            ["first", "first", "second", "second"]
        );
        dispose_share_signals(&state, &first);
    }

    #[test]
    fn reads_each_groups_current_signal_at_its_turn() {
        let state = share_state();
        let first = enable_share_signals();
        let second = enable_share_signals();
        let old_calls = Arc::new(AtomicUsize::new(0));
        let new_calls = Arc::new(AtomicUsize::new(0));
        let old = old_calls.clone();
        connect_signal(
            &second.read().unwrap().on_share_result,
            Arc::new(move |_| {
                old.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        let second_group = second.clone();
        let new = new_calls.clone();
        connect_signal(
            &first.read().unwrap().on_share_result,
            Arc::new(move |_| {
                let replacement = create_signal();
                let calls = new.clone();
                connect_signal(
                    &replacement,
                    Arc::new(move |_| {
                        calls.fetch_add(1, Ordering::SeqCst);
                    }),
                    None,
                );
                second_group.write().unwrap().on_share_result = replacement;
            }),
            None,
        );
        attach_share_signals(&state, &first);
        attach_share_signals(&state, &second);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("x"),
            &state,
        ))
        .unwrap();
        assert_eq!(old_calls.load(Ordering::SeqCst), 0);
        assert_eq!(new_calls.load(Ordering::SeqCst), 1);
        dispose_share_signals(&state, &first);
    }
}

mod can_share_content {
    use super::*;

    #[test]
    fn validates_meaningful_payloads_through_the_selected_slot_and_keeps_identity() {
        let content = text_content("hello");
        let expected = content.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut host = content_host();
        host.can_share_content = Arc::new(move |received| {
            assert!(Arc::ptr_eq(&received, &expected));
            count.fetch_add(1, Ordering::SeqCst);
            return false;
        });
        assert!(!can_share_content(&host, &content));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(!can_share_content(&host, &text_content("")));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(can_share_content(&content_host(), &content));
    }
}

mod can_share_files {
    use super::*;

    #[test]
    fn probes_only_valid_nonempty_lists_and_keeps_file_descriptor_identity() {
        let file = share_file();
        let expected = file.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut host = files_host();
        host.can_share_content = Arc::new(move |content| {
            let content = content.read().unwrap();
            assert_eq!(content.files.len(), 1);
            assert!(Arc::ptr_eq(&content.files[0], &expected));
            count.fetch_add(1, Ordering::SeqCst);
            return true;
        });
        assert!(can_share_files(&host, &[file]));
        assert!(!can_share_files(&host, &[]));
        let malformed = share_file();
        malformed.write().unwrap().data_url = "data:text/plain;base64".to_string();
        assert!(!can_share_files(&host, &[malformed]));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn forwards_a_valid_provider_false_without_treating_it_as_missing_capability() {
        let mut host = files_host();
        host.can_share_content = Arc::new(|_| false);
        assert!(!can_share_files(&host, &[share_file()]));
    }
}

mod detach_share_signals {
    use super::*;

    #[test]
    fn stops_delivery_without_clearing_the_signal_entity_or_listeners() {
        let state = share_state();
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
        attach_share_signals(&state, &signals);
        detach_share_signals(&state, &signals);
        detach_share_signals(&state, &signals);
        block_on(share_content_with_result(
            &content_host(),
            &title_content("quiet"),
            &state,
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        emit_signal(&signal, &share_result());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn reattachment_moves_a_group_to_the_end() {
        let state = share_state();
        let first = enable_share_signals();
        let second = enable_share_signals();
        let order = Arc::new(Mutex::new(Vec::new()));
        for (signals, label) in [(&first, "first"), (&second, "second")] {
            let order = order.clone();
            connect_signal(
                &signals.read().unwrap().on_share_result,
                Arc::new(move |_| order.lock().unwrap().push(label)),
                None,
            );
            attach_share_signals(&state, signals);
        }
        detach_share_signals(&state, &first);
        attach_share_signals(&state, &first);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("x"),
            &state,
        ))
        .unwrap();
        assert_eq!(*order.lock().unwrap(), ["second", "first"]);
    }
}

mod dispose_share_signals {
    use super::*;

    #[test]
    fn detaches_and_clears_listeners_but_the_group_can_be_used_again() {
        let state = share_state();
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
        attach_share_signals(&state, &signals);
        dispose_share_signals(&state, &signals);
        dispose_share_signals(&state, &signals);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("quiet"),
            &state,
        ))
        .unwrap();
        emit_signal(&signal, &share_result());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let count = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_share_signals(&state, &signals);
        block_on(share_content_with_result(
            &content_host(),
            &text_content("again"),
            &state,
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}

mod enable_share_signals {
    use super::*;

    #[test]
    fn creates_independent_entity_composed_groups_without_attaching_them() {
        let first = enable_share_signals();
        let second = enable_share_signals();
        assert_ne!(
            get_entity_uid(&mut *first.write().unwrap()),
            get_entity_uid(&mut *second.write().unwrap())
        );
        assert!(!Arc::ptr_eq(
            &first.read().unwrap().on_share_result.data,
            &second.read().unwrap().on_share_result.data
        ));
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        connect_signal(
            &first.read().unwrap().on_share_result,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        block_on(share_content_with_result(
            &content_host(),
            &text_content("inert"),
            &share_state(),
        ))
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod has_share_content_fields {
    use super::*;

    #[test]
    fn accepts_each_meaningful_source_vector() {
        let title = ShareContent::Title(ShareTitleContent {
            text: None,
            title: "T".to_string(),
            url: None,
        });
        let text = ShareContent::Text(ShareTextContent {
            text: "T".to_string(),
            title: None,
            url: None,
        });
        let url = ShareContent::Url(ShareUrlContent {
            text: None,
            title: None,
            url: "https://flight.dev".to_string(),
        });
        for content in [title, text, url] {
            assert!(has_share_content_fields(&content));
        }
    }

    #[test]
    fn checks_every_field_in_every_union_arm_without_trimming_or_url_parsing() {
        let absent_or_empty = [
            ShareContent::Title(ShareTitleContent {
                text: None,
                title: String::new(),
                url: Some(String::new()),
            }),
            ShareContent::Text(ShareTextContent {
                text: String::new(),
                title: Some(String::new()),
                url: None,
            }),
            ShareContent::Url(ShareUrlContent {
                text: Some(String::new()),
                title: None,
                url: String::new(),
            }),
        ];
        for content in absent_or_empty {
            assert!(!has_share_content_fields(&content));
        }
        let other_fields = [
            ShareContent::Title(ShareTitleContent {
                text: Some(" ".to_string()),
                title: String::new(),
                url: None,
            }),
            ShareContent::Title(ShareTitleContent {
                text: None,
                title: String::new(),
                url: Some("not a parsed URL".to_string()),
            }),
            ShareContent::Text(ShareTextContent {
                text: String::new(),
                title: Some("T".to_string()),
                url: None,
            }),
            ShareContent::Text(ShareTextContent {
                text: String::new(),
                title: None,
                url: Some("U".to_string()),
            }),
            ShareContent::Url(ShareUrlContent {
                text: Some("T".to_string()),
                title: None,
                url: String::new(),
            }),
            ShareContent::Url(ShareUrlContent {
                text: None,
                title: Some("T".to_string()),
                url: String::new(),
            }),
        ];
        for content in other_fields {
            assert!(has_share_content_fields(&content));
        }
    }
}

mod initialize_share_signals {
    use super::*;

    #[test]
    fn replaces_the_signal_without_replacing_runtime_or_attachment() {
        let state = share_state();
        let signals = enable_share_signals();
        let old_signal = signals.read().unwrap().on_share_result.clone();
        let old_calls = Arc::new(AtomicUsize::new(0));
        let count = old_calls.clone();
        connect_signal(
            &old_signal,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        set_entity_uid(&mut *signals.write().unwrap(), "existing-share".to_string());
        attach_share_signals(&state, &signals);
        initialize_share_signals(&mut signals.write().unwrap());
        assert_eq!(
            get_entity_uid(&mut *signals.write().unwrap()),
            "existing-share"
        );
        let new_calls = Arc::new(AtomicUsize::new(0));
        let count = new_calls.clone();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        block_on(share_content_with_result(
            &content_host(),
            &text_content("new"),
            &state,
        ))
        .unwrap();
        assert_eq!(new_calls.load(Ordering::SeqCst), 1);
        assert_eq!(old_calls.load(Ordering::SeqCst), 0);
        emit_signal(&old_signal, &share_result());
        assert_eq!(old_calls.load(Ordering::SeqCst), 1);
    }
}

mod is_share_file_valid {
    use super::*;

    #[test]
    fn accepts_portable_data_url_envelopes_including_an_empty_data_body() {
        let candidate = share_file();
        assert!(is_share_file_valid(&candidate.read().unwrap()));
        candidate.write().unwrap().data_url = "data:,".to_string();
        assert!(is_share_file_valid(&candidate.read().unwrap()));
    }

    #[test]
    fn rejects_each_source_malformed_descriptor() {
        for (name, mime, data) in [
            ("a.txt", "text/plain", "text/plain;base64,QQ=="),
            ("a.txt", "text/plain", "data:text/plain;base64"),
            ("a.txt", "", "data:text/plain;base64,QQ=="),
            ("", "text/plain", "data:text/plain;base64,QQ=="),
        ] {
            assert!(!is_share_file_valid(&ShareFile {
                name: name.to_string(),
                mime_type: mime.to_string(),
                data_url: data.to_string()
            }));
        }
    }

    #[test]
    fn does_not_decode_or_add_mime_name_or_url_restrictions() {
        assert!(is_share_file_valid(&ShareFile {
            name: " ".to_string(),
            mime_type: "not a MIME type".to_string(),
            data_url: "data:???not-base64,%%%".to_string()
        }));
        assert!(!is_share_file_valid(&ShareFile {
            name: "a".to_string(),
            mime_type: "b".to_string(),
            data_url: "DATA:,".to_string()
        }));
    }
}

mod share_content {
    use super::*;

    #[test]
    fn rejects_declared_but_empty_content_before_either_provider_dispatch() {
        let calls = Arc::new(AtomicUsize::new(0));
        let mut host = content_host();
        let count = calls.clone();
        host.can_share_content = Arc::new(move |_| {
            count.fetch_add(1, Ordering::SeqCst);
            true
        });
        let count = calls.clone();
        host.share_content = Arc::new(move |_| {
            count.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(true) })
        });
        let empty = text_content("");
        assert!(!can_share_content(&host, &empty));
        assert_eq!(block_on(share_content(&host, &empty)), Ok(false));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn forwards_content_identity_and_does_not_probe_before_sharing() {
        let content = text_content("hello");
        let expected = content.clone();
        let mut host = content_host();
        host.can_share_content = Arc::new(|_| panic!("shareContent does not probe the provider"));
        host.share_content = Arc::new(move |received| {
            assert!(Arc::ptr_eq(&received, &expected));
            Box::pin(async { Ok(true) })
        });
        assert_eq!(block_on(share_content(&host, &content)), Ok(true));
    }

    #[test]
    fn forwards_provider_false_and_the_exact_rejection_class_and_message() {
        let content = text_content("hello");
        let mut host = content_host();
        host.share_content = Arc::new(|_| Box::pin(async { Ok(false) }));
        assert_eq!(block_on(share_content(&host, &content)), Ok(false));
        host.share_content = Arc::new(|_| Box::pin(async { Err(provider_error()) }));
        assert_eq!(
            block_on(share_content(&host, &content)),
            Err(provider_error())
        );
    }
}

mod share_content_with_result {
    use super::*;

    #[test]
    fn returns_every_detailed_provider_outcome_without_interpreting_it() {
        for fields in [
            ShareResult {
                completed: true,
                activity_type: Some("mail".to_string()),
                dismissed: false,
            },
            ShareResult {
                completed: false,
                activity_type: None,
                dismissed: true,
            },
            ShareResult {
                completed: false,
                activity_type: Some(String::new()),
                dismissed: false,
            },
            ShareResult {
                completed: true,
                activity_type: None,
                dismissed: true,
            },
        ] {
            let result = Arc::new(RwLock::new(fields));
            let expected = result.clone();
            let mut host = content_host();
            host.share_content_with_result = Arc::new(move |_| {
                let result = result.clone();
                Box::pin(async move { Ok(result) })
            });
            let actual = block_on(share_content_with_result(
                &host,
                &title_content("flight"),
                &share_state(),
            ))
            .unwrap();
            assert!(Arc::ptr_eq(&actual, &expected));
        }
    }

    #[test]
    fn empty_payload_returns_fresh_false_null_false_without_dispatch_or_broadcast() {
        let state = share_state();
        let signals = enable_share_signals();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(|_| panic!("invalid content must not broadcast")),
            None,
        );
        attach_share_signals(&state, &signals);
        let mut host = content_host();
        host.share_content_with_result =
            Arc::new(|_| panic!("invalid content must not reach the provider"));
        let first = block_on(share_content_with_result(&host, &text_content(""), &state)).unwrap();
        let second = block_on(share_content_with_result(&host, &text_content(""), &state)).unwrap();
        assert_eq!(
            *first.read().unwrap(),
            ShareResult {
                completed: false,
                activity_type: None,
                dismissed: false
            }
        );
        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn rejection_passes_through_without_broadcasting_a_success_or_failure_record() {
        let state = share_state();
        let signals = enable_share_signals();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(|_| panic!("rejected provider result must not broadcast")),
            None,
        );
        attach_share_signals(&state, &signals);
        let mut host = content_host();
        host.share_content_with_result = Arc::new(|_| Box::pin(async { Err(provider_error()) }));
        assert_eq!(
            block_on(share_content_with_result(
                &host,
                &title_content("flight"),
                &state
            ))
            .unwrap_err(),
            provider_error()
        );
    }

    #[test]
    fn waits_for_the_provider_then_uses_the_current_attachment_set() {
        struct PendingResult(Arc<Mutex<Option<ShareOutcome>>>);
        impl Future for PendingResult {
            type Output = ShareOutcome;
            fn poll(
                self: std::pin::Pin<&mut Self>,
                _context: &mut Context<'_>,
            ) -> Poll<Self::Output> {
                return match self.0.lock().unwrap().take() {
                    Some(result) => Poll::Ready(result),
                    None => Poll::Pending,
                };
            }
        }
        let resolution = Arc::new(Mutex::new(None));
        let source = resolution.clone();
        let mut host = content_host();
        host.share_content_with_result = Arc::new(move |_| Box::pin(PendingResult(source.clone())));
        let state = share_state();
        let content = text_content("pending");
        let mut future = Box::pin(share_content_with_result(&host, &content, &state));
        let mut context = Context::from_waker(Waker::noop());
        assert!(future.as_mut().poll(&mut context).is_pending());
        let calls = Arc::new(AtomicUsize::new(0));
        let signals = enable_share_signals();
        let count = calls.clone();
        connect_signal(
            &signals.read().unwrap().on_share_result,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_share_signals(&state, &signals);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let result = share_result();
        *resolution.lock().unwrap() = Some(Ok(result.clone()));
        let Poll::Ready(Ok(actual)) = future.as_mut().poll(&mut context) else {
            panic!("ready provider outcome should complete");
        };
        assert!(Arc::ptr_eq(&actual, &result));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}

mod share_files {
    use super::*;

    #[test]
    fn dispatches_only_valid_nonempty_lists_in_source_order() {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let count = calls.clone();
        let captured = seen.clone();
        let mut host = files_host();
        host.share_content = Arc::new(move |content| {
            count.fetch_add(1, Ordering::SeqCst);
            captured.lock().unwrap().push(content);
            Box::pin(async { Ok(true) })
        });
        let file = share_file();
        assert_eq!(block_on(share_files(&host, &[file.clone()])), Ok(true));
        assert_eq!(block_on(share_files(&host, &[])), Ok(false));
        let invalid = share_file();
        invalid.write().unwrap().data_url = "not-a-data-url".to_string();
        assert_eq!(
            block_on(share_files(&host, &[file.clone(), invalid])),
            Ok(false)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let payload = seen.lock().unwrap()[0].clone();
        assert_eq!(payload.read().unwrap().files.len(), 1);
        assert!(Arc::ptr_eq(&payload.read().unwrap().files[0], &file));
    }

    #[test]
    fn copies_the_array_but_shares_ordered_repeated_file_descriptors_and_optional_absence() {
        let first = share_file();
        let second = share_file();
        second.write().unwrap().name = "second.txt".to_string();
        let files = vec![first.clone(), second.clone(), first.clone()];
        let retained = Arc::new(Mutex::new(Vec::new()));
        let captured = retained.clone();
        let mut host = files_host();
        host.share_content = Arc::new(move |content| {
            captured.lock().unwrap().push(content);
            Box::pin(async { Ok(true) })
        });
        block_on(share_files(&host, &files)).unwrap();
        let payload = retained.lock().unwrap()[0].clone();
        {
            let payload = payload.read().unwrap();
            assert!(payload.text.is_none() && payload.title.is_none() && payload.url.is_none());
            for (actual, expected) in payload.files.iter().zip(files.iter()) {
                assert!(Arc::ptr_eq(actual, expected));
            }
        }
        first.write().unwrap().name = "caller edited descriptor".to_string();
        assert_eq!(
            payload.read().unwrap().files[0].read().unwrap().name,
            "caller edited descriptor"
        );
        payload.write().unwrap().files.push(second);
        assert_eq!(files.len(), 3);
        assert_eq!(payload.read().unwrap().files.len(), 4);
    }

    #[test]
    fn forwards_provider_false_and_rejection_unchanged() {
        let mut host = files_host();
        host.share_content = Arc::new(|_| Box::pin(async { Ok(false) }));
        assert_eq!(block_on(share_files(&host, &[share_file()])), Ok(false));
        host.share_content = Arc::new(|_| Box::pin(async { Err(provider_error()) }));
        assert_eq!(
            block_on(share_files(&host, &[share_file()])),
            Err(provider_error())
        );
    }
}

mod share_text {
    use super::*;

    #[test]
    fn delegates_the_exact_text_only_record_through_the_content_slot() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert_eq!(
                *content.read().unwrap(),
                ShareContent::Text(ShareTextContent {
                    text: "hello".to_string(),
                    title: None,
                    url: None
                })
            );
            Box::pin(async { Ok(true) })
        });
        assert_eq!(block_on(share_text(&host, "hello")), Ok(true));
        assert_eq!(block_on(share_text(&host, "")), Ok(false));
    }

    #[test]
    fn forwards_rejection_and_does_not_trim_whitespace() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert!(
                matches!(&*content.read().unwrap(), ShareContent::Text(fields) if fields.text == " ")
            );
            Box::pin(async { Err(provider_error()) })
        });
        assert_eq!(block_on(share_text(&host, " ")), Err(provider_error()));
    }
}

mod share_url {
    use super::*;

    #[test]
    fn delegates_the_exact_url_only_record_through_the_content_slot() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert_eq!(
                *content.read().unwrap(),
                ShareContent::Url(ShareUrlContent {
                    text: None,
                    title: None,
                    url: "https://flight.dev".to_string()
                })
            );
            Box::pin(async { Ok(true) })
        });
        assert_eq!(block_on(share_url(&host, "https://flight.dev")), Ok(true));
        assert_eq!(block_on(share_url(&host, "")), Ok(false));
    }

    #[test]
    fn forwards_rejection_without_adding_url_syntax_validation() {
        let mut host = content_host();
        host.share_content = Arc::new(|content| {
            assert!(
                matches!(&*content.read().unwrap(), ShareContent::Url(fields) if fields.url == "not parsed")
            );
            Box::pin(async { Err(provider_error()) })
        });
        assert_eq!(
            block_on(share_url(&host, "not parsed")),
            Err(provider_error())
        );
    }
}
