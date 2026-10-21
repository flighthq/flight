use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_entity::{FlightError, throw_error};
use flight_mediasession::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

fn ok<R>(reason: R) -> MediaSessionOperationOutcome<R> {
    return MediaSessionOperationOutcome { reason };
}

fn command_backend() -> HostMediaSessionCapability {
    return HostMediaSessionCapability {
        clear_metadata: Arc::new(|| ok(MediaSessionClearMetadataReason::Ok)),
        clear_position_state: Arc::new(|| ok(MediaSessionClearPositionStateReason::Ok)),
        destroy: Arc::new(|| {}),
        set_metadata: Arc::new(|_metadata: &MediaSessionMetadata| {
            ok(MediaSessionSetMetadataReason::Ok)
        }),
        set_playback_state: Arc::new(|_state: MediaSessionPlaybackState| {
            ok(MediaSessionSetPlaybackStateReason::Ok)
        }),
        set_position_state: Arc::new(|_state: &MediaSessionPositionState| {
            ok(MediaSessionSetPositionStateReason::Ok)
        }),
    };
}

fn action_backend() -> HostMediaSessionActionCapability {
    return HostMediaSessionActionCapability {
        destroy: Arc::new(|| {}),
        subscribe: Arc::new(
            |_action: MediaSessionAction, _listener: MediaSessionActionListener| {
                let release: MediaSessionActionUnsubscribe = Arc::new(|| {});
                return Some(release);
            },
        ),
    };
}

fn calls() -> Arc<Mutex<usize>> {
    return Arc::new(Mutex::new(0));
}

fn count(c: &Arc<Mutex<usize>>) -> usize {
    return *c.lock().unwrap();
}

fn panic_message(payload: &(dyn Any + Send)) -> Option<String> {
    return payload
        .downcast_ref::<FlightError>()
        .map(|e| e.message.clone());
}

/// An action backend whose subscribe returns `release` and counts subscriptions.
fn action_backend_releasing(
    release: MediaSessionActionUnsubscribe,
) -> HostMediaSessionActionCapability {
    return HostMediaSessionActionCapability {
        destroy: Arc::new(|| {}),
        subscribe: Arc::new(
            move |_action: MediaSessionAction, _listener: MediaSessionActionListener| {
                Some(release.clone())
            },
        ),
    };
}

/// A release that fails (D10 throw) on its first call and succeeds afterwards, counting calls.
fn flaky_release(
    message: &'static str,
    attempts: Arc<Mutex<usize>>,
) -> MediaSessionActionUnsubscribe {
    return Arc::new(move || {
        let attempt = {
            let mut a = attempts.lock().unwrap();
            *a += 1;
            *a
        };
        if attempt == 1 {
            throw_error(message);
        }
    });
}

mod attach_media_session_action {
    use super::*;

    #[test]
    fn attaches_only_its_action_and_forwards_provider_details() {
        let listener: Arc<Mutex<Option<MediaSessionActionListener>>> = Arc::new(Mutex::new(None));
        let subscribed = calls();
        let (slot, count_subscribe) = (listener.clone(), subscribed.clone());
        let mut backend = action_backend();
        backend.subscribe = Arc::new(
            move |action: MediaSessionAction, next: MediaSessionActionListener| {
                assert_eq!(action, MediaSessionAction::SeekTo);
                *slot.lock().unwrap() = Some(next);
                *count_subscribe.lock().unwrap() += 1;
                let release: MediaSessionActionUnsubscribe = Arc::new(|| {});
                return Some(release);
            },
        );
        let mut signal = create_media_session_action_signal(MediaSessionAction::SeekTo);
        let observed: Arc<Mutex<Vec<MediaSessionActionDetails>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = observed.clone();
        connect_signal(
            &signal.on_action,
            Arc::new(move |details: &MediaSessionActionDetails| {
                sink.lock().unwrap().push(details.clone())
            }),
            None,
        );
        assert!(attach_media_session_action(&backend, &mut signal));
        let details = MediaSessionActionDetails {
            action: MediaSessionAction::SeekTo,
            seek_time: Some(8.0),
            seek_offset: None,
            fast_seek: Some(true),
        };
        let next = listener.lock().unwrap().clone().unwrap();
        next(&details);
        assert_eq!(*observed.lock().unwrap(), vec![details]);
        assert_eq!(count(&subscribed), 1);
    }

