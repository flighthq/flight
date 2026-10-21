use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind};
use flight_geolocation::*;
use flight_notification::*;
use flight_permissions::*;

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn error() -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: "provider failed".to_string(),
    };
}

fn geolocation(
    prompt_for_access: Option<Arc<dyn Fn() -> GeolocationPromptFuture + Send + Sync>>,
) -> HostGeolocationCapability {
    return HostGeolocationCapability {
        clear_watch: Arc::new(|_watch_id| {}),
        get_current_position: Arc::new(|_options| Box::pin(async { None })),
        get_current_position_result: Arc::new(|_options| {
            Box::pin(async {
                GeolocationPositionResult {
                    position: None,
                    reason: Some(GeolocationErrorReason::Unavailable),
                }
            })
        }),
        is_available: Arc::new(|| true),
        watch_position: Arc::new(|_listener, _options, _error_listener| -1),
        prompt_for_access,
    };
}

fn notification(
    permission: Option<NotificationPermission>,
    query_reason: NotificationLifecycleReason,
    request_reason: NotificationPermissionRequestReason,
) -> HostNotificationPermissionCapability {
    return HostNotificationPermissionCapability {
        get_permission: Arc::new(move || {
            Box::pin(async move {
                NotificationPermissionQueryOutcome {
                    reason: query_reason,
                    permission,
                }
            })
        }),
        request_permission: Arc::new(move || {
            Box::pin(async move {
                NotificationPermissionRequestOutcome {
                    reason: request_reason,
                }
            })
        }),
        provider: Arc::new(()),
    };
}

fn permissions() -> HostPermissionsCapability {
    return HostPermissionsCapability {
        notification: notification(
            Some(NotificationPermission::Default),
            NotificationLifecycleReason::Ok,
            NotificationPermissionRequestReason::Dismissed,
        ),
        provider: Arc::new(()),
        query_permission: Arc::new(|_name| {
            Box::pin(async {
                Ok(PermissionQueryOutcome {
                    reason: PermissionQueryReason::Unsupported,
                    state: None,
                })
            })
        }),
        request_media_access: Arc::new(|_name| {
            Box::pin(async {
                Ok(PermissionRequestOutcome {
                    reason: PermissionRequestReason::RuntimeUnavailable,
                    state: None,
                })
            })
        }),
        request_wake_lock: Arc::new(|| {
            Box::pin(async {
                Ok(PermissionRequestOutcome {
                    reason: PermissionRequestReason::RuntimeUnavailable,
                    state: None,
                })
            })
        }),
    };
}

fn query_outcome(
    reason: PermissionQueryReason,
    state: Option<PermissionState>,
) -> PermissionQueryOutcome {
    return PermissionQueryOutcome { reason, state };
}

fn request_outcome(
    reason: PermissionRequestReason,
    state: Option<PermissionState>,
) -> PermissionRequestOutcome {
    return PermissionRequestOutcome { reason, state };
}

mod get_permission_state {
    use super::*;

