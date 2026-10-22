use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex};

use flight_entity::throw_error;
use flight_image::contract::*;
use flight_scene3d_resources::contract::*;
use flight_stream::{AbortSignal, abort_controller, create_abort_controller};
use futures::FutureExt;
use futures::executor::block_on;

use crate::support::fake_image;

type Requests = Arc<Mutex<Vec<(String, Option<ImageCrossOrigin>, Option<AbortSignal>)>>>;

fn recording_host_image(
    requests: &Requests,
    outcome: Arc<dyn Fn() -> Option<flight_entity::Ref<ImageResource>> + Send + Sync>,
) -> HostImageCapability {
    let requests = requests.clone();
    return HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: None,
        load_image_from_url: Arc::new(move |url, cross_origin, signal| {
            requests.lock().unwrap().push((url, cross_origin, signal));
            let outcome = outcome.clone();
            Box::pin(async move {
                return outcome().unwrap_or_else(|| throw_error("404"));
            })
        }),
        provider: Arc::new(()),
    };
}

fn external(uri: &str, base_path: Option<&str>) -> flight_entity::Ref<ExternalImageResourceReference> {
    let reference = create_external_image_resource_reference(uri.to_string());
    reference.write().unwrap().base_path = base_path.map(str::to_string);
    return reference;
}

mod create_web_image_resource_fetch {
    use super::*;

    #[test]
    fn fetches_the_resolved_url_and_returns_the_decoded_image() {
        let requests: Requests = Arc::new(Mutex::new(Vec::new()));
        let image = fake_image();
        let returned = image.clone();
        let host_image = recording_host_image(&requests, Arc::new(move || Some(returned.clone())));
        let fetch = create_web_image_resource_fetch(&host_image);
        let controller = create_abort_controller();

        let result = block_on(fetch(external("leaf.png", Some("assets/textures")), controller.signal.clone()));

        let requests = requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].0, "assets/textures/leaf.png");
        assert!(requests[0].1.is_none());
        assert!(requests[0].2.is_some());
        assert!(Arc::ptr_eq(&result.unwrap(), &image));
    }

    #[test]
    fn returns_none_on_a_non_abort_failure() {
        let requests: Requests = Arc::new(Mutex::new(Vec::new()));
        let host_image = recording_host_image(&requests, Arc::new(|| None));
        let fetch = create_web_image_resource_fetch(&host_image);
        let result = block_on(fetch(external("missing.png", None), create_abort_controller().signal));
        assert!(result.is_none());
    }

    #[test]
    fn rethrows_when_the_signal_aborted_a_cancellation_not_a_failure() {
        let requests: Requests = Arc::new(Mutex::new(Vec::new()));
        let host_image = recording_host_image(&requests, Arc::new(|| None));
        let fetch = create_web_image_resource_fetch(&host_image);
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let result = block_on(
            AssertUnwindSafe(fetch(external("x.png", None), controller.signal.clone())).catch_unwind(),
        );
        assert!(result.is_err());
    }
}

mod resolve_image_resource_uri {
    use super::*;

    #[test]
    fn joins_a_relative_uri_to_a_base_path() {
        assert_eq!(resolve_image_resource_uri("leaf.png", Some("assets/tex")), "assets/tex/leaf.png");
    }

    #[test]
    fn does_not_double_the_separator_when_the_base_ends_with_a_slash() {
        assert_eq!(resolve_image_resource_uri("leaf.png", Some("assets/tex/")), "assets/tex/leaf.png");
    }

    #[test]
    fn keeps_a_scheme_absolute_uri_verbatim() {
        assert_eq!(
            resolve_image_resource_uri("https://cdn.test/leaf.png", Some("assets/tex")),
            "https://cdn.test/leaf.png"
        );
    }

    #[test]
    fn keeps_a_data_uri_verbatim() {
        assert_eq!(
            resolve_image_resource_uri("data:image/png;base64,AAAA", Some("assets/tex")),
            "data:image/png;base64,AAAA"
        );
    }

    #[test]
    fn keeps_a_root_absolute_uri_verbatim() {
        assert_eq!(
            resolve_image_resource_uri("/textures/leaf.png", Some("assets/tex")),
            "/textures/leaf.png"
        );
    }

    #[test]
    fn returns_a_relative_uri_unchanged_when_the_base_path_is_none() {
        assert_eq!(resolve_image_resource_uri("leaf.png", None), "leaf.png");
    }
}