    #[test]
    fn forwards_the_provider_details_by_reference_unchanged() {
        let listener: Arc<Mutex<Option<MediaSessionActionListener>>> = Arc::new(Mutex::new(None));
        let slot = listener.clone();
        let mut backend = action_backend();
        backend.subscribe = Arc::new(
            move |_action: MediaSessionAction, next: MediaSessionActionListener| {
                *slot.lock().unwrap() = Some(next);
                let release: MediaSessionActionUnsubscribe = Arc::new(|| {});
                return Some(release);
            },
        );
        let mut signal = create_media_session_action_signal(MediaSessionAction::Play);
        let seen: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
        let sink = seen.clone();
        connect_signal(
            &signal.on_action,
            Arc::new(move |details: &MediaSessionActionDetails| {
                *sink.lock().unwrap() = details as *const _ as usize
            }),
            None,
        );
        attach_media_session_action(&backend, &mut signal);
        let details = MediaSessionActionDetails {
            action: MediaSessionAction::Play,
            seek_time: None,
            seek_offset: None,
            fast_seek: None,
        };
        listener.lock().unwrap().clone().unwrap()(&details);
        assert_eq!(*seen.lock().unwrap(), &details as *const _ as usize);
    }

    #[test]
    fn reports_a_none_provider_subscription_as_a_detached_runtime_refusal() {
        let mut backend = action_backend();
        backend.subscribe =
            Arc::new(|_action: MediaSessionAction, _listener: MediaSessionActionListener| None);
        let mut signal = create_media_session_action_signal(MediaSessionAction::Play);
        assert!(!attach_media_session_action(&backend, &mut signal));
        detach_media_session_action(&mut signal);
    }

    #[test]
    fn reattaching_releases_the_prior_origin_before_subscribing_the_replacement() {
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let mut signal = create_media_session_action_signal(MediaSessionAction::Play);
        let first_order = order.clone();
        attach_media_session_action(
            &action_backend_releasing(Arc::new(move || {
                first_order.lock().unwrap().push("detach-first")
            })),
            &mut signal,
        );
        let second_order = order.clone();
        let mut second = action_backend();
        second.subscribe = Arc::new(
            move |_action: MediaSessionAction, _listener: MediaSessionActionListener| {
                second_order.lock().unwrap().push("attach-second");
                let release: MediaSessionActionUnsubscribe = Arc::new(|| {});
                return Some(release);
            },
        );
        attach_media_session_action(&second, &mut signal);
        assert_eq!(
            *order.lock().unwrap(),
            vec!["detach-first", "attach-second"]
        );
    }
}

mod clear_media_session_metadata {
    use super::*;

    #[test]
    fn returns_the_explicit_host_provider_outcome() {
        let mut backend = command_backend();
        backend.clear_metadata = Arc::new(|| ok(MediaSessionClearMetadataReason::OperationFailed));
        assert_eq!(
            clear_media_session_metadata(&backend),
            ok(MediaSessionClearMetadataReason::OperationFailed)
        );
    }
}

mod clear_media_session_position_state {
    use super::*;

    #[test]
    fn returns_the_explicit_host_provider_outcome() {
        let mut backend = command_backend();
        backend.clear_position_state =
            Arc::new(|| ok(MediaSessionClearPositionStateReason::PositionStateUnavailable));
        assert_eq!(
            clear_media_session_position_state(&backend),
            ok(MediaSessionClearPositionStateReason::PositionStateUnavailable)
        );
    }
}

mod create_media_session_action_signal {
    use super::*;

    #[test]
    fn creates_one_entity_carrying_exactly_the_requested_action_and_one_signal() {
        let signal = create_media_session_action_signal(MediaSessionAction::SeekTo);
        let _: &dyn flight_entity::Entity = &signal;
        assert_eq!(signal.action, MediaSessionAction::SeekTo);
        assert!(!has_signal_slots(&signal.on_action));
    }
}

