use std::future::Future;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_bitmap::HostImageSource;
use flight_video::contract::*;

/// What a fake host recorded: teardown order, released elements and revoked URLs.
#[derive(Default)]
pub struct FakeVideoLog {
    pub order: Vec<&'static str>,
    pub released: Vec<Arc<HostImageSource>>,
    pub revoked: Vec<String>,
}

/// The reported state of `fake_video_host`; `None` fields answer 0 / false, as in the source.
#[derive(Clone, Copy, Default)]
pub struct FakeVideoState {
    pub duration: Option<f64>,
    pub height: Option<f32>,
    pub ready: Option<bool>,
    pub width: Option<f32>,
}

pub struct FakeVideoHost {
    pub capability: HostVideoCapability,
    pub log: Arc<Mutex<FakeVideoLog>>,
}

pub fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

/// A host video slot that carries none of the optional members (the shape a non-browser host
/// takes), answering `can_play_type` with `can_play`.
pub fn empty_video_host(can_play: bool) -> HostVideoCapability {
    return probing_host(Arc::new(move |_mime| can_play));
}

/// A host that answers every queried video member and records what it was asked to release and
/// revoke, in one shared order log.
pub fn fake_video_host(state: FakeVideoState) -> FakeVideoHost {
    let log = Arc::new(Mutex::new(FakeVideoLog::default()));
    let mut capability = empty_video_host(true);
    capability.get_duration = Some(Arc::new(move |_element| state.duration.unwrap_or(0.0)));
    capability.get_height = Some(Arc::new(move |_element| state.height.unwrap_or(0.0)));
    capability.get_width = Some(Arc::new(move |_element| state.width.unwrap_or(0.0)));
    capability.is_ready = Some(Arc::new(move |_element| state.ready.unwrap_or(false)));
    let released = log.clone();
    capability.release_element = Some(Arc::new(move |element| {
        let mut log = released.lock().unwrap();
        log.order.push("release");
        log.released.push(element.clone());
    }));
    let revoked = log.clone();
    capability.revoke_object_url = Some(Arc::new(move |url| {
        let mut log = revoked.lock().unwrap();
        log.order.push("revoke");
        log.revoked.push(url.to_string());
    }));
    return FakeVideoHost { capability, log };
}

/// A host with only the required probe.
pub fn probing_host(can_play_type: Arc<dyn Fn(&str) -> bool + Send + Sync>) -> HostVideoCapability {
    return HostVideoCapability {
        provider: Arc::new(()),
        add_ended_listener: None,
        attach_stream: None,
        can_play_type,
        create_object_url: None,
        create_video_element: None,
        get_current_time: None,
        get_duration: None,
        get_height: None,
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: None,
        is_ready: None,
        load_url: None,
        pause: None,
        play: None,
        release_element: None,
        remove_ended_listener: None,
        revoke_object_url: None,
        set_current_time: None,
        set_loop: None,
        set_muted: None,
        set_playback_rate: None,
        set_volume: None,
    };
}

/// A distinct opaque host video source; tests compare sources by `Arc::ptr_eq`.
pub fn video_source() -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    });
}
