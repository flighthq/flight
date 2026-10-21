use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Mutex;

    use flight_signals::{connect_signal, has_signal_slots};

    use super::*;

    /// A command capability whose outcomes are fixed non-ok reasons, counting destroys and position
    /// calls.
    fn commands(
        destroys: Arc<Mutex<usize>>,
        position_calls: Arc<Mutex<usize>>,
    ) -> HostMediaSessionCapability {
        return HostMediaSessionCapability {
            clear_metadata: Arc::new(|| MediaSessionOperationOutcome {
                reason: MediaSessionClearMetadataReason::OperationFailed,
            }),
            clear_position_state: Arc::new(|| MediaSessionOperationOutcome {
                reason: MediaSessionClearPositionStateReason::PositionStateUnavailable,
            }),
            destroy: Arc::new(move || *destroys.lock().unwrap() += 1),
            set_metadata: Arc::new(|_m: &MediaSessionMetadata| MediaSessionOperationOutcome {
                reason: MediaSessionSetMetadataReason::InvalidArtworkSource,
            }),
            set_playback_state: Arc::new(|_s: MediaSessionPlaybackState| {
                MediaSessionOperationOutcome {
                    reason: MediaSessionSetPlaybackStateReason::MediaSessionUnavailable,
                }
            }),
            set_position_state: Arc::new(move |_s: &MediaSessionPositionState| {
                *position_calls.lock().unwrap() += 1;
                return MediaSessionOperationOutcome {
                    reason: MediaSessionSetPositionStateReason::Ok,
                };
            }),
        };
    }

    fn quiet() -> HostMediaSessionCapability {
        return commands(Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
    }

    fn actions(releases: Arc<Mutex<usize>>) -> HostMediaSessionActionCapability {
        return HostMediaSessionActionCapability {
            destroy: Arc::new(|| {}),
            subscribe: Arc::new(
                move |_action: MediaSessionAction, _listener: MediaSessionActionListener| {
                    let releases = releases.clone();
                    let release: MediaSessionActionUnsubscribe =
                        Arc::new(move || *releases.lock().unwrap() += 1);
                    return Some(release);
                },
            ),
        };
    }

    #[test]
    fn host_media_session_action_capability_attach_action_matches_attach_media_session_action() {
        let (ra, rb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_media_session_action_signal(MediaSessionAction::NextTrack);
        let mut b = create_media_session_action_signal(MediaSessionAction::NextTrack);
        let attached_a = actions(ra.clone()).attach_action(&mut a);
        let attached_b = attach_media_session_action(&actions(rb.clone()), &mut b);
        assert_eq!(attached_a, attached_b);
        assert!(attached_a);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn host_media_session_capability_clear_media_session_metadata_matches_clear_media_session_metadata()
     {
        let c = quiet();
        assert_eq!(
            c.clear_media_session_metadata(),
            clear_media_session_metadata(&c)
        );
        assert_eq!(
            c.clear_media_session_metadata().reason,
            MediaSessionClearMetadataReason::OperationFailed
        );
    }

    #[test]
    fn host_media_session_capability_clear_media_session_position_state_matches_clear_media_session_position_state()
     {
        let c = quiet();
        assert_eq!(
            c.clear_media_session_position_state(),
            clear_media_session_position_state(&c)
        );
        assert_eq!(
            c.clear_media_session_position_state().reason,
            MediaSessionClearPositionStateReason::PositionStateUnavailable
        );
    }

    #[test]
    fn host_media_session_capability_destroy_media_session_matches_destroy_media_session() {
        let (da, db) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        commands(da.clone(), Arc::new(Mutex::new(0)))
            .destroy_media_session(&actions(Arc::new(Mutex::new(0))));
        destroy_media_session(
            &commands(db.clone(), Arc::new(Mutex::new(0))),
            &actions(Arc::new(Mutex::new(0))),
        );
        assert_eq!(*da.lock().unwrap(), *db.lock().unwrap());
        assert_eq!(*da.lock().unwrap(), 1);
    }

    #[test]
    fn host_media_session_capability_set_media_session_metadata_matches_set_media_session_metadata()
    {
        let c = quiet();
        let metadata = MediaSessionMetadata {
            title: "T".to_string(),
            artist: "A".to_string(),
            album: "L".to_string(),
            artwork: Vec::new(),
        };
        assert_eq!(
            c.set_media_session_metadata(&metadata),
            set_media_session_metadata(&c, &metadata)
        );
        assert_eq!(
            c.set_media_session_metadata(&metadata).reason,
            MediaSessionSetMetadataReason::InvalidArtworkSource
        );
    }

    #[test]
    fn host_media_session_capability_set_media_session_playback_state_matches_set_media_session_playback_state()
     {
        let c = quiet();
        assert_eq!(
            c.set_media_session_playback_state(MediaSessionPlaybackState::Paused),
            set_media_session_playback_state(&c, MediaSessionPlaybackState::Paused)
        );
        assert_eq!(
            c.set_media_session_playback_state(MediaSessionPlaybackState::Paused)
                .reason,
            MediaSessionSetPlaybackStateReason::MediaSessionUnavailable
        );
    }

    #[test]
    fn host_media_session_capability_set_media_session_position_state_matches_set_media_session_position_state()
     {
        let (pa, pb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let (ca, cb) = (
            commands(Arc::new(Mutex::new(0)), pa.clone()),
            commands(Arc::new(Mutex::new(0)), pb.clone()),
        );
        let invalid = MediaSessionPositionState {
            duration: 10.0,
            playback_rate: 1.0,
            position: 12.0,
        };
        assert_eq!(
            ca.set_media_session_position_state(&invalid),
            set_media_session_position_state(&cb, &invalid)
        );
        assert_eq!(
            ca.set_media_session_position_state(&invalid).reason,
            MediaSessionSetPositionStateReason::InvalidPosition
        );
        assert_eq!((*pa.lock().unwrap(), *pb.lock().unwrap()), (0, 0));
    }

    #[test]
    fn media_session_action_signal_new_matches_create_media_session_action_signal() {
        let a = MediaSessionActionSignal::new(MediaSessionAction::SeekBackward);
        let b = create_media_session_action_signal(MediaSessionAction::SeekBackward);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert_eq!(a.action, MediaSessionAction::SeekBackward);
    }

    #[test]
    fn media_session_action_signal_detach_matches_detach_media_session_action() {
        let (ra, rb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let mut a = create_media_session_action_signal(MediaSessionAction::Play);
        let mut b = create_media_session_action_signal(MediaSessionAction::Play);
        attach_media_session_action(&actions(ra.clone()), &mut a);
        attach_media_session_action(&actions(rb.clone()), &mut b);
        a.detach();
        detach_media_session_action(&mut b);
        assert_eq!(*ra.lock().unwrap(), *rb.lock().unwrap());
        assert_eq!(*ra.lock().unwrap(), 1);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn media_session_action_signal_dispose_matches_dispose_media_session_action_signal() {
        let mut a = create_media_session_action_signal(MediaSessionAction::Stop);
        let mut b = create_media_session_action_signal(MediaSessionAction::Stop);
        connect_signal(
            &a.on_action,
            Arc::new(|_: &MediaSessionActionDetails| {}),
            None,
        );
        connect_signal(
            &b.on_action,
            Arc::new(|_: &MediaSessionActionDetails| {}),
            None,
        );
        a.dispose();
        dispose_media_session_action_signal(&mut b);
        assert_eq!(
            has_signal_slots(&a.on_action),
            has_signal_slots(&b.on_action)
        );
        assert!(!has_signal_slots(&a.on_action));
    }
}

pub fn create_media_session_action_signal(action: MediaSessionAction) -> MediaSessionActionSignal {
    let mut out: MediaSessionActionSignal = allocate_entity();
    initialize_media_session_action_signal(&mut out, action);
    return out;
}

pub fn initialize_media_session_action_signal(
    out: &mut MediaSessionActionSignal,
    action: MediaSessionAction,
) {
    out.action = action;
    out.on_action = create_signal();
    out.subscription = None;
}

/// Attaches exactly the action named by `signal`. A None provider subscription is a truthful runtime
/// refusal and leaves the entity detached (returns false). Reattaching first releases the prior exact
/// origin. Provider details are emitted by reference, unchanged, so slots see the provider's record.
pub fn attach_media_session_action(
    host_media_session_action: &HostMediaSessionActionCapability,
    signal: &mut MediaSessionActionSignal,
) -> bool {
    detach_media_session_action(signal);
    let on_action = signal.on_action.clone();
    let listener: MediaSessionActionListener =
        Arc::new(move |details: &MediaSessionActionDetails| emit_signal(&on_action, details));
    let Some(unsubscribe) = (host_media_session_action.subscribe)(signal.action, listener) else {
        return false;
    };
    signal.subscription = Some(unsubscribe);
    return true;
}

pub fn clear_media_session_metadata(
    host_media_session: &HostMediaSessionCapability,
) -> MediaSessionClearMetadataOutcome {
    return (host_media_session.clear_metadata)();
}

pub fn clear_media_session_position_state(
    host_media_session: &HostMediaSessionCapability,
) -> MediaSessionClearPositionStateOutcome {
    return (host_media_session.clear_position_state)();
}

/// Destroys every DISTINCT supplied provider once. Provider identity is the identity of its `destroy`
/// callback: one provider object serving both host slots shares one `destroy`, so passing it as both
/// arguments cannot double-release it. A throwing (panicking, D10) provider does not prevent the other
/// distinct provider from being attempted; afterwards the first failure is re-raised with its exact
/// payload.
pub fn destroy_media_session(
    host_media_session: &HostMediaSessionCapability,
    host_media_session_action: &HostMediaSessionActionCapability,
) {
    let mut providers: Vec<&Arc<dyn Fn() + Send + Sync>> = vec![&host_media_session.destroy];
    let action_destroy = &host_media_session_action.destroy;
    let is_alias =
        Arc::as_ptr(action_destroy) as *const () == Arc::as_ptr(providers[0]) as *const ();
    if !is_alias {
        providers.push(action_destroy);
    }
    let mut first_error = None;
    for destroy in providers {
        if let Err(error) = catch_unwind(AssertUnwindSafe(|| destroy())) {
            if first_error.is_none() {
                first_error = Some(error);
            }
        }
    }
    if let Some(error) = first_error {
        resume_unwind(error);
    }
}

/// Releases the attached subscription. The release stays registered while its call fails (panics), so
/// a later detach retries the exact provider/session/action origin; the entry is removed only after a
/// successful release.
pub fn detach_media_session_action(signal: &mut MediaSessionActionSignal) {
    let Some(unsubscribe) = signal.subscription.clone() else {
        return;
    };
    unsubscribe();
    signal.subscription = None;
}

/// Detaches and clears `on_action`. The signal is cleared even when detach fails; the failure is then
/// re-raised and the subscription stays retryable.
pub fn dispose_media_session_action_signal(signal: &mut MediaSessionActionSignal) {
    let detached = catch_unwind(AssertUnwindSafe(|| detach_media_session_action(signal)));
    clear_signal(&signal.on_action);
    if let Err(error) = detached {
        resume_unwind(error);
    }
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionAction string union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_action_string(value: MediaSessionAction) -> &'static str {
    return match value {
        MediaSessionAction::Play => "play",
        MediaSessionAction::Pause => "pause",
        MediaSessionAction::Stop => "stop",
        MediaSessionAction::SeekBackward => "seekbackward",
        MediaSessionAction::SeekForward => "seekforward",
        MediaSessionAction::SeekTo => "seekto",
        MediaSessionAction::PreviousTrack => "previoustrack",
        MediaSessionAction::NextTrack => "nexttrack",
        MediaSessionAction::SkipAd => "skipad",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionClearMetadataOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_clear_metadata_reason_string(
    value: MediaSessionClearMetadataReason,
) -> &'static str {
    return match value {
        MediaSessionClearMetadataReason::Ok => "ok",
        MediaSessionClearMetadataReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionClearMetadataReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionClearPositionStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_clear_position_state_reason_string(
    value: MediaSessionClearPositionStateReason,
) -> &'static str {
    return match value {
        MediaSessionClearPositionStateReason::Ok => "ok",
        MediaSessionClearPositionStateReason::MediaSessionUnavailable => {
            "media-session-unavailable"
        }
        MediaSessionClearPositionStateReason::PositionStateUnavailable => {
            "position-state-unavailable"
        }
        MediaSessionClearPositionStateReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionOperationBlockReason string union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_operation_block_reason_string(
    value: MediaSessionOperationBlockReason,
) -> &'static str {
    return match value {
        MediaSessionOperationBlockReason::InvalidArtworkSource => "invalid-artwork-source",
        MediaSessionOperationBlockReason::InvalidDuration => "invalid-duration",
        MediaSessionOperationBlockReason::InvalidPlaybackRate => "invalid-playback-rate",
        MediaSessionOperationBlockReason::InvalidPosition => "invalid-position",
        MediaSessionOperationBlockReason::MediaMetadataUnavailable => "media-metadata-unavailable",
        MediaSessionOperationBlockReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionOperationBlockReason::OperationFailed => "operation-failed",
        MediaSessionOperationBlockReason::PositionStateUnavailable => "position-state-unavailable",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS default MediaSessionOperationOutcome['reason'] union ('ok' | MediaSessionOperationBlockReason); the TS package exports no get_/parse_ free functions
pub fn get_media_session_operation_reason_string(
    value: MediaSessionOperationReason,
) -> &'static str {
    return match value {
        MediaSessionOperationReason::Ok => "ok",
        MediaSessionOperationReason::InvalidArtworkSource => "invalid-artwork-source",
        MediaSessionOperationReason::InvalidDuration => "invalid-duration",
        MediaSessionOperationReason::InvalidPlaybackRate => "invalid-playback-rate",
        MediaSessionOperationReason::InvalidPosition => "invalid-position",
        MediaSessionOperationReason::MediaMetadataUnavailable => "media-metadata-unavailable",
        MediaSessionOperationReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionOperationReason::OperationFailed => "operation-failed",
        MediaSessionOperationReason::PositionStateUnavailable => "position-state-unavailable",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionPlaybackState string union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_playback_state_string(value: MediaSessionPlaybackState) -> &'static str {
    return match value {
        MediaSessionPlaybackState::None => "none",
        MediaSessionPlaybackState::Paused => "paused",
        MediaSessionPlaybackState::Playing => "playing",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetMetadataOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_set_metadata_reason_string(
    value: MediaSessionSetMetadataReason,
) -> &'static str {
    return match value {
        MediaSessionSetMetadataReason::Ok => "ok",
        MediaSessionSetMetadataReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionSetMetadataReason::MediaMetadataUnavailable => "media-metadata-unavailable",
        MediaSessionSetMetadataReason::InvalidArtworkSource => "invalid-artwork-source",
        MediaSessionSetMetadataReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetPlaybackStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_set_playback_state_reason_string(
    value: MediaSessionSetPlaybackStateReason,
) -> &'static str {
    return match value {
        MediaSessionSetPlaybackStateReason::Ok => "ok",
        MediaSessionSetPlaybackStateReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionSetPlaybackStateReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetPositionStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn get_media_session_set_position_state_reason_string(
    value: MediaSessionSetPositionStateReason,
) -> &'static str {
    return match value {
        MediaSessionSetPositionStateReason::Ok => "ok",
        MediaSessionSetPositionStateReason::MediaSessionUnavailable => "media-session-unavailable",
        MediaSessionSetPositionStateReason::PositionStateUnavailable => {
            "position-state-unavailable"
        }
        MediaSessionSetPositionStateReason::InvalidDuration => "invalid-duration",
        MediaSessionSetPositionStateReason::InvalidPosition => "invalid-position",
        MediaSessionSetPositionStateReason::InvalidPlaybackRate => "invalid-playback-rate",
        MediaSessionSetPositionStateReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionAction string union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_action(value: &str) -> Option<MediaSessionAction> {
    return match value {
        "play" => Some(MediaSessionAction::Play),
        "pause" => Some(MediaSessionAction::Pause),
        "stop" => Some(MediaSessionAction::Stop),
        "seekbackward" => Some(MediaSessionAction::SeekBackward),
        "seekforward" => Some(MediaSessionAction::SeekForward),
        "seekto" => Some(MediaSessionAction::SeekTo),
        "previoustrack" => Some(MediaSessionAction::PreviousTrack),
        "nexttrack" => Some(MediaSessionAction::NextTrack),
        "skipad" => Some(MediaSessionAction::SkipAd),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionClearMetadataOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_clear_metadata_reason(
    value: &str,
) -> Option<MediaSessionClearMetadataReason> {
    return match value {
        "ok" => Some(MediaSessionClearMetadataReason::Ok),
        "media-session-unavailable" => {
            Some(MediaSessionClearMetadataReason::MediaSessionUnavailable)
        }
        "operation-failed" => Some(MediaSessionClearMetadataReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionClearPositionStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_clear_position_state_reason(
    value: &str,
) -> Option<MediaSessionClearPositionStateReason> {
    return match value {
        "ok" => Some(MediaSessionClearPositionStateReason::Ok),
        "media-session-unavailable" => {
            Some(MediaSessionClearPositionStateReason::MediaSessionUnavailable)
        }
        "position-state-unavailable" => {
            Some(MediaSessionClearPositionStateReason::PositionStateUnavailable)
        }
        "operation-failed" => Some(MediaSessionClearPositionStateReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionOperationBlockReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_operation_block_reason(
    value: &str,
) -> Option<MediaSessionOperationBlockReason> {
    return match value {
        "invalid-artwork-source" => Some(MediaSessionOperationBlockReason::InvalidArtworkSource),
        "invalid-duration" => Some(MediaSessionOperationBlockReason::InvalidDuration),
        "invalid-playback-rate" => Some(MediaSessionOperationBlockReason::InvalidPlaybackRate),
        "invalid-position" => Some(MediaSessionOperationBlockReason::InvalidPosition),
        "media-metadata-unavailable" => {
            Some(MediaSessionOperationBlockReason::MediaMetadataUnavailable)
        }
        "media-session-unavailable" => {
            Some(MediaSessionOperationBlockReason::MediaSessionUnavailable)
        }
        "operation-failed" => Some(MediaSessionOperationBlockReason::OperationFailed),
        "position-state-unavailable" => {
            Some(MediaSessionOperationBlockReason::PositionStateUnavailable)
        }
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS default MediaSessionOperationOutcome['reason'] union ('ok' | MediaSessionOperationBlockReason); the TS package exports no get_/parse_ free functions
pub fn parse_media_session_operation_reason(value: &str) -> Option<MediaSessionOperationReason> {
    return match value {
        "ok" => Some(MediaSessionOperationReason::Ok),
        "invalid-artwork-source" => Some(MediaSessionOperationReason::InvalidArtworkSource),
        "invalid-duration" => Some(MediaSessionOperationReason::InvalidDuration),
        "invalid-playback-rate" => Some(MediaSessionOperationReason::InvalidPlaybackRate),
        "invalid-position" => Some(MediaSessionOperationReason::InvalidPosition),
        "media-metadata-unavailable" => Some(MediaSessionOperationReason::MediaMetadataUnavailable),
        "media-session-unavailable" => Some(MediaSessionOperationReason::MediaSessionUnavailable),
        "operation-failed" => Some(MediaSessionOperationReason::OperationFailed),
        "position-state-unavailable" => Some(MediaSessionOperationReason::PositionStateUnavailable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionPlaybackState string union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_playback_state(value: &str) -> Option<MediaSessionPlaybackState> {
    return match value {
        "none" => Some(MediaSessionPlaybackState::None),
        "paused" => Some(MediaSessionPlaybackState::Paused),
        "playing" => Some(MediaSessionPlaybackState::Playing),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetMetadataOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_set_metadata_reason(
    value: &str,
) -> Option<MediaSessionSetMetadataReason> {
    return match value {
        "ok" => Some(MediaSessionSetMetadataReason::Ok),
        "media-session-unavailable" => Some(MediaSessionSetMetadataReason::MediaSessionUnavailable),
        "media-metadata-unavailable" => {
            Some(MediaSessionSetMetadataReason::MediaMetadataUnavailable)
        }
        "invalid-artwork-source" => Some(MediaSessionSetMetadataReason::InvalidArtworkSource),
        "operation-failed" => Some(MediaSessionSetMetadataReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetPlaybackStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_set_playback_state_reason(
    value: &str,
) -> Option<MediaSessionSetPlaybackStateReason> {
    return match value {
        "ok" => Some(MediaSessionSetPlaybackStateReason::Ok),
        "media-session-unavailable" => {
            Some(MediaSessionSetPlaybackStateReason::MediaSessionUnavailable)
        }
        "operation-failed" => Some(MediaSessionSetPlaybackStateReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaSessionSetPositionStateOutcome['reason'] union; the TS package exports no get_/parse_ free functions
pub fn parse_media_session_set_position_state_reason(
    value: &str,
) -> Option<MediaSessionSetPositionStateReason> {
    return match value {
        "ok" => Some(MediaSessionSetPositionStateReason::Ok),
        "media-session-unavailable" => {
            Some(MediaSessionSetPositionStateReason::MediaSessionUnavailable)
        }
        "position-state-unavailable" => {
            Some(MediaSessionSetPositionStateReason::PositionStateUnavailable)
        }
        "invalid-duration" => Some(MediaSessionSetPositionStateReason::InvalidDuration),
        "invalid-position" => Some(MediaSessionSetPositionStateReason::InvalidPosition),
        "invalid-playback-rate" => Some(MediaSessionSetPositionStateReason::InvalidPlaybackRate),
        "operation-failed" => Some(MediaSessionSetPositionStateReason::OperationFailed),
        _ => None,
    };
}

pub fn set_media_session_metadata(
    host_media_session: &HostMediaSessionCapability,
    metadata: &MediaSessionMetadata,
) -> MediaSessionSetMetadataOutcome {
    return (host_media_session.set_metadata)(metadata);
}

/// Forwards the playback state to the provider. TS rejects an out-of-union state with a TypeError
/// before the provider sees it; the Rust enum makes that misuse unrepresentable, so there is nothing
/// to validate here (strings go through `parse_media_session_playback_state`, which returns None).
pub fn set_media_session_playback_state(
    host_media_session: &HostMediaSessionCapability,
    state: MediaSessionPlaybackState,
) -> MediaSessionSetPlaybackStateOutcome {
    return (host_media_session.set_playback_state)(state);
}

/// Classifies invalid caller data locally, as the W3C algorithm does, before the provider is invoked:
/// a non-finite or non-positive duration, then a non-finite position outside [0, duration], then a
/// non-finite or zero playback rate (finite negative rates are valid). Otherwise forwards to the
/// provider and returns its outcome.
pub fn set_media_session_position_state(
    host_media_session: &HostMediaSessionCapability,
    state: &MediaSessionPositionState,
) -> MediaSessionSetPositionStateOutcome {
    if !state.duration.is_finite() || state.duration <= 0.0 {
        return MediaSessionSetPositionStateOutcome {
            reason: MediaSessionSetPositionStateReason::InvalidDuration,
        };
    }
    if !state.position.is_finite() || state.position < 0.0 || state.position > state.duration {
        return MediaSessionSetPositionStateOutcome {
            reason: MediaSessionSetPositionStateReason::InvalidPosition,
        };
    }
    if !state.playback_rate.is_finite() || state.playback_rate == 0.0 {
        return MediaSessionSetPositionStateOutcome {
            reason: MediaSessionSetPositionStateReason::InvalidPlaybackRate,
        };
    }
    return (host_media_session.set_position_state)(state);
}

impl HostMediaSessionActionCapability {
    pub fn attach_action(&self, signal: &mut MediaSessionActionSignal) -> bool {
        return attach_media_session_action(self, signal);
    }
}

// The command capability's fields share the short names (`clear_metadata`, `set_position_state`,
// `destroy`, ...), and the delegating `set_position_state` validates where the raw field does not, so
// these methods keep the fuller free-function names (D18 collision rule) rather than shadow the fields.
impl HostMediaSessionCapability {
    pub fn clear_media_session_metadata(&self) -> MediaSessionClearMetadataOutcome {
        return clear_media_session_metadata(self);
    }

    pub fn clear_media_session_position_state(&self) -> MediaSessionClearPositionStateOutcome {
        return clear_media_session_position_state(self);
    }

    pub fn destroy_media_session(
        &self,
        host_media_session_action: &HostMediaSessionActionCapability,
    ) {
        destroy_media_session(self, host_media_session_action);
    }

    pub fn set_media_session_metadata(
        &self,
        metadata: &MediaSessionMetadata,
    ) -> MediaSessionSetMetadataOutcome {
        return set_media_session_metadata(self, metadata);
    }

    pub fn set_media_session_playback_state(
        &self,
        state: MediaSessionPlaybackState,
    ) -> MediaSessionSetPlaybackStateOutcome {
        return set_media_session_playback_state(self, state);
    }

    pub fn set_media_session_position_state(
        &self,
        state: &MediaSessionPositionState,
    ) -> MediaSessionSetPositionStateOutcome {
        return set_media_session_position_state(self, state);
    }
}

impl MediaSessionActionSignal {
    pub fn new(action: MediaSessionAction) -> Self {
        return create_media_session_action_signal(action);
    }

    pub fn detach(&mut self) {
        detach_media_session_action(self);
    }

    pub fn dispose(&mut self) {
        dispose_media_session_action_signal(self);
    }
}