mod destroy_media_session {
    use super::*;

    #[test]
    fn destroys_distinct_command_and_event_providers_once_each() {
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let (o1, o2) = (order.clone(), order.clone());
        let mut commands = command_backend();
        commands.destroy = Arc::new(move || o1.lock().unwrap().push("commands"));
        let mut actions = action_backend();
        actions.destroy = Arc::new(move || o2.lock().unwrap().push("actions"));
        destroy_media_session(&commands, &actions);
        assert_eq!(*order.lock().unwrap(), vec!["commands", "actions"]);
    }

    #[test]
    fn deduplicates_an_aliased_provider_identity_across_both_host_slots() {
        let destroyed = calls();
        let counter = destroyed.clone();
        let shared_destroy: Arc<dyn Fn() + Send + Sync> =
            Arc::new(move || *counter.lock().unwrap() += 1);
        let mut commands = command_backend();
        commands.destroy = shared_destroy.clone();
        let mut actions = action_backend();
        actions.destroy = shared_destroy;
        destroy_media_session(&commands, &actions);
        assert_eq!(count(&destroyed), 1);
    }

    #[test]
    fn attempts_a_distinct_sibling_after_the_first_provider_throws_then_rethrows() {
        let actions_called = calls();
        let counter = actions_called.clone();
        let mut commands = command_backend();
        commands.destroy = Arc::new(|| throw_error("commands failed"));
        let mut actions = action_backend();
        actions.destroy = Arc::new(move || *counter.lock().unwrap() += 1);
        let result = catch_unwind(AssertUnwindSafe(|| {
            destroy_media_session(&commands, &actions)
        }));
        let payload = result.expect_err("rethrows");
        assert_eq!(
            panic_message(payload.as_ref()),
            Some("commands failed".to_string())
        );
        assert_eq!(count(&actions_called), 1);
    }

    #[test]
    fn preserves_even_a_unit_thrown_value_after_attempting_the_sibling() {
        let actions_called = calls();
        let counter = actions_called.clone();
        let mut commands = command_backend();
        commands.destroy = Arc::new(|| std::panic::panic_any(()));
        let mut actions = action_backend();
        actions.destroy = Arc::new(move || *counter.lock().unwrap() += 1);
        let payload = catch_unwind(AssertUnwindSafe(|| {
            destroy_media_session(&commands, &actions)
        }))
        .expect_err("rethrows");
        assert!(payload.downcast_ref::<()>().is_some());
        assert_eq!(count(&actions_called), 1);
    }

    #[test]
    fn rethrows_the_first_error_when_both_distinct_providers_throw() {
        let mut commands = command_backend();
        commands.destroy = Arc::new(|| throw_error("commands failed"));
        let mut actions = action_backend();
        actions.destroy = Arc::new(|| throw_error("actions failed"));
        let payload = catch_unwind(AssertUnwindSafe(|| {
            destroy_media_session(&commands, &actions)
        }))
        .expect_err("rethrows");
        assert_eq!(
            panic_message(payload.as_ref()),
            Some("commands failed".to_string())
        );
    }
}

mod detach_media_session_action {
    use super::*;

    #[test]
    fn origin_pins_the_exact_unsubscribe_across_later_host_changes() {
        let (first, second) = (calls(), calls());
        let (c1, c2) = (first.clone(), second.clone());
        let mut signal = create_media_session_action_signal(MediaSessionAction::Play);
        attach_media_session_action(
            &action_backend_releasing(Arc::new(move || *c1.lock().unwrap() += 1)),
            &mut signal,
        );
        let _replacement = action_backend_releasing(Arc::new(move || *c2.lock().unwrap() += 1));
        detach_media_session_action(&mut signal);
        assert_eq!(count(&first), 1);
        assert_eq!(count(&second), 0);
    }