    #[test]
    fn delegates_generic_queries_and_maps_rejected_promises() {
        let names = Arc::new(Mutex::new(Vec::new()));
        let captured = names.clone();
        let mut provider = permissions();
        provider.query_permission = Arc::new(move |name| {
            captured.lock().unwrap().push(name);
            Box::pin(async {
                Ok(query_outcome(
                    PermissionQueryReason::Ok,
                    Some(PermissionState::Granted),
                ))
            })
        });
        assert_eq!(
            block_on(get_permission_state(&provider, None, None, "camera")),
            query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Granted))
        );
        assert_eq!(*names.lock().unwrap(), vec!["camera".to_string()]);

        provider.query_permission = Arc::new(|_name| Box::pin(async { Err(error()) }));
        assert_eq!(
            block_on(get_permission_state(&provider, None, None, "camera")),
            query_outcome(PermissionQueryReason::OperationFailed, None)
        );
    }

    #[test]
    fn projects_midi_only_from_the_explicit_optional_owner() {
        let calls = Arc::new(AtomicUsize::new(0));
        let captured = calls.clone();
        let midi = HostMidiPermissionCapability {
            get_permission: Arc::new(move || {
                captured.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(query_outcome(
                        PermissionQueryReason::Ok,
                        Some(PermissionState::Prompt),
                    ))
                })
            }),
            provider: Arc::new(()),
        };
        assert_eq!(
            block_on(get_permission_state(
                &permissions(),
                Some(&midi),
                None,
                "midi"
            )),
            query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Prompt))
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            block_on(get_permission_state(&permissions(), None, None, "midi")),
            query_outcome(PermissionQueryReason::Unsupported, None)
        );
        let rejected = HostMidiPermissionCapability {
            get_permission: Arc::new(|| Box::pin(async { Err(error()) })),
            provider: Arc::new(()),
        };
        assert_eq!(
            block_on(get_permission_state(
                &permissions(),
                Some(&rejected),
                None,
                "midi"
            )),
            query_outcome(PermissionQueryReason::OperationFailed, None)
        );
    }

    #[test]
    fn projects_notification_without_requesting() {
        let cases = [
            (NotificationPermission::Granted, PermissionState::Granted),
            (NotificationPermission::Denied, PermissionState::Denied),
            (NotificationPermission::Default, PermissionState::Prompt),
        ];
        for (permission, state) in cases {
            let get_calls = Arc::new(AtomicUsize::new(0));
            let request_calls = Arc::new(AtomicUsize::new(0));
            let captured_get = get_calls.clone();
            let captured_request = request_calls.clone();
            let mut provider = permissions();
            provider.notification = HostNotificationPermissionCapability {
                get_permission: Arc::new(move || {
                    captured_get.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move {
                        NotificationPermissionQueryOutcome {
                            reason: NotificationLifecycleReason::Ok,
                            permission: Some(permission),
                        }
                    })
                }),
                request_permission: Arc::new(move || {
                    captured_request.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async {
                        NotificationPermissionRequestOutcome {
                            reason: NotificationPermissionRequestReason::Granted,
                        }
                    })
                }),
                provider: Arc::new(()),
            };
            assert_eq!(
                block_on(get_permission_state(&provider, None, None, "notifications")),
                query_outcome(PermissionQueryReason::Ok, Some(state))
            );
            assert_eq!(get_calls.load(Ordering::SeqCst), 1);
            assert_eq!(request_calls.load(Ordering::SeqCst), 0);
        }

        let mut failed = permissions();
        failed.notification = notification(
            Some(NotificationPermission::Granted),
            NotificationLifecycleReason::OperationFailed,
            NotificationPermissionRequestReason::Granted,
        );
        assert_eq!(
            block_on(get_permission_state(&failed, None, None, "notifications")),
            query_outcome(PermissionQueryReason::OperationFailed, None)
        );
    }

    #[test]
    fn projects_storage_snapshots_without_inferring_field_consistency() {
        let cases = [
            (
                StoragePersistenceOutcomeReason::Persistent,
                Some(PermissionState::Denied),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Granted)),
            ),
            (
                StoragePersistenceOutcomeReason::OperationFailed,
                Some(PermissionState::Granted),
                query_outcome(PermissionQueryReason::OperationFailed, None),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Granted),
                query_outcome(
                    PermissionQueryReason::BestEffort,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Denied),
                query_outcome(
                    PermissionQueryReason::BestEffort,
                    Some(PermissionState::Denied),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Prompt),
                query_outcome(
                    PermissionQueryReason::BestEffort,
                    Some(PermissionState::Prompt),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                None,
                query_outcome(PermissionQueryReason::BestEffort, None),
            ),
        ];
        for (outcome, permission_state, expected) in cases {
            let persistence = HostPreferencesPersistenceQueryCapability {
                get_persistence: Arc::new(move || {
                    Box::pin(async move {
                        Ok(StoragePersistenceOutcome {
                            outcome,
                            permission_state,
                        })
                    })
                }),
                provider: Arc::new(()),
            };
            assert_eq!(
                block_on(get_permission_state(
                    &permissions(),
                    None,
                    Some(&persistence),
                    "persistent-storage"
                )),
                expected
            );
        }
        assert_eq!(
            block_on(get_permission_state(
                &permissions(),
                None,
                None,
                "persistent-storage"
            )),
            query_outcome(PermissionQueryReason::Unsupported, None)
        );
        let rejected = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(|| Box::pin(async { Err(error()) })),
            provider: Arc::new(()),
        };
        assert_eq!(
            block_on(get_permission_state(
                &permissions(),
                None,
                Some(&rejected),
                "persistent-storage"
            )),
            query_outcome(PermissionQueryReason::OperationFailed, None)
        );
    }
}

