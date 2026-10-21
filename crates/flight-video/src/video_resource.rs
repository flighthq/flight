use std::sync::Arc;

use flight_bitmap::HostImageSource;
use flight_entity::allocate_entity;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex};

    use flight_bitmap::HostImageSource;

    use crate::contract::*;

    fn test_source() -> Arc<HostImageSource> {
        return Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(3_u32),
        });
    }

    fn test_host(log: Arc<Mutex<Vec<String>>>) -> HostVideoCapability {
        let mut host = bare_host();
        host.get_duration = Some(Arc::new(|_element| 9.5));
        host.get_height = Some(Arc::new(|_element| 360.0));
        host.get_width = Some(Arc::new(|_element| 640.0));
        host.is_ready = Some(Arc::new(|_element| true));
        let released = log.clone();
        host.release_element = Some(Arc::new(move |_element| {
            released.lock().unwrap().push("release".to_string())
        }));
        host.revoke_object_url = Some(Arc::new(move |url| {
            log.lock().unwrap().push(format!("revoke {url}"))
        }));
        return host;
    }

    fn bare_host() -> HostVideoCapability {
        return HostVideoCapability {
            provider: Arc::new(()),
            add_ended_listener: None,
            attach_stream: None,
            can_play_type: Arc::new(|_mime| true),
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

    fn owned_resource() -> VideoResource {
        return create_video_resource(Some(test_source()), Some("blob:a"), Some(true));
    }

    #[test]
    fn hostvideocapability_destroy_video_resource_matches_destroy_video_resource() {
        let (la, lb) = (
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        let (mut a, mut b) = (owned_resource(), owned_resource());
        test_host(la.clone()).destroy_video_resource(&mut a);
        destroy_video_resource(&test_host(lb.clone()), &mut b);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
    }

    #[test]
    fn hostvideocapability_dispose_video_resource_matches_dispose_video_resource() {
        let (la, lb) = (
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        let (mut a, mut b) = (owned_resource(), owned_resource());
        test_host(la.clone()).dispose_video_resource(&mut a);
        dispose_video_resource(&test_host(lb.clone()), &mut b);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
    }

    #[test]
    fn hostvideocapability_get_video_resource_duration_matches_get_video_resource_duration() {
        let s = test_host(Arc::new(Mutex::new(Vec::new())));
        let r = owned_resource();
        assert_eq!(
            s.get_video_resource_duration(&r),
            get_video_resource_duration(&s, &r)
        );
    }

    #[test]
    fn hostvideocapability_get_video_resource_height_matches_get_video_resource_height() {
        let s = test_host(Arc::new(Mutex::new(Vec::new())));
        let r = owned_resource();
        assert_eq!(
            s.get_video_resource_height(&r),
            get_video_resource_height(&s, &r)
        );
    }

    #[test]
    fn hostvideocapability_get_video_resource_width_matches_get_video_resource_width() {
        let s = test_host(Arc::new(Mutex::new(Vec::new())));
        let r = owned_resource();
        assert_eq!(
            s.get_video_resource_width(&r),
            get_video_resource_width(&s, &r)
        );
    }

    #[test]
    fn hostvideocapability_is_video_resource_empty_matches_is_video_resource_empty() {
        let s = test_host(Arc::new(Mutex::new(Vec::new())));
        let r = owned_resource();
        assert_eq!(
            s.is_video_resource_empty(&r),
            is_video_resource_empty(&s, &r)
        );
    }

    #[test]
    fn hostvideocapability_is_video_resource_ready_matches_is_video_resource_ready() {
        let s = test_host(Arc::new(Mutex::new(Vec::new())));
        let r = owned_resource();
        assert_eq!(
            s.is_video_resource_ready(&r),
            is_video_resource_ready(&s, &r)
        );
    }

    #[test]
    fn videoresource_has_video_resource_element_matches_has_video_resource_element() {
        let r = owned_resource();
        assert_eq!(
            r.has_video_resource_element(),
            has_video_resource_element(&r)
        );
    }

    #[test]
    fn videoresource_initialize_video_resource_matches_initialize_video_resource() {
        let source = test_source();
        let mut a = create_video_resource(None, None, None);
        let mut b = create_video_resource(None, None, None);
        a.initialize_video_resource(Some(source.clone()), Some("blob:b"), Some(true));
        initialize_video_resource(&mut b, Some(source.clone()), Some("blob:b"), Some(true));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert!(Arc::ptr_eq(
            a.element.as_ref().unwrap(),
            b.element.as_ref().unwrap()
        ));
    }
}

/// Wraps a host video source the caller already holds. No provider is needed: storing a source reads
/// nothing from a host. `object_url` transfers ownership of a blob object URL to the resource (teardown
/// revokes it); `owns_element` true means this resource created the element and teardown releases its
/// decoder. All default to absent / borrowed.
pub fn create_video_resource(
    element: Option<Arc<HostImageSource>>,
    object_url: Option<&str>,
    owns_element: Option<bool>,
) -> VideoResource {
    let mut out: VideoResource = allocate_entity();
    initialize_video_resource(&mut out, element, object_url, owns_element);
    return out;
}

/// The construction initializer of `create_video_resource`.
pub fn initialize_video_resource(
    out: &mut VideoResource,
    element: Option<Arc<HostImageSource>>,
    object_url: Option<&str>,
    owns_element: Option<bool>,
) {
    out.element = element;
    out.object_url = object_url.map(|url| url.to_string());
    out.owns_element = owns_element.unwrap_or(false);
}

/// Releases the resource's non-GC state. An owned element is released through the host (which also
/// detaches a live capture stream without stopping caller-owned tracks); a borrowed element is only
/// dropped. A held object URL is revoked in either case, after the element is released.
pub fn destroy_video_resource(host_video: &HostVideoCapability, resource: &mut VideoResource) {
    if let Some(element) = &resource.element {
        if resource.owns_element {
            if let Some(release) = &host_video.release_element {
                release(element);
            }
        }
    }
    release_video_resource_object_url(host_video, resource);
    resource.element = None;
    resource.owns_element = false;
}

/// Legacy unconditional teardown: releases the element regardless of ownership, then revokes a held
/// object URL. Prefer `destroy_video_resource` for caller-provided elements.
pub fn dispose_video_resource(host_video: &HostVideoCapability, resource: &mut VideoResource) {
    if let Some(element) = &resource.element {
        if let Some(release) = &host_video.release_element {
            release(element);
        }
    }
    release_video_resource_object_url(host_video, resource);
    resource.element = None;
    resource.owns_element = false;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS VideoChannelState string union; the TS package exports no get_/parse_ free functions
pub fn get_video_channel_state_string(value: VideoChannelState) -> &'static str {
    return match value {
        VideoChannelState::Complete => "complete",
        VideoChannelState::Paused => "paused",
        VideoChannelState::Playing => "playing",
        VideoChannelState::Stopped => "stopped",
    };
}

/// Duration in seconds, or 0 without an element or when the host cannot report one. NaN before
/// metadata loads and Infinity for live streams come straight from the host.
// flight-lint: allow(f64) D1: media durations are JS-number seconds that reach live-stream Infinity and long-media precision
pub fn get_video_resource_duration(
    host_video: &HostVideoCapability,
    resource: &VideoResource,
) -> f64 {
    return match (&resource.element, &host_video.get_duration) {
        (Some(element), Some(get_duration)) => get_duration(element),
        _ => 0.0,
    };
}

/// Decoded height, or 0 without an element or when the host cannot report dimensions.
pub fn get_video_resource_height(
    host_video: &HostVideoCapability,
    resource: &VideoResource,
) -> f32 {
    return match (&resource.element, &host_video.get_height) {
        (Some(element), Some(get_height)) => get_height(element),
        _ => 0.0,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS VideoResourceLoadReadiness string union; the TS package exports no get_/parse_ free functions
pub fn get_video_resource_load_readiness_string(value: VideoResourceLoadReadiness) -> &'static str {
    return match value {
        VideoResourceLoadReadiness::Metadata => "metadata",
        VideoResourceLoadReadiness::Canplay => "canplay",
        VideoResourceLoadReadiness::Canplaythrough => "canplaythrough",
    };
}

/// Decoded width, or 0 without an element or when the host cannot report dimensions.
pub fn get_video_resource_width(host_video: &HostVideoCapability, resource: &VideoResource) -> f32 {
    return match (&resource.element, &host_video.get_width) {
        (Some(element), Some(get_width)) => get_width(element),
        _ => 0.0,
    };
}

/// Whether the resource carries a host element.
pub fn has_video_resource_element(resource: &VideoResource) -> bool {
    return resource.element.is_some();
}

/// Empty when there is no element, when the host cannot report dimensions, or when the reported frame
/// has no area yet (`width <= 0 || height <= 0`; a NaN dimension is not empty, as in the source).
pub fn is_video_resource_empty(host_video: &HostVideoCapability, resource: &VideoResource) -> bool {
    return get_video_resource_width(host_video, resource) <= 0.0
        || get_video_resource_height(host_video, resource) <= 0.0;
}

/// True once the host reports at least the current frame decoded.
pub fn is_video_resource_ready(host_video: &HostVideoCapability, resource: &VideoResource) -> bool {
    return match (&resource.element, &host_video.is_ready) {
        (Some(element), Some(is_ready)) => is_ready(element),
        _ => false,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS VideoChannelState string union; the TS package exports no get_/parse_ free functions
pub fn parse_video_channel_state(value: &str) -> Option<VideoChannelState> {
    return match value {
        "complete" => Some(VideoChannelState::Complete),
        "paused" => Some(VideoChannelState::Paused),
        "playing" => Some(VideoChannelState::Playing),
        "stopped" => Some(VideoChannelState::Stopped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS VideoResourceLoadReadiness string union; the TS package exports no get_/parse_ free functions
pub fn parse_video_resource_load_readiness(value: &str) -> Option<VideoResourceLoadReadiness> {
    return match value {
        "metadata" => Some(VideoResourceLoadReadiness::Metadata),
        "canplay" => Some(VideoResourceLoadReadiness::Canplay),
        "canplaythrough" => Some(VideoResourceLoadReadiness::Canplaythrough),
        _ => None,
    };
}

// The object URL is the resource's own, so every teardown path revokes it through the host (which owns
// the object-URL lifecycle) and forgets it, even when no host can revoke it.
fn release_video_resource_object_url(
    host_video: &HostVideoCapability,
    resource: &mut VideoResource,
) {
    let Some(url) = resource.object_url.take() else {
        return;
    };
    if let Some(revoke) = &host_video.revoke_object_url {
        revoke(&url);
    }
}

impl HostVideoCapability {
    pub fn destroy_video_resource(&self, resource: &mut VideoResource) {
        destroy_video_resource(self, resource);
    }

    pub fn dispose_video_resource(&self, resource: &mut VideoResource) {
        dispose_video_resource(self, resource);
    }

    // flight-lint: allow(f64) D1: media durations are JS-number seconds that reach live-stream Infinity and long-media precision
    pub fn get_video_resource_duration(&self, resource: &VideoResource) -> f64 {
        return get_video_resource_duration(self, resource);
    }

    pub fn get_video_resource_height(&self, resource: &VideoResource) -> f32 {
        return get_video_resource_height(self, resource);
    }

    pub fn get_video_resource_width(&self, resource: &VideoResource) -> f32 {
        return get_video_resource_width(self, resource);
    }

    pub fn is_video_resource_empty(&self, resource: &VideoResource) -> bool {
        return is_video_resource_empty(self, resource);
    }

    pub fn is_video_resource_ready(&self, resource: &VideoResource) -> bool {
        return is_video_resource_ready(self, resource);
    }
}

impl VideoResource {
    pub fn initialize_video_resource(
        &mut self,
        element: Option<Arc<HostImageSource>>,
        object_url: Option<&str>,
        owns_element: Option<bool>,
    ) {
        initialize_video_resource(self, element, object_url, owns_element);
    }

    pub fn has_video_resource_element(&self) -> bool {
        return has_video_resource_element(self);
    }
}