    #[test]
    fn keeps_a_throwing_unsubscribe_retryable() {
        let attempts = calls();
        let mut signal = create_media_session_action_signal(MediaSessionAction::Pause);
        attach_media_session_action(
            &action_backend_releasing(flaky_release("temporary clear failure", attempts.clone())),
            &mut signal,
        );
        let payload = catch_unwind(AssertUnwindSafe(|| {
            detach_media_session_action(&mut signal)
        }))
        .expect_err("throws");
        assert_eq!(
            panic_message(payload.as_ref()),
            Some("temporary clear failure".to_string())
        );
        detach_media_session_action(&mut signal);
        assert_eq!(count(&attempts), 2);
        detach_media_session_action(&mut signal);
        assert_eq!(count(&attempts), 2);
    }
}

mod dispose_media_session_action_signal {
    use super::*;

    #[test]
    fn dispose_clears_the_signal_even_when_detach_fails_while_retaining_detach_retry() {
        let attempts = calls();
        let mut signal = create_media_session_action_signal(MediaSessionAction::Stop);
        connect_signal(
            &signal.on_action,
            Arc::new(|_: &MediaSessionActionDetails| {}),
            None,
        );
        attach_media_session_action(
            &action_backend_releasing(flaky_release("retry me", attempts.clone())),
            &mut signal,
        );
        let payload = catch_unwind(AssertUnwindSafe(|| {
            dispose_media_session_action_signal(&mut signal)
        }))
        .expect_err("throws");
        assert_eq!(
            panic_message(payload.as_ref()),
            Some("retry me".to_string())
        );
        assert!(!has_signal_slots(&signal.on_action));
        dispose_media_session_action_signal(&mut signal);
        assert_eq!(count(&attempts), 2);
    }
}

mod get_media_session_action_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::Play),
            "play"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::Pause),
            "pause"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::Stop),
            "stop"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::SeekBackward),
            "seekbackward"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::SeekForward),
            "seekforward"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::SeekTo),
            "seekto"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::PreviousTrack),
            "previoustrack"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::NextTrack),
            "nexttrack"
        );
        assert_eq!(
            get_media_session_action_string(MediaSessionAction::SkipAd),
            "skipad"
        );
    }
}

mod get_media_session_clear_metadata_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_clear_metadata_reason_string(MediaSessionClearMetadataReason::Ok),
            "ok"
        );
        assert_eq!(
            get_media_session_clear_metadata_reason_string(
                MediaSessionClearMetadataReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_clear_metadata_reason_string(
                MediaSessionClearMetadataReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_media_session_clear_position_state_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_clear_position_state_reason_string(
                MediaSessionClearPositionStateReason::Ok
            ),
            "ok"
        );
        assert_eq!(
            get_media_session_clear_position_state_reason_string(
                MediaSessionClearPositionStateReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_clear_position_state_reason_string(
                MediaSessionClearPositionStateReason::PositionStateUnavailable
            ),
            "position-state-unavailable"
        );
        assert_eq!(
            get_media_session_clear_position_state_reason_string(
                MediaSessionClearPositionStateReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_media_session_operation_block_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::InvalidArtworkSource
            ),
            "invalid-artwork-source"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::InvalidDuration
            ),
            "invalid-duration"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::InvalidPlaybackRate
            ),
            "invalid-playback-rate"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::InvalidPosition
            ),
            "invalid-position"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::MediaMetadataUnavailable
            ),
            "media-metadata-unavailable"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::OperationFailed
            ),
            "operation-failed"
        );
        assert_eq!(
            get_media_session_operation_block_reason_string(
                MediaSessionOperationBlockReason::PositionStateUnavailable
            ),
            "position-state-unavailable"
        );
    }
}

mod get_media_session_operation_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_operation_reason_string(MediaSessionOperationReason::Ok),
            "ok"
        );
        assert_eq!(
            get_media_session_operation_reason_string(
                MediaSessionOperationReason::InvalidArtworkSource
            ),
            "invalid-artwork-source"
        );
        assert_eq!(
            get_media_session_operation_reason_string(MediaSessionOperationReason::InvalidDuration),
            "invalid-duration"
        );
        assert_eq!(
            get_media_session_operation_reason_string(
                MediaSessionOperationReason::InvalidPlaybackRate
            ),
            "invalid-playback-rate"
        );
        assert_eq!(
            get_media_session_operation_reason_string(MediaSessionOperationReason::InvalidPosition),
            "invalid-position"
        );
        assert_eq!(
            get_media_session_operation_reason_string(
                MediaSessionOperationReason::MediaMetadataUnavailable
            ),
            "media-metadata-unavailable"
        );
        assert_eq!(
            get_media_session_operation_reason_string(
                MediaSessionOperationReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_operation_reason_string(MediaSessionOperationReason::OperationFailed),
            "operation-failed"
        );
        assert_eq!(
            get_media_session_operation_reason_string(
                MediaSessionOperationReason::PositionStateUnavailable
            ),
            "position-state-unavailable"
        );
    }
}

