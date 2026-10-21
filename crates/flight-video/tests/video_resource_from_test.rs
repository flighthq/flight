use std::future::ready;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_bitmap::HostImageSource;
use flight_buffer::{Blob, create_blob};
use flight_entity::{FlightError, FlightErrorKind};
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};
use flight_video::contract::*;

use crate::video_fixture::*;

type LoadCall = (
    String,
    Option<VideoResourceLoadOptions>,
    Option<AbortSignal>,
);

/// A recording host: `load_url` resolves with `element` (or rejects with `failure`), and every call,
/// object-URL creation and revocation is recorded.
struct LoaderHost {
    capability: HostVideoCapability,
    created: Arc<AtomicUsize>,
    loads: Arc<Mutex<Vec<LoadCall>>>,
    revoked: Arc<Mutex<Vec<String>>>,
}

fn blob() -> Arc<Blob> {
    return create_blob("video/mp4".to_string(), 0, None, None);
}

fn error(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    };
}

fn loader_host(
    element: Arc<HostImageSource>,
    failure: Option<FlightError>,
    can_play: bool,
) -> LoaderHost {
    let loads: Arc<Mutex<Vec<LoadCall>>> = Arc::new(Mutex::new(Vec::new()));
    let created = Arc::new(AtomicUsize::new(0));
    let revoked = Arc::new(Mutex::new(Vec::new()));
    let mut capability = empty_video_host(can_play);
    let record = loads.clone();
    capability.load_url = Some(Arc::new(move |url, options, signal| {
        record
            .lock()
            .unwrap()
            .push((url.to_string(), options.cloned(), signal.cloned()));
        return match &failure {
            Some(failure) => Box::pin(ready(Err(failure.clone()))),
            None => Box::pin(ready(Ok(element.clone()))),
        };
    }));
    let count = created.clone();
    capability.create_object_url = Some(Arc::new(move |_blob| {
        count.fetch_add(1, Ordering::SeqCst);
        return "blob:mock".to_string();
    }));
    let revokes = revoked.clone();
    capability.revoke_object_url = Some(Arc::new(move |url| {
        revokes.lock().unwrap().push(url.to_string())
    }));
    return LoaderHost {
        capability,
        created,
        loads,
        revoked,
    };
}

mod load_video_resource_from_blob {
    use super::*;

    #[test]
    fn returns_an_owned_resource_that_keeps_its_object_url_live_after_loading() {
        let element = video_source();
        let host = loader_host(element.clone(), None, false);
        let resource = block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            None,
            None,
        ))
        .unwrap();
        assert_eq!(host.created.load(Ordering::SeqCst), 1);
        let loads = host.loads.lock().unwrap();
        assert_eq!(loads.len(), 1);
        assert_eq!(loads[0].0, "blob:mock");
        assert!(loads[0].1.is_none() && loads[0].2.is_none());
        assert!(host.revoked.lock().unwrap().is_empty());
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &element));
        assert_eq!(resource.object_url.as_deref(), Some("blob:mock"));
        assert!(resource.owns_element);
    }

    #[test]
    fn forwards_loading_options_and_the_abort_signal_through_the_url_loader() {
        let host = loader_host(video_source(), None, false);
        let make: fn() -> VideoResourceLoadOptions = VideoResourceLoadOptions::default;
        let mut options = make();
        options.muted = Some(true);
        options.readiness = Some(VideoResourceLoadReadiness::Metadata);
        let controller = create_abort_controller();
        block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            Some(&options),
            Some(&controller.signal),
        ))
        .unwrap();
        let loads = host.loads.lock().unwrap();
        assert_eq!(loads[0].0, "blob:mock");
        assert_eq!(loads[0].1.as_ref(), Some(&options));
        // The forwarded signal shares the caller's state: aborting the caller's controller aborts it.
        let forwarded = loads[0].2.clone().unwrap();
        assert!(!is_abort_signal_aborted(&forwarded));
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(&forwarded));
    }

    #[test]
    fn revokes_the_object_url_when_loading_fails_because_no_resource_takes_ownership() {
        let failure = error("Failed to load video");
        let host = loader_host(video_source(), Some(failure.clone()), false);
        let result = block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            None,
            None,
        ));
        assert_eq!(result.unwrap_err(), failure);
        assert_eq!(*host.revoked.lock().unwrap(), vec!["blob:mock".to_string()]);
    }

    #[test]
    fn revokes_the_object_url_when_loading_is_aborted_because_no_resource_takes_ownership() {
        let failure = error("cancelled");
        let host = loader_host(video_source(), Some(failure.clone()), false);
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let result = block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            None,
            Some(&controller.signal),
        ));
        assert_eq!(result.unwrap_err(), failure);
        assert_eq!(*host.revoked.lock().unwrap(), vec!["blob:mock".to_string()]);
    }

    #[test]
    fn rejects_before_loading_without_create_object_url() {
        let mut host = loader_host(video_source(), None, false);
        host.capability.create_object_url = None;
        let result = block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            None,
            None,
        ));
        assert_eq!(
            result.unwrap_err().message,
            "No video object URL backend available"
        );
        assert!(host.loads.lock().unwrap().is_empty());
    }

    #[test]
    fn rejects_before_loading_without_revoke_object_url() {
        let mut host = loader_host(video_source(), None, false);
        host.capability.revoke_object_url = None;
        let result = block_on(load_video_resource_from_blob(
            &host.capability,
            &blob(),
            None,
            None,
        ));
        assert_eq!(
            result.unwrap_err().message,
            "No video object URL backend available"
        );
        assert!(host.loads.lock().unwrap().is_empty());
        assert_eq!(host.created.load(Ordering::SeqCst), 0);
    }
}

