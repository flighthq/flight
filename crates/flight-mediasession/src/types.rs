use std::fmt;
use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_signals::Signal;

/// The standard W3C transport actions the OS surfaces as buttons and hardware media keys (TS `MediaSessionAction`); the strings keep the web API source form.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionAction {
    Play,
    Pause,
    Stop,
    SeekBackward,
    SeekForward,
    SeekTo,
    PreviousTrack,
    NextTrack,
    SkipAd,
}

/// The OS's view of playback (TS `MediaSessionPlaybackState`): no active session, paused, or playing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionPlaybackState {
    None,
    Paused,
    Playing,
}

/// Reasons a media-session command can fail without throwing (TS `MediaSessionOperationBlockReason`). Each command narrows this to the reasons it can reach.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionOperationBlockReason {
    InvalidArtworkSource,
    InvalidDuration,
    InvalidPlaybackRate,
    InvalidPosition,
    MediaMetadataUnavailable,
    MediaSessionUnavailable,
    OperationFailed,
    PositionStateUnavailable,
}

/// The default outcome reason (TS `MediaSessionOperationOutcome['reason']` with its default type argument): `ok` or any block reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionOperationReason {
    Ok,
    InvalidArtworkSource,
    InvalidDuration,
    InvalidPlaybackRate,
    InvalidPosition,
    MediaMetadataUnavailable,
    MediaSessionUnavailable,
    OperationFailed,
    PositionStateUnavailable,
}

/// The reasons `MediaSessionSetMetadataOutcome` can carry (TS `MediaSessionSetMetadataOutcome['reason']`): `ok` or one of its narrowed block reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionSetMetadataReason {
    Ok,
    MediaSessionUnavailable,
    MediaMetadataUnavailable,
    InvalidArtworkSource,
    OperationFailed,
}

/// The reasons `MediaSessionClearMetadataOutcome` can carry (TS `MediaSessionClearMetadataOutcome['reason']`): `ok` or one of its narrowed block reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionClearMetadataReason {
    Ok,
    MediaSessionUnavailable,
    OperationFailed,
}

/// The reasons `MediaSessionSetPlaybackStateOutcome` can carry (TS `MediaSessionSetPlaybackStateOutcome['reason']`): `ok` or one of its narrowed block reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionSetPlaybackStateReason {
    Ok,
    MediaSessionUnavailable,
    OperationFailed,
}

/// The reasons `MediaSessionSetPositionStateOutcome` can carry (TS `MediaSessionSetPositionStateOutcome['reason']`): `ok` or one of its narrowed block reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionSetPositionStateReason {
    Ok,
    MediaSessionUnavailable,
    PositionStateUnavailable,
    InvalidDuration,
    InvalidPosition,
    InvalidPlaybackRate,
    OperationFailed,
}

/// The reasons `MediaSessionClearPositionStateOutcome` can carry (TS `MediaSessionClearPositionStateOutcome['reason']`): `ok` or one of its narrowed block reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaSessionClearPositionStateReason {
    Ok,
    MediaSessionUnavailable,
    PositionStateUnavailable,
    OperationFailed,
}

/// A single now-playing artwork image (TS `MediaSessionArtwork`, the web `MediaImage`): the image URL
/// plus optional size and MIME hints. Plain data.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaSessionArtwork {
    pub src: String,
    pub sizes: Option<String>,
    pub type_: Option<String>,
}

/// The now-playing card the OS shows (TS `MediaSessionMetadata`, the web `MediaMetadata` fields). Plain
/// data; the provider receives the caller's record by reference.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaSessionMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: Vec<MediaSessionArtwork>,
}

/// The payload the OS passes to a transport action handler (TS `MediaSessionActionDetails`, the DOM
/// `MediaSessionActionDetails`): the absolute `seek_time` for seek-to, the relative `seek_offset` for
/// seek backward/forward, and `fast_seek`. All optional per action. Times are f32 seconds: single
/// seek targets relayed to the platform, never accumulated (f32 resolves 8 ms even at 24 hours).
#[derive(Clone, Debug, PartialEq)]
pub struct MediaSessionActionDetails {
    pub action: MediaSessionAction,
    pub seek_time: Option<f32>,
    pub seek_offset: Option<f32>,
    pub fast_seek: Option<bool>,
}

/// The scrubber state (TS `MediaSessionPositionState`): total `duration` and current `position` in
/// seconds and `playback_rate` (1 = normal). f32 for the same reason as `MediaSessionActionDetails`.
#[derive(Clone, Debug, PartialEq)]
pub struct MediaSessionPositionState {
    pub duration: f32,
    pub playback_rate: f32,
    pub position: f32,
}