mod get_media_session_playback_state_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_playback_state_string(MediaSessionPlaybackState::None),
            "none"
        );
        assert_eq!(
            get_media_session_playback_state_string(MediaSessionPlaybackState::Paused),
            "paused"
        );
        assert_eq!(
            get_media_session_playback_state_string(MediaSessionPlaybackState::Playing),
            "playing"
        );
    }
}

mod get_media_session_set_metadata_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_set_metadata_reason_string(MediaSessionSetMetadataReason::Ok),
            "ok"
        );
        assert_eq!(
            get_media_session_set_metadata_reason_string(
                MediaSessionSetMetadataReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_set_metadata_reason_string(
                MediaSessionSetMetadataReason::MediaMetadataUnavailable
            ),
            "media-metadata-unavailable"
        );
        assert_eq!(
            get_media_session_set_metadata_reason_string(
                MediaSessionSetMetadataReason::InvalidArtworkSource
            ),
            "invalid-artwork-source"
        );
        assert_eq!(
            get_media_session_set_metadata_reason_string(
                MediaSessionSetMetadataReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_media_session_set_playback_state_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_set_playback_state_reason_string(
                MediaSessionSetPlaybackStateReason::Ok
            ),
            "ok"
        );
        assert_eq!(
            get_media_session_set_playback_state_reason_string(
                MediaSessionSetPlaybackStateReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_set_playback_state_reason_string(
                MediaSessionSetPlaybackStateReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_media_session_set_position_state_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::Ok
            ),
            "ok"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::MediaSessionUnavailable
            ),
            "media-session-unavailable"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::PositionStateUnavailable
            ),
            "position-state-unavailable"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::InvalidDuration
            ),
            "invalid-duration"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::InvalidPosition
            ),
            "invalid-position"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::InvalidPlaybackRate
            ),
            "invalid-playback-rate"
        );
        assert_eq!(
            get_media_session_set_position_state_reason_string(
                MediaSessionSetPositionStateReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod initialize_media_session_action_signal {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_media_session_action_signal() {
        let mut out: MediaSessionActionSignal = flight_entity::allocate_entity();
        initialize_media_session_action_signal(&mut out, MediaSessionAction::SkipAd);
        assert_eq!(out.action, MediaSessionAction::SkipAd);
        assert_eq!(
            format!("{:?}", out),
            format!(
                "{:?}",
                create_media_session_action_signal(MediaSessionAction::SkipAd)
            )
        );
    }
}

mod parse_media_session_action {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_action("play"),
            Some(MediaSessionAction::Play)
        );
        assert_eq!(
            parse_media_session_action("pause"),
            Some(MediaSessionAction::Pause)
        );
        assert_eq!(
            parse_media_session_action("stop"),
            Some(MediaSessionAction::Stop)
        );
        assert_eq!(
            parse_media_session_action("seekbackward"),
            Some(MediaSessionAction::SeekBackward)
        );
        assert_eq!(
            parse_media_session_action("seekforward"),
            Some(MediaSessionAction::SeekForward)
        );
        assert_eq!(
            parse_media_session_action("seekto"),
            Some(MediaSessionAction::SeekTo)
        );
        assert_eq!(
            parse_media_session_action("previoustrack"),
            Some(MediaSessionAction::PreviousTrack)
        );
        assert_eq!(
            parse_media_session_action("nexttrack"),
            Some(MediaSessionAction::NextTrack)
        );
        assert_eq!(
            parse_media_session_action("skipad"),
            Some(MediaSessionAction::SkipAd)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_action("PLAY"), None);
        assert_eq!(parse_media_session_action(""), None);
    }
}

