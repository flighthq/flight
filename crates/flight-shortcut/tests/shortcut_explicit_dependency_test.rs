use std::future::{Future, poll_fn};
use std::pin::{Pin, pin};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Wake, Waker};

use flight_entity::Ref;
use flight_shortcut::contract::*;
use flight_signals::connect_signal;

struct NoopWake;

impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}

fn block_on<F: Future>(future: F) -> F::Output {
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    let mut future = pin!(future);
    loop {
        if let Poll::Ready(output) = future.as_mut().poll(&mut context) {
            return output;
        }
        std::thread::yield_now();
    }
}

fn poll_once<F: Future>(future: Pin<&mut F>) -> Poll<F::Output> {
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    return future.poll(&mut context);
}

fn shortcut(accelerator: &str) -> Ref<GlobalShortcut> {
    let CreateGlobalShortcutOutcome::Created(outcome) = create_global_shortcut(accelerator) else {
        panic!("expected shortcut to parse");
    };
    return outcome.shortcut;
}

fn subscription() -> Ref<ShortcutTriggerSubscription> {
    return Arc::new(RwLock::new(flight_entity::allocate_entity()));
}

fn trigger_provider() -> HostShortcutTriggerCapability {
    return HostShortcutTriggerCapability {
        provider: Arc::new(()),
        destroy: Arc::new(|| Box::pin(async { Ok(()) })),
        subscribe: Arc::new(|_, _| {
            let subscription = subscription();
            Box::pin(async move {
                Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                    ShortcutTriggerSubscribeOutcomeSubscribed { subscription },
                ))
            })
        }),
        unsubscribe: Arc::new(|_| {
            Box::pin(async {
                Ok(ShortcutTriggerUnsubscribeOutcome {
                    reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                })
            })
        }),
    };
}

mod attach_global_shortcut {
    use super::*;