mod get_permission_states {
    use super::*;

    #[test]
    fn captures_each_needed_owner_once_for_repeated_and_mixed_names() {
        let notification_calls = Arc::new(AtomicUsize::new(0));
        let query_calls = Arc::new(AtomicUsize::new(0));
        let midi_calls = Arc::new(AtomicUsize::new(0));
        let persistence_calls = Arc::new(AtomicUsize::new(0));
        let mut provider = permissions();
        let captured = notification_calls.clone();
        provider.notification.get_permission = Arc::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                NotificationPermissionQueryOutcome {
                    reason: NotificationLifecycleReason::Ok,
                    permission: Some(NotificationPermission::Granted),
                }
            })
        });
        let captured = query_calls.clone();
        provider.query_permission = Arc::new(move |_name| {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                Ok(query_outcome(
                    PermissionQueryReason::Ok,
                    Some(PermissionState::Denied),
                ))
            })
        });
        let captured = midi_calls.clone();
        let midi = HostMidiPermissionCapability {
            get_permission: Arc::new(move || {
                captured.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(query_outcome(
                        PermissionQueryReason::Ok,
                        Some(PermissionState::Prompt),
                    ))
                })
            }),
            provider: Arc::new(()),
        };
        let captured = persistence_calls.clone();
        let persistence = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                captured.fetch_add(1, Ordering::SeqCst);
                Box::pin(async {
                    Ok(StoragePersistenceOutcome {
                        outcome: StoragePersistenceOutcomeReason::BestEffort,
                        permission_state: None,
                    })
                })
            }),
            provider: Arc::new(()),
        };
        let names = [
            "notifications".to_string(),
            "camera".to_string(),
            "midi".to_string(),
            "persistent-storage".to_string(),
            "notifications".to_string(),
        ];
        assert_eq!(
            block_on(get_permission_states(
                &provider,
                Some(&midi),
                Some(&persistence),
                &names,
            )),
            vec![
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Granted)),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Denied)),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Prompt)),
                query_outcome(PermissionQueryReason::BestEffort, None),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Granted)),
            ]
        );
        assert_eq!(notification_calls.load(Ordering::SeqCst), 2);
        assert_eq!(query_calls.load(Ordering::SeqCst), 1);
        assert_eq!(midi_calls.load(Ordering::SeqCst), 1);
        assert_eq!(persistence_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn does_not_resolve_any_owner_for_an_empty_batch() {
        let calls = Arc::new(AtomicUsize::new(0));
        let captured = calls.clone();
        let mut provider = permissions();
        provider.query_permission = Arc::new(move |_name| {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(query_outcome(PermissionQueryReason::Unsupported, None)) })
        });
        assert_eq!(
            block_on(get_permission_states(&provider, None, None, &[])),
            Vec::<PermissionQueryOutcome>::new()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn starts_all_work_before_completion_and_keeps_input_order() {
        let started = Arc::new(AtomicUsize::new(0));
        let next = Arc::new(AtomicUsize::new(0));
        let mut provider = permissions();
        provider.query_permission = Arc::new(move |_name| {
            let index = next.fetch_add(1, Ordering::SeqCst);
            let started = started.clone();
            Box::pin(async move {
                started.fetch_add(1, Ordering::SeqCst);
                let state = [
                    PermissionState::Granted,
                    PermissionState::Denied,
                    PermissionState::Prompt,
                ][index];
                return std::future::poll_fn(move |context| {
                    if started.load(Ordering::SeqCst) == 3 {
                        return Poll::Ready(Ok(query_outcome(
                            PermissionQueryReason::Ok,
                            Some(state),
                        )));
                    }
                    context.waker().wake_by_ref();
                    return Poll::Pending;
                })
                .await;
            })
        });
        let names = [
            "camera".to_string(),
            "microphone".to_string(),
            "camera".to_string(),
        ];
        assert_eq!(
            block_on(get_permission_states(&provider, None, None, &names)),
            vec![
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Granted)),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Denied)),
                query_outcome(PermissionQueryReason::Ok, Some(PermissionState::Prompt)),
            ]
        );
    }
}

mod request_permission {
    use super::*;