mod parse_media_session_clear_metadata_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_clear_metadata_reason("ok"),
            Some(MediaSessionClearMetadataReason::Ok)
        );
        assert_eq!(
            parse_media_session_clear_metadata_reason("media-session-unavailable"),
            Some(MediaSessionClearMetadataReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_clear_metadata_reason("operation-failed"),
            Some(MediaSessionClearMetadataReason::OperationFailed)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_clear_metadata_reason("OK"), None);
        assert_eq!(parse_media_session_clear_metadata_reason(""), None);
    }
}

mod parse_media_session_clear_position_state_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_clear_position_state_reason("ok"),
            Some(MediaSessionClearPositionStateReason::Ok)
        );
        assert_eq!(
            parse_media_session_clear_position_state_reason("media-session-unavailable"),
            Some(MediaSessionClearPositionStateReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_clear_position_state_reason("position-state-unavailable"),
            Some(MediaSessionClearPositionStateReason::PositionStateUnavailable)
        );
        assert_eq!(
            parse_media_session_clear_position_state_reason("operation-failed"),
            Some(MediaSessionClearPositionStateReason::OperationFailed)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_clear_position_state_reason("OK"), None);
        assert_eq!(parse_media_session_clear_position_state_reason(""), None);
    }
}

mod parse_media_session_operation_block_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_operation_block_reason("invalid-artwork-source"),
            Some(MediaSessionOperationBlockReason::InvalidArtworkSource)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("invalid-duration"),
            Some(MediaSessionOperationBlockReason::InvalidDuration)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("invalid-playback-rate"),
            Some(MediaSessionOperationBlockReason::InvalidPlaybackRate)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("invalid-position"),
            Some(MediaSessionOperationBlockReason::InvalidPosition)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("media-metadata-unavailable"),
            Some(MediaSessionOperationBlockReason::MediaMetadataUnavailable)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("media-session-unavailable"),
            Some(MediaSessionOperationBlockReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("operation-failed"),
            Some(MediaSessionOperationBlockReason::OperationFailed)
        );
        assert_eq!(
            parse_media_session_operation_block_reason("position-state-unavailable"),
            Some(MediaSessionOperationBlockReason::PositionStateUnavailable)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(
            parse_media_session_operation_block_reason("INVALID-ARTWORK-SOURCE"),
            None
        );
        assert_eq!(parse_media_session_operation_block_reason(""), None);
    }
}

mod parse_media_session_operation_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_operation_reason("ok"),
            Some(MediaSessionOperationReason::Ok)
        );
        assert_eq!(
            parse_media_session_operation_reason("invalid-artwork-source"),
            Some(MediaSessionOperationReason::InvalidArtworkSource)
        );
        assert_eq!(
            parse_media_session_operation_reason("invalid-duration"),
            Some(MediaSessionOperationReason::InvalidDuration)
        );
        assert_eq!(
            parse_media_session_operation_reason("invalid-playback-rate"),
            Some(MediaSessionOperationReason::InvalidPlaybackRate)
        );
        assert_eq!(
            parse_media_session_operation_reason("invalid-position"),
            Some(MediaSessionOperationReason::InvalidPosition)
        );
        assert_eq!(
            parse_media_session_operation_reason("media-metadata-unavailable"),
            Some(MediaSessionOperationReason::MediaMetadataUnavailable)
        );
        assert_eq!(
            parse_media_session_operation_reason("media-session-unavailable"),
            Some(MediaSessionOperationReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_operation_reason("operation-failed"),
            Some(MediaSessionOperationReason::OperationFailed)
        );
        assert_eq!(
            parse_media_session_operation_reason("position-state-unavailable"),
            Some(MediaSessionOperationReason::PositionStateUnavailable)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_operation_reason("OK"), None);
        assert_eq!(parse_media_session_operation_reason(""), None);
    }
}