/// A command outcome (TS generic `MediaSessionOperationOutcome<BlockReason>`): `R` is the reason
/// union including `ok`, defaulting to the full vocabulary as in TS. Plain data.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MediaSessionOperationOutcome<R = MediaSessionOperationReason> {
    pub reason: R,
}

/// TS `MediaSessionSetMetadataOutcome`.
pub type MediaSessionSetMetadataOutcome =
    MediaSessionOperationOutcome<MediaSessionSetMetadataReason>;

/// TS `MediaSessionClearMetadataOutcome`.
pub type MediaSessionClearMetadataOutcome =
    MediaSessionOperationOutcome<MediaSessionClearMetadataReason>;

/// TS `MediaSessionSetPlaybackStateOutcome`.
pub type MediaSessionSetPlaybackStateOutcome =
    MediaSessionOperationOutcome<MediaSessionSetPlaybackStateReason>;

/// TS `MediaSessionSetPositionStateOutcome`.
pub type MediaSessionSetPositionStateOutcome =
    MediaSessionOperationOutcome<MediaSessionSetPositionStateReason>;

/// TS `MediaSessionClearPositionStateOutcome`.
pub type MediaSessionClearPositionStateOutcome =
    MediaSessionOperationOutcome<MediaSessionClearPositionStateReason>;

/// A provider action listener and the exact, retryable release a provider returns from `subscribe`.
pub type MediaSessionActionListener = Arc<dyn Fn(&MediaSessionActionDetails) + Send + Sync>;
pub type MediaSessionActionUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// Media-session command capability (TS `HostMediaSessionCapability`). Slot absence on the host is
/// capability absence; these results describe runtime availability and operation failure. `destroy`
/// releases only the lanes this exact provider still owns. Plain dispatch data.
#[derive(Clone)]
pub struct HostMediaSessionCapability {
    pub clear_metadata: Arc<dyn Fn() -> MediaSessionClearMetadataOutcome + Send + Sync>,
    pub clear_position_state: Arc<dyn Fn() -> MediaSessionClearPositionStateOutcome + Send + Sync>,
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub set_metadata:
        Arc<dyn Fn(&MediaSessionMetadata) -> MediaSessionSetMetadataOutcome + Send + Sync>,
    pub set_playback_state:
        Arc<dyn Fn(MediaSessionPlaybackState) -> MediaSessionSetPlaybackStateOutcome + Send + Sync>,
    pub set_position_state: Arc<
        dyn Fn(&MediaSessionPositionState) -> MediaSessionSetPositionStateOutcome + Send + Sync,
    >,
}

/// Media-session action (event) capability (TS `HostMediaSessionActionCapability`), split from the
/// command capability: commands and subscriptions have independent teardown. `subscribe` registers
/// only the requested action and returns None when the session or action is unavailable. Plain
/// dispatch data.
#[derive(Clone)]
pub struct HostMediaSessionActionCapability {
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub subscribe: Arc<
        dyn Fn(
                MediaSessionAction,
                MediaSessionActionListener,
            ) -> Option<MediaSessionActionUnsubscribe>
            + Send
            + Sync,
    >,
}

/// Host media-session capability group (TS `HostMediaSessionCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostMediaSessionCapabilities {
    pub action: Option<HostMediaSessionActionCapability>,
    pub control: Option<HostMediaSessionCapability>,
}

/// One entity per requested OS action (TS `MediaSessionActionSignal extends Entity`): the exact
/// `action` and its `on_action` signal. The private `subscription` is the exact release of the
/// attached provider (TS keeps it in a module WeakMap keyed by the entity); it is cleared only after a
/// successful release, so a failing release stays retryable.
pub struct MediaSessionActionSignal {
    runtime: EntityRuntimeSlot,
    pub action: MediaSessionAction,
    pub on_action: Signal<MediaSessionActionDetails>,
    pub(crate) subscription: Option<MediaSessionActionUnsubscribe>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_media_session_action_signal sets the requested action
impl Default for MediaSessionActionSignal {
    fn default() -> Self {
        return MediaSessionActionSignal {
            runtime: EntityRuntimeSlot::default(),
            action: MediaSessionAction::Play,
            on_action: Signal::default(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the signal (identity, as TS) but not the attach subscription, which TS keys to the original entity only
impl Clone for MediaSessionActionSignal {
    fn clone(&self) -> Self {
        return MediaSessionActionSignal {
            runtime: EntityRuntimeSlot::default(),
            action: self.action,
            on_action: self.on_action.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held
impl fmt::Debug for MediaSessionActionSignal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("MediaSessionActionSignal")
            .field("action", &self.action)
            .field("on_action", &self.on_action)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(MediaSessionActionSignal);