    #[test]
    fn maps_native_refusal_to_a_method_tight_outcome() {
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new(|_, _| {
            Box::pin(async {
                Ok(ShortcutTriggerSubscribeOutcome::Refused(
                    ShortcutTriggerSubscribeOutcomeRefused {},
                ))
            })
        });
        let outcome = block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &provider,
            &shortcut("Control+K"),
        ));
        assert_eq!(outcome.reason, GlobalShortcutAttachReason::NativeRefused);
    }

    #[test]
    fn maps_attempted_provider_fault_without_inventing_absence() {
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new(|_, _| Box::pin(async { Err(None) }));
        let outcome = block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &provider,
            &shortcut("Control+J"),
        ));
        assert_eq!(
            outcome.reason,
            GlobalShortcutAttachReason::TriggerProviderFailed
        );
    }

    #[test]
    fn reports_same_chord_pending_without_invoking_provider_twice() {
        let ready = Arc::new(AtomicBool::new(false));
        let calls = Arc::new(AtomicUsize::new(0));
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new({
            let ready = ready.clone();
            let calls = calls.clone();
            move |_, _| {
                calls.fetch_add(1, Ordering::SeqCst);
                let ready = ready.clone();
                Box::pin(poll_fn(move |_| {
                    if ready.load(Ordering::SeqCst) {
                        Poll::Ready(Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                            ShortcutTriggerSubscribeOutcomeSubscribed {
                                subscription: subscription(),
                            },
                        )))
                    } else {
                        Poll::Pending
                    }
                }))
            }
        });
        let state = create_shortcut_state();
        let first_shortcut = shortcut("Control+P");
        let second_shortcut = shortcut("ctrl+p");
        let mut first = Box::pin(attach_global_shortcut(&state, &provider, &first_shortcut));
        assert!(poll_once(first.as_mut()).is_pending());
        let second = block_on(attach_global_shortcut(&state, &provider, &second_shortcut));
        assert_eq!(
            second.reason,
            GlobalShortcutAttachReason::RegistrationInProgress
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        ready.store(true, Ordering::SeqCst);
        assert_eq!(block_on(first).reason, GlobalShortcutAttachReason::Attached);
    }

    #[test]
    fn does_not_overwrite_the_first_live_same_chord_registration() {
        let provider = trigger_provider();
        let state = create_shortcut_state();
        assert_eq!(
            block_on(attach_global_shortcut(
                &state,
                &provider,
                &shortcut("Control+B")
            ))
            .reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(
            block_on(attach_global_shortcut(
                &state,
                &provider,
                &shortcut("ctrl+b")
            ))
            .reason,
            GlobalShortcutAttachReason::AlreadyRegistered
        );
    }

    #[test]
    fn reports_the_same_entity_as_already_attached() {
        let provider = trigger_provider();
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+A");
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &shortcut)).reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &shortcut)).reason,
            GlobalShortcutAttachReason::AlreadyAttached
        );
    }

    #[test]
    fn emits_the_shortcut_signal_and_preserves_subscription_identity() {
        let provider_trigger = Arc::new(Mutex::new(None::<ShortcutTriggerListener>));
        let acquired = subscription();
        let released = Arc::new(Mutex::new(None::<Ref<ShortcutTriggerSubscription>>));
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new({
            let provider_trigger = provider_trigger.clone();
            let acquired = acquired.clone();
            move |_, trigger| {
                *provider_trigger.lock().unwrap() = Some(trigger);
                let acquired = acquired.clone();
                Box::pin(async move {
                    Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                        ShortcutTriggerSubscribeOutcomeSubscribed {
                            subscription: acquired,
                        },
                    ))
                })
            }
        });
        provider.unsubscribe = Arc::new({
            let released = released.clone();
            move |token| {
                *released.lock().unwrap() = Some(token.clone());
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }
        });
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+T");
        let deliveries = Arc::new(AtomicUsize::new(0));
        connect_signal(
            &shortcut.read().unwrap().on_trigger,
            Arc::new({
                let deliveries = deliveries.clone();
                move |_| {
                    deliveries.fetch_add(1, Ordering::SeqCst);
                }
            }),
            None,
        );
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &shortcut)).reason,
            GlobalShortcutAttachReason::Attached
        );
        provider_trigger.lock().unwrap().as_ref().unwrap()();
        assert_eq!(deliveries.load(Ordering::SeqCst), 1);
        block_on(detach_global_shortcut(&provider, &shortcut));
        assert!(Arc::ptr_eq(
            released.lock().unwrap().as_ref().unwrap(),
            &acquired
        ));
    }

    #[test]
    fn cancellation_releases_the_pending_reservation_for_retry() {
        let calls = Arc::new(AtomicUsize::new(0));
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new({
            let calls = calls.clone();
            move |_, _| {
                let call = calls.fetch_add(1, Ordering::SeqCst);
                if call == 0 {
                    Box::pin(poll_fn(|_| Poll::Pending))
                } else {
                    let token = subscription();
                    Box::pin(async move {
                        Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                            ShortcutTriggerSubscribeOutcomeSubscribed {
                                subscription: token,
                            },
                        ))
                    })
                }
            }
        });
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+C");
        let mut first = Box::pin(attach_global_shortcut(&state, &provider, &shortcut));
        assert!(poll_once(first.as_mut()).is_pending());
        drop(first);
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &shortcut)).reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}

mod create_global_shortcut {
    use super::*;

    #[test]
    fn returns_an_entity_with_normalized_accelerator_and_signal() {
        let shortcut = shortcut("shift+ctrl+k");
        let shortcut = shortcut.read().unwrap();
        assert_eq!(shortcut.accelerator, "Control+Shift+K");
        assert!(shortcut.on_trigger.data.read().unwrap().is_none());
    }

    #[test]
    fn returns_parse_specific_failure_before_any_provider() {
        let CreateGlobalShortcutOutcome::Unparseable(outcome) =
            create_global_shortcut("Control+NotAKey")
        else {
            panic!("expected parse failure");
        };
        assert_eq!(
            outcome.parse_error,
            AcceleratorParseError {
                token: "NotAKey".into(),
                reason: AcceleratorParseErrorReason::UnknownKey
            }
        );
    }
}

mod create_shortcut_state {
    use super::*;

    #[test]
    fn creates_independent_registration_domains() {
        let provider = trigger_provider();
        let shortcut_a = shortcut("Control+S");
        let shortcut_b = shortcut("Control+S");
        assert_eq!(
            block_on(attach_global_shortcut(
                &create_shortcut_state(),
                &provider,
                &shortcut_a
            ))
            .reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(
            block_on(attach_global_shortcut(
                &create_shortcut_state(),
                &provider,
                &shortcut_b
            ))
            .reason,
            GlobalShortcutAttachReason::Attached
        );
    }
}

mod destroy_shortcut_trigger {
    use super::*;

