use std::future::ready;
use std::sync::Arc;

use flight_buffer::Blob;
use flight_entity::{FlightError, FlightErrorKind};
use flight_stream::AbortSignal;

use crate::types::*;
use crate::video_format::select_video_resource_url;
use crate::video_resource::create_video_resource;

#[cfg(test)]
mod sugar_tests {
    use std::future::{Future, ready};
    use std::sync::Arc;
    use std::task::{Context, Poll, Waker};

    use flight_buffer::create_blob;
    use flight_host::HostImageSource;

    use crate::contract::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn bare_host(can_play: bool) -> HostVideoCapability {
        return HostVideoCapability {
            provider: Arc::new(()),
            add_ended_listener: None,
            attach_stream: None,
            can_play_type: Arc::new(move |_mime| can_play),
            create_object_url: Some(Arc::new(|_blob| "blob:sugar".to_string())),
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
            load_url: Some(Arc::new(|_url, _options, _signal| {
                let element = Arc::new(HostImageSource {
                    provider: Arc::new(()),
                    handle: Arc::new(5_u32),
                });
                return Box::pin(ready(Ok(element)));
            })),
            pause: None,
            play: None,
            release_element: None,
            remove_ended_listener: None,
            revoke_object_url: Some(Arc::new(|_url| {})),
            set_current_time: None,
            set_loop: None,
            set_muted: None,
            set_playback_rate: None,
            set_volume: None,
        };
    }

    #[test]
    fn hostvideocapability_load_video_resource_from_blob_matches_load_video_resource_from_blob() {
        let s = bare_host(true);
        let blob = create_blob("video/mp4".to_string(), 0, None, None);
        let ra = block_on(s.load_video_resource_from_blob(&blob, None, None));
        let rb = block_on(load_video_resource_from_blob(&s, &blob, None, None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostvideocapability_load_video_resource_from_url_matches_load_video_resource_from_url() {
        let s = bare_host(true);
        let ra = block_on(s.load_video_resource_from_url("clip.mp4", None, None));
        let rb = block_on(load_video_resource_from_url(&s, "clip.mp4", None, None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostvideocapability_load_video_resource_from_urls_matches_load_video_resource_from_urls() {
        let s = bare_host(true);
        let sources = vec![VideoResourceUrl {
            url: "clip.mp4".to_string(),
            type_: None,
        }];
        let ra = block_on(s.load_video_resource_from_urls(&sources, None, None));
        let rb = block_on(load_video_resource_from_urls(&s, &sources, None, None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

fn backend_error(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    };
}

/// Loads a resource from a Blob through a host object URL. The URL is created first; when the load
/// fails (or is aborted) no resource takes ownership, so the URL is revoked and the failure returned
/// unchanged. On success the resource owns the URL and keeps it live for playback. A host without both
/// object-URL members fails before loading with "No video object URL backend available".
pub fn load_video_resource_from_blob(
    host_video: &HostVideoCapability,
    blob: &Arc<Blob>,
    options: Option<&VideoResourceLoadOptions>,
    signal: Option<&AbortSignal>,
) -> VideoProviderFuture<VideoResource> {
    let (Some(create_object_url), Some(revoke_object_url)) =
        (&host_video.create_object_url, &host_video.revoke_object_url)
    else {
        return Box::pin(ready(Err(backend_error(
            "No video object URL backend available",
        ))));
    };
    let url = create_object_url(blob);
    let pending = load_video_resource_from_url(host_video, &url, options, signal);
    let revoke = revoke_object_url.clone();
    return Box::pin(async move {
        match pending.await {
            Ok(mut resource) => {
                resource.object_url = Some(url);
                return Ok(resource);
            }
            Err(error) => {
                revoke(&url);
                return Err(error);
            }
        }
    });
}

/// Loads a resource from a URL through the host loader, wrapping the loaded element as owned. The
/// URL, options and signal reach the host unchanged, and its failures (including aborts) are returned
/// unchanged. A host without a loader fails with "No video element backend available".
pub fn load_video_resource_from_url(
    host_video: &HostVideoCapability,
    url: &str,
    options: Option<&VideoResourceLoadOptions>,
    signal: Option<&AbortSignal>,
) -> VideoProviderFuture<VideoResource> {
    let Some(load_url) = &host_video.load_url else {
        return Box::pin(ready(Err(backend_error(
            "No video element backend available",
        ))));
    };
    let pending = load_url(url, options, signal);
    return Box::pin(async move {
        let element = pending.await?;
        let mut resource = create_video_resource();
        resource.element = Some(element);
        resource.owns_element = true;
        return Ok(resource);
    });
}

/// Loads the first source the host can play, or resolves to an element-less resource when none is.
pub fn load_video_resource_from_urls(
    host_video: &HostVideoCapability,
    sources: &[VideoResourceUrl],
    options: Option<&VideoResourceLoadOptions>,
    signal: Option<&AbortSignal>,
) -> VideoProviderFuture<VideoResource> {
    let Some(selected) = select_video_resource_url(host_video, sources) else {
        return Box::pin(ready(Ok(create_video_resource())));
    };
    return load_video_resource_from_url(host_video, &selected.url, options, signal);
}

impl HostVideoCapability {
    pub fn load_video_resource_from_blob(
        &self,
        blob: &Arc<Blob>,
        options: Option<&VideoResourceLoadOptions>,
        signal: Option<&AbortSignal>,
    ) -> VideoProviderFuture<VideoResource> {
        return load_video_resource_from_blob(self, blob, options, signal);
    }

    pub fn load_video_resource_from_url(
        &self,
        url: &str,
        options: Option<&VideoResourceLoadOptions>,
        signal: Option<&AbortSignal>,
    ) -> VideoProviderFuture<VideoResource> {
        return load_video_resource_from_url(self, url, options, signal);
    }

    pub fn load_video_resource_from_urls(
        &self,
        sources: &[VideoResourceUrl],
        options: Option<&VideoResourceLoadOptions>,
        signal: Option<&AbortSignal>,
    ) -> VideoProviderFuture<VideoResource> {
        return load_video_resource_from_urls(self, sources, options, signal);
    }
}