mod load_video_resource_from_url {
    use super::*;

    #[test]
    fn wraps_the_provider_result_as_an_owned_resource() {
        let element = video_source();
        let host = loader_host(element.clone(), None, false);
        let resource = block_on(load_video_resource_from_url(
            &host.capability,
            "test.mp4",
            None,
            None,
        ))
        .unwrap();
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &element));
        assert!(resource.object_url.is_none());
        assert!(resource.owns_element);
    }

    #[test]
    fn forwards_the_url_options_and_abort_signal_to_the_provider() {
        let host = loader_host(video_source(), None, false);
        let options = VideoResourceLoadOptions {
            cross_origin: Some("anonymous".to_string()),
            muted: Some(true),
            plays_inline: Some(true),
            preload: Some("metadata".to_string()),
            readiness: None,
        };
        let controller = create_abort_controller();
        block_on(load_video_resource_from_url(
            &host.capability,
            "test.mp4",
            Some(&options),
            Some(&controller.signal),
        ))
        .unwrap();
        let loads = host.loads.lock().unwrap();
        assert_eq!(loads[0].0, "test.mp4");
        assert_eq!(loads[0].1.as_ref(), Some(&options));
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(loads[0].2.as_ref().unwrap()));
    }

    #[test]
    fn rejects_when_the_provider_has_no_url_loader() {
        let result = block_on(load_video_resource_from_url(
            &empty_video_host(false),
            "test.mp4",
            None,
            None,
        ));
        assert_eq!(
            result.unwrap_err().message,
            "No video element backend available"
        );
    }

    #[test]
    fn preserves_provider_load_failures() {
        let failure = error("Failed to load video: bad.mp4");
        let host = loader_host(video_source(), Some(failure.clone()), false);
        let result = block_on(load_video_resource_from_url(
            &host.capability,
            "bad.mp4",
            None,
            None,
        ));
        assert_eq!(result.unwrap_err(), failure);
    }

    #[test]
    fn preserves_provider_abort_failures() {
        let failure = error("cancelled");
        let host = loader_host(video_source(), Some(failure.clone()), false);
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let result = block_on(load_video_resource_from_url(
            &host.capability,
            "test.mp4",
            None,
            Some(&controller.signal),
        ));
        assert_eq!(result.unwrap_err(), failure);
        let loads = host.loads.lock().unwrap();
        assert_eq!(loads[0].0, "test.mp4");
        assert!(loads[0].1.is_none());
        assert!(is_abort_signal_aborted(loads[0].2.as_ref().unwrap()));
    }
}

mod load_video_resource_from_urls {
    use super::*;

    #[test]
    fn resolves_immediately_with_a_null_element_resource_when_sources_is_empty() {
        let host = loader_host(video_source(), None, false);
        let resource = block_on(load_video_resource_from_urls(
            &host.capability,
            &[],
            None,
            None,
        ))
        .unwrap();
        assert!(resource.element.is_none());
        assert!(host.loads.lock().unwrap().is_empty());
    }

    #[test]
    fn resolves_to_a_null_element_resource_when_no_source_is_playable() {
        let host = loader_host(video_source(), None, false);
        let sources = [VideoResourceUrl {
            url: "test.mp4".to_string(),
            type_: None,
        }];
        let resource = block_on(load_video_resource_from_urls(
            &host.capability,
            &sources,
            None,
            None,
        ))
        .unwrap();
        assert!(resource.element.is_none());
        assert!(host.loads.lock().unwrap().is_empty());
    }

    #[test]
    fn loads_the_first_playable_source_through_the_provider() {
        let element = video_source();
        let host = loader_host(element.clone(), None, true);
        let sources = [VideoResourceUrl {
            url: "clip.mp4".to_string(),
            type_: None,
        }];
        let resource = block_on(load_video_resource_from_urls(
            &host.capability,
            &sources,
            None,
            None,
        ))
        .unwrap();
        let loads = host.loads.lock().unwrap();
        assert_eq!(loads.len(), 1);
        assert_eq!(loads[0].0, "clip.mp4");
        assert!(loads[0].1.is_none() && loads[0].2.is_none());
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &element));
    }
}