mod parse_media_session_playback_state {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_playback_state("none"),
            Some(MediaSessionPlaybackState::None)
        );
        assert_eq!(
            parse_media_session_playback_state("paused"),
            Some(MediaSessionPlaybackState::Paused)
        );
        assert_eq!(
            parse_media_session_playback_state("playing"),
            Some(MediaSessionPlaybackState::Playing)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_playback_state("NONE"), None);
        assert_eq!(parse_media_session_playback_state(""), None);
    }
}

mod parse_media_session_set_metadata_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_set_metadata_reason("ok"),
            Some(MediaSessionSetMetadataReason::Ok)
        );
        assert_eq!(
            parse_media_session_set_metadata_reason("media-session-unavailable"),
            Some(MediaSessionSetMetadataReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_set_metadata_reason("media-metadata-unavailable"),
            Some(MediaSessionSetMetadataReason::MediaMetadataUnavailable)
        );
        assert_eq!(
            parse_media_session_set_metadata_reason("invalid-artwork-source"),
            Some(MediaSessionSetMetadataReason::InvalidArtworkSource)
        );
        assert_eq!(
            parse_media_session_set_metadata_reason("operation-failed"),
            Some(MediaSessionSetMetadataReason::OperationFailed)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_set_metadata_reason("OK"), None);
        assert_eq!(parse_media_session_set_metadata_reason(""), None);
    }
}

mod parse_media_session_set_playback_state_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_set_playback_state_reason("ok"),
            Some(MediaSessionSetPlaybackStateReason::Ok)
        );
        assert_eq!(
            parse_media_session_set_playback_state_reason("media-session-unavailable"),
            Some(MediaSessionSetPlaybackStateReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_set_playback_state_reason("operation-failed"),
            Some(MediaSessionSetPlaybackStateReason::OperationFailed)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_set_playback_state_reason("OK"), None);
        assert_eq!(parse_media_session_set_playback_state_reason(""), None);
    }
}

mod parse_media_session_set_position_state_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_media_session_set_position_state_reason("ok"),
            Some(MediaSessionSetPositionStateReason::Ok)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("media-session-unavailable"),
            Some(MediaSessionSetPositionStateReason::MediaSessionUnavailable)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("position-state-unavailable"),
            Some(MediaSessionSetPositionStateReason::PositionStateUnavailable)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("invalid-duration"),
            Some(MediaSessionSetPositionStateReason::InvalidDuration)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("invalid-position"),
            Some(MediaSessionSetPositionStateReason::InvalidPosition)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("invalid-playback-rate"),
            Some(MediaSessionSetPositionStateReason::InvalidPlaybackRate)
        );
        assert_eq!(
            parse_media_session_set_position_state_reason("operation-failed"),
            Some(MediaSessionSetPositionStateReason::OperationFailed)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_media_session_set_position_state_reason("OK"), None);
        assert_eq!(parse_media_session_set_position_state_reason(""), None);
    }
}

mod set_media_session_metadata {
    use super::*;

    #[test]
    fn passes_metadata_to_the_explicit_host_provider_and_returns_its_exact_outcome() {
        let metadata = MediaSessionMetadata {
            title: "A".to_string(),
            artist: "B".to_string(),
            album: "C".to_string(),
            artwork: Vec::new(),
        };
        let received: Arc<Mutex<Option<(usize, MediaSessionMetadata)>>> =
            Arc::new(Mutex::new(None));
        let sink = received.clone();
        let mut backend = command_backend();
        backend.set_metadata = Arc::new(move |m: &MediaSessionMetadata| {
            *sink.lock().unwrap() = Some((m as *const _ as usize, m.clone()));
            return ok(MediaSessionSetMetadataReason::MediaMetadataUnavailable);
        });
        assert_eq!(
            set_media_session_metadata(&backend, &metadata),
            ok(MediaSessionSetMetadataReason::MediaMetadataUnavailable)
        );
        let (address, value) = received.lock().unwrap().clone().unwrap();
        assert_eq!(address, &metadata as *const _ as usize);
        assert_eq!(value, metadata);
    }
}

mod set_media_session_playback_state {
    use super::*;