    #[test]
    fn awaits_the_exact_provider_destroy_boundary() {
        let calls = Arc::new(AtomicUsize::new(0));
        let mut provider = trigger_provider();
        provider.destroy = Arc::new({
            let calls = calls.clone();
            move || {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Ok(()) })
            }
        });
        assert!(block_on(destroy_shortcut_trigger(&provider)).is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn preserves_an_explicit_null_rejection() {
        let mut provider = trigger_provider();
        provider.destroy = Arc::new(|| Box::pin(async { Err(None) }));
        assert!(matches!(
            block_on(destroy_shortcut_trigger(&provider)),
            Err(None)
        ));
    }
}

mod detach_global_shortcut {
    use super::*;

    #[test]
    fn removes_the_registered_accelerator_without_disturbing_an_unrelated_accelerator() {
        let provider = trigger_provider();
        let state = create_shortcut_state();
        let original = shortcut("Control+L");
        let unrelated = shortcut("Control+M");
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &original)).reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &unrelated)).reason,
            GlobalShortcutAttachReason::Attached
        );

        original.write().unwrap().accelerator = "Control+M".into();
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &original)).reason,
            GlobalShortcutDetachReason::Detached
        );

        let replacement = shortcut("Control+L");
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &replacement)).reason,
            GlobalShortcutAttachReason::Attached
        );
        assert_eq!(
            block_on(attach_global_shortcut(
                &state,
                &provider,
                &shortcut("Control+M")
            ))
            .reason,
            GlobalShortcutAttachReason::AlreadyRegistered
        );
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &replacement)).reason,
            GlobalShortcutDetachReason::Detached
        );
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &unrelated)).reason,
            GlobalShortcutDetachReason::Detached
        );
    }

    #[test]
    fn uses_the_origin_provider_after_host_replacement() {
        let origin_calls = Arc::new(AtomicUsize::new(0));
        let replacement_calls = Arc::new(AtomicUsize::new(0));
        let mut origin = trigger_provider();
        origin.unsubscribe = Arc::new({
            let calls = origin_calls.clone();
            move |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }
        });
        let mut replacement = trigger_provider();
        replacement.unsubscribe = Arc::new({
            let calls = replacement_calls.clone();
            move |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }
        });
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+D");
        block_on(attach_global_shortcut(&state, &origin, &shortcut));
        assert_eq!(
            block_on(detach_global_shortcut(&replacement, &shortcut)).reason,
            GlobalShortcutDetachReason::Detached
        );
        assert_eq!(origin_calls.load(Ordering::SeqCst), 1);
        assert_eq!(replacement_calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn retains_a_failed_release_for_exact_retry() {
        let calls = Arc::new(AtomicUsize::new(0));
        let tokens = Arc::new(Mutex::new(Vec::<Ref<ShortcutTriggerSubscription>>::new()));
        let mut provider = trigger_provider();
        provider.unsubscribe = Arc::new({
            let calls = calls.clone();
            let tokens = tokens.clone();
            move |token| {
                tokens.lock().unwrap().push(token.clone());
                let call = calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move {
                    if call == 0 {
                        Err(None)
                    } else {
                        Ok(ShortcutTriggerUnsubscribeOutcome {
                            reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                        })
                    }
                })
            }
        });
        let state = create_shortcut_state();
        let original = shortcut("Control+R");
        block_on(attach_global_shortcut(&state, &provider, &original));
        original.write().unwrap().accelerator = "Control+I".into();
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &original)).reason,
            GlobalShortcutDetachReason::TriggerProviderFailed
        );
        let replacement = shortcut("Control+R");
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &replacement)).reason,
            GlobalShortcutAttachReason::AlreadyRegistered
        );
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &original)).reason,
            GlobalShortcutDetachReason::Detached
        );
        let tokens = tokens.lock().unwrap();
        assert_eq!(tokens.len(), 2);
        assert!(Arc::ptr_eq(&tokens[0], &tokens[1]));
        drop(tokens);
        assert_eq!(
            block_on(attach_global_shortcut(&state, &provider, &replacement)).reason,
            GlobalShortcutAttachReason::Attached
        );
    }

    #[test]
    fn selects_the_current_record_for_the_same_canonical_provider() {
        let provider_ref: ProviderRef = Arc::new(());
        let origin_calls = Arc::new(AtomicUsize::new(0));
        let selected_calls = Arc::new(AtomicUsize::new(0));
        let mut origin = trigger_provider();
        origin.provider = provider_ref.clone();
        origin.unsubscribe = Arc::new({
            let calls = origin_calls.clone();
            move |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }
        });
        let mut selected = trigger_provider();
        selected.provider = provider_ref;
        selected.unsubscribe = Arc::new({
            let calls = selected_calls.clone();
            move |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }
        });
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+O");
        block_on(attach_global_shortcut(&state, &origin, &shortcut));
        assert_eq!(
            block_on(detach_global_shortcut(&selected, &shortcut)).reason,
            GlobalShortcutDetachReason::Detached
        );
        assert_eq!(origin_calls.load(Ordering::SeqCst), 0);
        assert_eq!(selected_calls.load(Ordering::SeqCst), 1);
    }
}

