use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_bitmap::HostImageSource;
use flight_buffer::Blob;
use flight_entity::{EntityRuntimeSlot, FlightError, Unknown};
use flight_hostcapability::ProviderRef;
use flight_stream::AbortSignal;

/// A provider Promise (D15). `Err` is its rejection, which reaches the caller unchanged.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type VideoProviderFuture<T> = Pin<Box<dyn Future<Output = Result<T, FlightError>> + Send>>;

/// A video channel's playback state (TS `VideoChannelState`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VideoChannelState {
    Complete,
    Paused,
    Playing,
    Stopped,
}

/// Playback options for a video channel (TS `VideoPlayOptions`). Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct VideoPlayOptions {
    pub current_time: Option<f32>,
    pub gain: Option<f32>,
    pub loops: Option<i32>,
    pub playback_rate: Option<f32>,
}

/// A carrier over one host video source (TS `VideoResource extends Entity`). `element` is the host
/// source, shared by identity (`None` = the source's `null`). `object_url` is the blob object URL
/// this resource owns, held for its whole life (the element keeps fetching from it while it plays and
/// re-fetches on seek), so teardown revokes it. `owns_element` is true when this resource created the
/// element and teardown should release its decoder; false when the caller supplied it.
#[derive(Clone)]
pub struct VideoResource {
    runtime: EntityRuntimeSlot,
    pub element: Option<Arc<HostImageSource>>,
    pub object_url: Option<String>,
    pub owns_element: bool,
}

/// Which media event resolves an element-backed load (TS `VideoResourceLoadOptions['readiness']`):
/// metadata (dimensions/duration known), canplay (enough buffered to start), or canplaythrough
/// (estimated buffered to the end without stalling).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VideoResourceLoadReadiness {
    Metadata,
    Canplay,
    Canplaythrough,
}

/// Options threaded into the element-backed URL loaders (TS `VideoResourceLoadOptions`). `None`
/// fields keep the loader's default policy (preload "auto", resolve on canplay, no crossOrigin /
/// muted / playsInline). Plain record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct VideoResourceLoadOptions {
    pub cross_origin: Option<String>,
    pub muted: Option<bool>,
    pub plays_inline: Option<bool>,
    pub preload: Option<String>,
    pub readiness: Option<VideoResourceLoadReadiness>,
}

/// One candidate source for `load_video_resource_from_urls` (TS `VideoResourceUrl`). An explicit
/// `type_` (the TS field `type`) wins over the URL extension. Plain record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct VideoResourceUrl {
    pub url: String,
    pub type_: Option<String>,
}

/// A listener for a video element's ended event.
pub type VideoEndedListener = Arc<dyn Fn() + Send + Sync>;

/// The host video capability (TS `HostVideoCapability`). Every member but `can_play_type` is
/// optional: `None` is a host that does not carry it, and the reading operations fall back to their
/// documented sentinels.
// flight-lint: allow(f64) D1: host media clocks (current time, duration) are JS-number seconds that reach live-stream Infinity and long-media precision
#[derive(Clone)]
pub struct HostVideoCapability {
    pub provider: ProviderRef,
    pub add_ended_listener:
        Option<Arc<dyn Fn(&Arc<HostImageSource>, VideoEndedListener) + Send + Sync>>,
    pub attach_stream: Option<Arc<dyn Fn(&Unknown) -> Option<Arc<HostImageSource>> + Send + Sync>>,
    pub can_play_type: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub create_object_url: Option<Arc<dyn Fn(&Arc<Blob>) -> String + Send + Sync>>,
    pub create_video_element: Option<Arc<dyn Fn() -> Option<Arc<HostImageSource>> + Send + Sync>>,
    pub get_current_time: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f64 + Send + Sync>>,
    pub get_duration: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f64 + Send + Sync>>,
    pub get_height: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f32 + Send + Sync>>,
    pub get_loop: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> bool + Send + Sync>>,
    pub get_muted: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> bool + Send + Sync>>,
    pub get_playback_rate: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f32 + Send + Sync>>,
    pub get_volume: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f32 + Send + Sync>>,
    pub get_width: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> f32 + Send + Sync>>,
    pub is_ready: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> bool + Send + Sync>>,
    pub load_url: Option<
        Arc<
            dyn Fn(
                    &str,
                    Option<&VideoResourceLoadOptions>,
                    Option<&AbortSignal>,
                ) -> VideoProviderFuture<Arc<HostImageSource>>
                + Send
                + Sync,
        >,
    >,
    pub pause: Option<Arc<dyn Fn(&Arc<HostImageSource>) + Send + Sync>>,
    pub play: Option<Arc<dyn Fn(&Arc<HostImageSource>) -> VideoProviderFuture<()> + Send + Sync>>,
    pub release_element: Option<Arc<dyn Fn(&Arc<HostImageSource>) + Send + Sync>>,
    pub remove_ended_listener:
        Option<Arc<dyn Fn(&Arc<HostImageSource>, &VideoEndedListener) + Send + Sync>>,
    pub revoke_object_url: Option<Arc<dyn Fn(&str) + Send + Sync>>,
    pub set_current_time: Option<Arc<dyn Fn(&Arc<HostImageSource>, f64) + Send + Sync>>,
    pub set_loop: Option<Arc<dyn Fn(&Arc<HostImageSource>, bool) + Send + Sync>>,
    pub set_muted: Option<Arc<dyn Fn(&Arc<HostImageSource>, bool) + Send + Sync>>,
    pub set_playback_rate: Option<Arc<dyn Fn(&Arc<HostImageSource>, f32) + Send + Sync>>,
    pub set_volume: Option<Arc<dyn Fn(&Arc<HostImageSource>, f32) + Send + Sync>>,
}

/// Host video capability group (TS `HostVideoCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostVideoCapabilities {
    pub playback: Option<HostVideoCapability>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_video_resource sets the carrier state
impl Default for VideoResource {
    fn default() -> Self {
        return VideoResource {
            runtime: EntityRuntimeSlot::default(),
            element: None,
            object_url: None,
            owns_element: false,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the element is an opaque host handle, so Debug reports its presence
impl fmt::Debug for VideoResource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("VideoResource")
            .field("element", &self.element.is_some())
            .field("object_url", &self.object_url)
            .field("owns_element", &self.owns_element)
            .finish();
    }
}

flight_entity::impl_entity!(VideoResource);