    #[test]
    fn returns_the_explicit_host_provider_outcome() {
        let mut backend = command_backend();
        backend.set_playback_state = Arc::new(|state: MediaSessionPlaybackState| {
            assert_eq!(state, MediaSessionPlaybackState::Playing);
            return ok(MediaSessionSetPlaybackStateReason::MediaSessionUnavailable);
        });
        assert_eq!(
            set_media_session_playback_state(&backend, MediaSessionPlaybackState::Playing),
            ok(MediaSessionSetPlaybackStateReason::MediaSessionUnavailable)
        );
    }

    #[test]
    fn an_out_of_union_playback_state_cannot_reach_the_provider() {
        // TS throws TypeError for 'buffering' before invoking the provider. In Rust the enum makes the
        // value unrepresentable; the only string entry point rejects it.
        assert_eq!(parse_media_session_playback_state("buffering"), None);
    }
}

mod set_media_session_position_state {
    use super::*;

    fn position(duration: f32, playback_rate: f32, position: f32) -> MediaSessionPositionState {
        return MediaSessionPositionState {
            duration,
            playback_rate,
            position,
        };
    }

    #[test]
    fn passes_a_valid_position_to_the_explicit_host_provider_and_returns_its_exact_outcome() {
        let state = position(20.0, 1.0, 4.0);
        let received: Arc<Mutex<Option<usize>>> = Arc::new(Mutex::new(None));
        let sink = received.clone();
        let mut backend = command_backend();
        backend.set_position_state = Arc::new(move |s: &MediaSessionPositionState| {
            *sink.lock().unwrap() = Some(s as *const _ as usize);
            return ok(MediaSessionSetPositionStateReason::OperationFailed);
        });
        assert_eq!(
            set_media_session_position_state(&backend, &state),
            ok(MediaSessionSetPositionStateReason::OperationFailed)
        );
        assert_eq!(*received.lock().unwrap(), Some(&state as *const _ as usize));
    }

    #[test]
    fn classifies_invalid_position_input_locally() {
        let cases = [
            (
                position(0.0, 1.0, 0.0),
                MediaSessionSetPositionStateReason::InvalidDuration,
            ),
            (
                position(-1.0, 1.0, 0.0),
                MediaSessionSetPositionStateReason::InvalidDuration,
            ),
            (
                position(f32::INFINITY, 1.0, 0.0),
                MediaSessionSetPositionStateReason::InvalidDuration,
            ),
            (
                position(10.0, 1.0, -1.0),
                MediaSessionSetPositionStateReason::InvalidPosition,
            ),
            (
                position(10.0, 1.0, 11.0),
                MediaSessionSetPositionStateReason::InvalidPosition,
            ),
            (
                position(10.0, 1.0, f32::NAN),
                MediaSessionSetPositionStateReason::InvalidPosition,
            ),
            (
                position(10.0, 0.0, 1.0),
                MediaSessionSetPositionStateReason::InvalidPlaybackRate,
            ),
            (
                position(10.0, f32::NAN, 1.0),
                MediaSessionSetPositionStateReason::InvalidPlaybackRate,
            ),
        ];
        for (state, reason) in cases {
            let provider_calls = calls();
            let counter = provider_calls.clone();
            let mut backend = command_backend();
            backend.set_position_state = Arc::new(move |_s: &MediaSessionPositionState| {
                *counter.lock().unwrap() += 1;
                return ok(MediaSessionSetPositionStateReason::Ok);
            });
            assert_eq!(
                set_media_session_position_state(&backend, &state),
                ok(reason),
                "{:?}",
                state
            );
            assert_eq!(count(&provider_calls), 0);
        }
    }

    #[test]
    fn accepts_finite_negative_playback_rates_but_not_zero_matching_the_platform_algorithm() {
        let provider_calls = calls();
        let counter = provider_calls.clone();
        let mut backend = command_backend();
        backend.set_position_state = Arc::new(move |_s: &MediaSessionPositionState| {
            *counter.lock().unwrap() += 1;
            return ok(MediaSessionSetPositionStateReason::Ok);
        });
        assert_eq!(
            set_media_session_position_state(&backend, &position(10.0, -1.0, 1.0)),
            ok(MediaSessionSetPositionStateReason::Ok)
        );
        assert_eq!(count(&provider_calls), 1);
    }
}