mod dispose_global_shortcut {
    use super::*;

    #[test]
    fn clears_listeners_on_failure_and_preserves_release_for_retry() {
        let provider_trigger = Arc::new(Mutex::new(None::<ShortcutTriggerListener>));
        let calls = Arc::new(AtomicUsize::new(0));
        let mut provider = trigger_provider();
        provider.subscribe = Arc::new({
            let provider_trigger = provider_trigger.clone();
            move |_, trigger| {
                *provider_trigger.lock().unwrap() = Some(trigger);
                let token = subscription();
                Box::pin(async move {
                    Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                        ShortcutTriggerSubscribeOutcomeSubscribed {
                            subscription: token,
                        },
                    ))
                })
            }
        });
        provider.unsubscribe = Arc::new({
            let calls = calls.clone();
            move |_| {
                let call = calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move {
                    if call == 0 {
                        Err(None)
                    } else {
                        Ok(ShortcutTriggerUnsubscribeOutcome {
                            reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                        })
                    }
                })
            }
        });
        let state = create_shortcut_state();
        let shortcut = shortcut("Control+X");
        let deliveries = Arc::new(AtomicUsize::new(0));
        connect_signal(
            &shortcut.read().unwrap().on_trigger,
            Arc::new({
                let deliveries = deliveries.clone();
                move |_| {
                    deliveries.fetch_add(1, Ordering::SeqCst);
                }
            }),
            None,
        );
        block_on(attach_global_shortcut(&state, &provider, &shortcut));
        assert_eq!(
            block_on(dispose_global_shortcut(&provider, &shortcut)).reason,
            GlobalShortcutDetachReason::TriggerProviderFailed
        );
        provider_trigger.lock().unwrap().as_ref().unwrap()();
        assert_eq!(deliveries.load(Ordering::SeqCst), 0);
        assert_eq!(
            block_on(detach_global_shortcut(&provider, &shortcut)).reason,
            GlobalShortcutDetachReason::Detached
        );
    }
}

mod get_create_global_shortcut_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        assert_eq!(
            get_create_global_shortcut_reason_string(CreateGlobalShortcutReason::Created),
            "created"
        );
        assert_eq!(
            get_create_global_shortcut_reason_string(CreateGlobalShortcutReason::Unparseable),
            "unparseable"
        );
    }
}

mod get_global_shortcut_attach_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        let values = [
            (
                GlobalShortcutAttachReason::AlreadyAttached,
                "already-attached",
            ),
            (
                GlobalShortcutAttachReason::AlreadyRegistered,
                "already-registered",
            ),
            (GlobalShortcutAttachReason::Attached, "attached"),
            (GlobalShortcutAttachReason::NativeRefused, "native-refused"),
            (
                GlobalShortcutAttachReason::RegistrationInProgress,
                "registration-in-progress",
            ),
            (
                GlobalShortcutAttachReason::TriggerProviderFailed,
                "trigger-provider-failed",
            ),
        ];
        for (value, spelling) in values {
            assert_eq!(get_global_shortcut_attach_reason_string(value), spelling);
        }
    }
}

mod get_global_shortcut_detach_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        let values = [
            (GlobalShortcutDetachReason::Detached, "detached"),
            (GlobalShortcutDetachReason::NotAttached, "not-attached"),
            (
                GlobalShortcutDetachReason::TriggerProviderFailed,
                "trigger-provider-failed",
            ),
        ];
        for (value, spelling) in values {
            assert_eq!(get_global_shortcut_detach_reason_string(value), spelling);
        }
    }
}