    #[test]
    fn delegates_media_and_wake_lock_and_preserves_owner_outcomes() {
        let media_names = Arc::new(Mutex::new(Vec::new()));
        let wake_calls = Arc::new(AtomicUsize::new(0));
        let mut provider = permissions();
        let captured = media_names.clone();
        provider.request_media_access = Arc::new(move |name| {
            captured.lock().unwrap().push(name);
            Box::pin(async {
                Ok(request_outcome(
                    PermissionRequestReason::CleanupFailed,
                    Some(PermissionState::Granted),
                ))
            })
        });
        let captured = wake_calls.clone();
        provider.request_wake_lock = Arc::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                Ok(request_outcome(
                    PermissionRequestReason::CleanupFailed,
                    Some(PermissionState::Granted),
                ))
            })
        });
        let expected = request_outcome(
            PermissionRequestReason::CleanupFailed,
            Some(PermissionState::Granted),
        );
        assert_eq!(
            block_on(request_permission(&provider, None, None, "camera")),
            expected
        );
        assert_eq!(
            block_on(request_permission(
                &provider,
                None,
                None,
                "screen-wake-lock"
            )),
            expected
        );
        assert_eq!(*media_names.lock().unwrap(), vec!["camera".to_string()]);
        assert_eq!(wake_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn maps_rejected_host_requests_to_operation_failed() {
        let mut provider = permissions();
        provider.request_media_access = Arc::new(|_name| Box::pin(async { Err(error()) }));
        provider.request_wake_lock = Arc::new(|| Box::pin(async { Err(error()) }));
        assert_eq!(
            block_on(request_permission(&provider, None, None, "camera")),
            request_outcome(PermissionRequestReason::OperationFailed, None)
        );
        assert_eq!(
            block_on(request_permission(
                &provider,
                None,
                None,
                "screen-wake-lock"
            )),
            request_outcome(PermissionRequestReason::OperationFailed, None)
        );
    }

    #[test]
    fn preserves_geolocation_reasons_without_inventing_timeout_state() {
        let cases = [
            (
                GeolocationAccessReason::Granted,
                request_outcome(
                    PermissionRequestReason::Granted,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                GeolocationAccessReason::Denied,
                request_outcome(
                    PermissionRequestReason::Denied,
                    Some(PermissionState::Denied),
                ),
            ),
            (
                GeolocationAccessReason::Dismissed,
                request_outcome(
                    PermissionRequestReason::Dismissed,
                    Some(PermissionState::Prompt),
                ),
            ),
            (
                GeolocationAccessReason::CleanupFailed,
                request_outcome(
                    PermissionRequestReason::CleanupFailed,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                GeolocationAccessReason::Timeout,
                request_outcome(PermissionRequestReason::Timeout, None),
            ),
            (
                GeolocationAccessReason::RuntimeUnavailable,
                request_outcome(PermissionRequestReason::RuntimeUnavailable, None),
            ),
            (
                GeolocationAccessReason::OperationFailed,
                request_outcome(PermissionRequestReason::OperationFailed, None),
            ),
        ];
        for (reason, expected) in cases {
            let calls = Arc::new(AtomicUsize::new(0));
            let captured = calls.clone();
            let provider = geolocation(Some(Arc::new(move || {
                captured.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move { Ok(GeolocationAccessOutcome { reason }) })
            })));
            assert_eq!(
                block_on(request_permission(
                    &permissions(),
                    None,
                    Some(&provider),
                    "geolocation"
                )),
                expected
            );
            assert_eq!(calls.load(Ordering::SeqCst), 1);
        }
    }

    #[test]
    fn projects_notification_decisions_without_erasing_owner_reason() {
        let cases = [
            (
                NotificationPermissionRequestReason::Granted,
                request_outcome(
                    PermissionRequestReason::Granted,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                NotificationPermissionRequestReason::Denied,
                request_outcome(
                    PermissionRequestReason::Denied,
                    Some(PermissionState::Denied),
                ),
            ),
            (
                NotificationPermissionRequestReason::Dismissed,
                request_outcome(
                    PermissionRequestReason::Dismissed,
                    Some(PermissionState::Prompt),
                ),
            ),
            (
                NotificationPermissionRequestReason::OperationFailed,
                request_outcome(PermissionRequestReason::OperationFailed, None),
            ),
        ];
        for (reason, expected) in cases {
            let mut provider = permissions();
            provider.notification = notification(
                Some(NotificationPermission::Default),
                NotificationLifecycleReason::Ok,
                reason,
            );
            assert_eq!(
                block_on(request_permission(&provider, None, None, "notifications")),
                expected
            );
        }
    }

    #[test]
    fn projects_storage_request_snapshots_without_crossing_into_query() {
        let cases = [
            (
                StoragePersistenceOutcomeReason::Persistent,
                Some(PermissionState::Prompt),
                request_outcome(
                    PermissionRequestReason::Granted,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::OperationFailed,
                Some(PermissionState::Denied),
                request_outcome(PermissionRequestReason::OperationFailed, None),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Granted),
                request_outcome(
                    PermissionRequestReason::BestEffort,
                    Some(PermissionState::Granted),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Denied),
                request_outcome(
                    PermissionRequestReason::BestEffort,
                    Some(PermissionState::Denied),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                Some(PermissionState::Prompt),
                request_outcome(
                    PermissionRequestReason::BestEffort,
                    Some(PermissionState::Prompt),
                ),
            ),
            (
                StoragePersistenceOutcomeReason::BestEffort,
                None,
                request_outcome(PermissionRequestReason::BestEffort, None),
            ),
        ];
        for (outcome, permission_state, expected) in cases {
            let persistence = HostPreferencesPersistenceRequestCapability {
                provider: Arc::new(()),
                request_persistence: Arc::new(move || {
                    Box::pin(async move {
                        Ok(StoragePersistenceOutcome {
                            outcome,
                            permission_state,
                        })
                    })
                }),
            };
            assert_eq!(
                block_on(request_permission(
                    &permissions(),
                    Some(&persistence),
                    None,
                    "persistent-storage"
                )),
                expected
            );
        }
        assert_eq!(
            block_on(request_permission(
                &permissions(),
                None,
                None,
                "persistent-storage"
            )),
            request_outcome(PermissionRequestReason::Unsupported, None)
        );
        let rejected = HostPreferencesPersistenceRequestCapability {
            provider: Arc::new(()),
            request_persistence: Arc::new(|| Box::pin(async { Err(error()) })),
        };
        assert_eq!(
            block_on(request_permission(
                &permissions(),
                Some(&rejected),
                None,
                "persistent-storage"
            )),
            request_outcome(PermissionRequestReason::OperationFailed, None)
        );
    }

    #[test]
    fn reports_missing_or_rejected_geolocation_prompt_truthfully() {
        assert_eq!(
            block_on(request_permission(
                &permissions(),
                None,
                None,
                "geolocation"
            )),
            request_outcome(PermissionRequestReason::RuntimeUnavailable, None)
        );
        let missing_prompt = geolocation(None);
        assert_eq!(
            block_on(request_permission(
                &permissions(),
                None,
                Some(&missing_prompt),
                "geolocation"
            )),
            request_outcome(PermissionRequestReason::RuntimeUnavailable, None)
        );
        let rejected = geolocation(Some(Arc::new(|| Box::pin(async { Err(error()) }))));
        assert_eq!(
            block_on(request_permission(
                &permissions(),
                None,
                Some(&rejected),
                "geolocation"
            )),
            request_outcome(PermissionRequestReason::OperationFailed, None)
        );
    }

    #[test]
    fn returns_method_tight_absence_reasons_without_query_fallback() {
        let query_calls = Arc::new(AtomicUsize::new(0));
        let geolocation_calls = Arc::new(AtomicUsize::new(0));
        let mut provider = permissions();
        let captured = query_calls.clone();
        provider.query_permission = Arc::new(move |_name| {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                Ok(query_outcome(
                    PermissionQueryReason::Ok,
                    Some(PermissionState::Granted),
                ))
            })
        });
        let captured = geolocation_calls.clone();
        let geolocation = geolocation(Some(Arc::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                Ok(GeolocationAccessOutcome {
                    reason: GeolocationAccessReason::Granted,
                })
            })
        })));
        for name in ["midi", "clipboard-read", "clipboard-write", "push"] {
            assert_eq!(
                block_on(request_permission(
                    &provider,
                    None,
                    Some(&geolocation),
                    name
                )),
                request_outcome(PermissionRequestReason::NoRequestRoute, None)
            );
        }
        assert_eq!(
            block_on(request_permission(
                &provider,
                None,
                Some(&geolocation),
                "host-specific"
            )),
            request_outcome(PermissionRequestReason::Unsupported, None)
        );
        assert_eq!(query_calls.load(Ordering::SeqCst), 0);
        assert_eq!(geolocation_calls.load(Ordering::SeqCst), 0);
    }
}