mod get_global_shortcut_query_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        let values = [
            (GlobalShortcutQueryReason::NotRegistered, "not-registered"),
            (
                GlobalShortcutQueryReason::QueryProviderFailed,
                "query-provider-failed",
            ),
            (GlobalShortcutQueryReason::Registered, "registered"),
            (GlobalShortcutQueryReason::Unparseable, "unparseable"),
        ];
        for (value, spelling) in values {
            assert_eq!(get_global_shortcut_query_reason_string(value), spelling);
        }
    }
}

mod get_shortcut_trigger_subscribe_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        assert_eq!(
            get_shortcut_trigger_subscribe_reason_string(ShortcutTriggerSubscribeReason::Refused),
            "refused"
        );
        assert_eq!(
            get_shortcut_trigger_subscribe_reason_string(
                ShortcutTriggerSubscribeReason::Subscribed
            ),
            "subscribed"
        );
    }
}

mod get_shortcut_trigger_unsubscribe_reason_string {
    use super::*;

    #[test]
    fn returns_exact_source_spellings() {
        assert_eq!(
            get_shortcut_trigger_unsubscribe_reason_string(
                ShortcutTriggerUnsubscribeReason::UnknownSubscription
            ),
            "unknown-subscription"
        );
        assert_eq!(
            get_shortcut_trigger_unsubscribe_reason_string(
                ShortcutTriggerUnsubscribeReason::Unsubscribed
            ),
            "unsubscribed"
        );
    }
}

mod initialize_global_shortcut {
    use super::*;

    #[test]
    fn initializes_the_constructor_fields() {
        let mut out: GlobalShortcut = flight_entity::allocate_entity();
        initialize_global_shortcut(&mut out, "Control+I".into());
        assert_eq!(out.accelerator, "Control+I");
        assert!(out.on_trigger.data.read().unwrap().is_none());
    }
}

mod parse_create_global_shortcut_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        assert_eq!(
            parse_create_global_shortcut_reason("created"),
            Some(CreateGlobalShortcutReason::Created)
        );
        assert_eq!(
            parse_create_global_shortcut_reason("unparseable"),
            Some(CreateGlobalShortcutReason::Unparseable)
        );
        assert_eq!(parse_create_global_shortcut_reason("unknown"), None);
    }
}

mod parse_global_shortcut_attach_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        let values = [
            (
                "already-attached",
                GlobalShortcutAttachReason::AlreadyAttached,
            ),
            (
                "already-registered",
                GlobalShortcutAttachReason::AlreadyRegistered,
            ),
            ("attached", GlobalShortcutAttachReason::Attached),
            ("native-refused", GlobalShortcutAttachReason::NativeRefused),
            (
                "registration-in-progress",
                GlobalShortcutAttachReason::RegistrationInProgress,
            ),
            (
                "trigger-provider-failed",
                GlobalShortcutAttachReason::TriggerProviderFailed,
            ),
        ];
        for (spelling, value) in values {
            assert_eq!(parse_global_shortcut_attach_reason(spelling), Some(value));
        }
        assert_eq!(parse_global_shortcut_attach_reason("unknown"), None);
    }
}

mod parse_global_shortcut_detach_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        let values = [
            ("detached", GlobalShortcutDetachReason::Detached),
            ("not-attached", GlobalShortcutDetachReason::NotAttached),
            (
                "trigger-provider-failed",
                GlobalShortcutDetachReason::TriggerProviderFailed,
            ),
        ];
        for (spelling, value) in values {
            assert_eq!(parse_global_shortcut_detach_reason(spelling), Some(value));
        }
        assert_eq!(parse_global_shortcut_detach_reason("unknown"), None);
    }
}

mod parse_global_shortcut_query_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        let values = [
            ("not-registered", GlobalShortcutQueryReason::NotRegistered),
            (
                "query-provider-failed",
                GlobalShortcutQueryReason::QueryProviderFailed,
            ),
            ("registered", GlobalShortcutQueryReason::Registered),
            ("unparseable", GlobalShortcutQueryReason::Unparseable),
        ];
        for (spelling, value) in values {
            assert_eq!(parse_global_shortcut_query_reason(spelling), Some(value));
        }
        assert_eq!(parse_global_shortcut_query_reason("unknown"), None);
    }
}

mod parse_shortcut_trigger_subscribe_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        assert_eq!(
            parse_shortcut_trigger_subscribe_reason("refused"),
            Some(ShortcutTriggerSubscribeReason::Refused)
        );
        assert_eq!(
            parse_shortcut_trigger_subscribe_reason("subscribed"),
            Some(ShortcutTriggerSubscribeReason::Subscribed)
        );
        assert_eq!(parse_shortcut_trigger_subscribe_reason("unknown"), None);
    }
}

mod parse_shortcut_trigger_unsubscribe_reason {
    use super::*;

    #[test]
    fn parses_exact_spellings_and_rejects_unknown_values() {
        assert_eq!(
            parse_shortcut_trigger_unsubscribe_reason("unknown-subscription"),
            Some(ShortcutTriggerUnsubscribeReason::UnknownSubscription)
        );
        assert_eq!(
            parse_shortcut_trigger_unsubscribe_reason("unsubscribed"),
            Some(ShortcutTriggerUnsubscribeReason::Unsubscribed)
        );
        assert_eq!(parse_shortcut_trigger_unsubscribe_reason("unknown"), None);
    }
}

mod query_global_shortcut_conflict {
    use super::*;

    #[test]
    fn preserves_the_exact_query_witness_outcome() {
        let provider = HostShortcutQueryCapability {
            provider: Arc::new(()),
            is_registered: Arc::new(|_| Box::pin(async { Ok(true) })),
        };
        assert!(matches!(
            block_on(query_global_shortcut_conflict(&provider, "Control+Q")),
            GlobalShortcutQueryOutcome::Registered(_)
        ));
    }
}

mod query_global_shortcut_registration {
    use super::*;

    #[test]
    fn parses_before_querying_and_returns_the_exact_error() {
        let calls = Arc::new(AtomicUsize::new(0));
        let provider = HostShortcutQueryCapability {
            provider: Arc::new(()),
            is_registered: Arc::new({
                let calls = calls.clone();
                move |_| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async { Ok(false) })
                }
            }),
        };
        let GlobalShortcutQueryOutcome::Unparseable(outcome) = block_on(
            query_global_shortcut_registration(&provider, "Control+NotAKey"),
        ) else {
            panic!("expected parse failure");
        };
        assert_eq!(outcome.parse_error.token, "NotAKey");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn distinguishes_registered_not_registered_and_provider_fault() {
        for (answer, expected) in [
            (Ok(true), GlobalShortcutQueryReason::Registered),
            (Ok(false), GlobalShortcutQueryReason::NotRegistered),
            (Err(None), GlobalShortcutQueryReason::QueryProviderFailed),
        ] {
            let provider = HostShortcutQueryCapability {
                provider: Arc::new(()),
                is_registered: Arc::new(move |_| {
                    let answer = answer.clone();
                    Box::pin(async move { answer })
                }),
            };
            let outcome = block_on(query_global_shortcut_registration(&provider, "Control+Q"));
            let actual = match outcome {
                GlobalShortcutQueryOutcome::NotRegistered(_) => {
                    GlobalShortcutQueryReason::NotRegistered
                }
                GlobalShortcutQueryOutcome::QueryProviderFailed(_) => {
                    GlobalShortcutQueryReason::QueryProviderFailed
                }
                GlobalShortcutQueryOutcome::Registered(_) => GlobalShortcutQueryReason::Registered,
                GlobalShortcutQueryOutcome::Unparseable(_) => {
                    GlobalShortcutQueryReason::Unparseable
                }
            };
            assert_eq!(actual, expected);
        }
    }

    #[test]
    fn sends_the_normalized_accelerator_to_the_provider() {
        let observed = Arc::new(Mutex::new(String::new()));
        let provider = HostShortcutQueryCapability {
            provider: Arc::new(()),
            is_registered: Arc::new({
                let observed = observed.clone();
                move |accelerator| {
                    *observed.lock().unwrap() = accelerator.to_string();
                    Box::pin(async { Ok(false) })
                }
            }),
        };
        block_on(query_global_shortcut_registration(
            &provider,
            "shift-ctrl-q",
        ));
        assert_eq!(*observed.lock().unwrap(), "Control+Shift+Q");
    }
}
