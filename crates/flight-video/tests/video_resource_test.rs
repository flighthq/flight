use std::sync::Arc;

use flight_video::contract::*;

use crate::video_fixture::*;

fn released_is(host: &FakeVideoHost, expected: &[&Arc<flight_bitmap::HostImageSource>]) -> bool {
    let log = host.log.lock().unwrap();
    return log.released.len() == expected.len()
        && log
            .released
            .iter()
            .zip(expected)
            .all(|(a, b)| Arc::ptr_eq(a, b));
}

fn state() -> FakeVideoState {
    let make: fn() -> FakeVideoState = FakeVideoState::default;
    return make();
}

mod create_video_resource {
    use super::*;

    #[test]
    fn returns_a_resource_with_null_element_when_called_with_no_arguments() {
        let resource = create_video_resource(None, None, None);
        assert!(resource.element.is_none());
        assert!(!resource.owns_element);
    }

    #[test]
    fn stores_the_provided_host_video_source_as_borrowed_by_default() {
        let source = video_source();
        let resource = create_video_resource(Some(source.clone()), None, None);
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &source));
        assert!(!resource.owns_element);
    }

    #[test]
    fn marks_the_source_as_owned_when_explicitly_requested() {
        let source = video_source();
        let resource = create_video_resource(Some(source.clone()), None, Some(true));
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &source));
        assert!(resource.owns_element);
    }
}

mod destroy_video_resource {
    use super::*;

    #[test]
    fn asks_the_host_to_release_an_owned_source_detaching_a_live_stream_with_it() {
        let host = fake_video_host(state());
        let source = video_source();
        let mut resource = create_video_resource(Some(source.clone()), None, Some(true));
        destroy_video_resource(&host.capability, &mut resource);
        assert!(released_is(&host, &[&source]));
        assert!(resource.element.is_none());
        assert!(!resource.owns_element);
    }

    #[test]
    fn does_not_release_a_borrowed_source() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), None, None);
        destroy_video_resource(&host.capability, &mut resource);
        assert!(released_is(&host, &[]));
        assert!(resource.element.is_none());
        assert!(!resource.owns_element);
    }

    #[test]
    fn revokes_an_owned_object_url_after_the_host_has_released_the_element() {
        let host = fake_video_host(state());
        let mut resource =
            create_video_resource(Some(video_source()), Some("blob:owned"), Some(true));
        destroy_video_resource(&host.capability, &mut resource);
        assert_eq!(host.log.lock().unwrap().order, vec!["release", "revoke"]);
    }

    #[test]
    fn revokes_an_object_url_even_when_the_source_is_borrowed() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), Some("blob:owned"), None);
        destroy_video_resource(&host.capability, &mut resource);
        assert_eq!(
            host.log.lock().unwrap().revoked,
            vec!["blob:owned".to_string()]
        );
        assert!(resource.object_url.is_none());
    }

    #[test]
    fn is_idempotent_a_second_destruction_is_a_no_op() {
        let host = fake_video_host(state());
        let mut resource =
            create_video_resource(Some(video_source()), Some("blob:owned"), Some(true));
        destroy_video_resource(&host.capability, &mut resource);
        destroy_video_resource(&host.capability, &mut resource);
        let log = host.log.lock().unwrap();
        assert_eq!(log.released.len(), 1);
        assert_eq!(log.revoked, vec!["blob:owned".to_string()]);
    }

    #[test]
    fn still_clears_the_resource_when_the_host_carries_no_release_capability() {
        let mut resource =
            create_video_resource(Some(video_source()), Some("blob:owned"), Some(true));
        destroy_video_resource(&empty_video_host(false), &mut resource);
        assert!(resource.element.is_none());
        assert!(resource.object_url.is_none());
    }
}

mod dispose_video_resource {
    use super::*;

    #[test]
    fn releases_the_source_regardless_of_ownership_and_drops_it() {
        let host = fake_video_host(state());
        let source = video_source();
        let mut resource = create_video_resource(Some(source.clone()), None, None);
        dispose_video_resource(&host.capability, &mut resource);
        assert!(released_is(&host, &[&source]));
        assert!(resource.element.is_none());
        assert!(!resource.owns_element);
    }

    #[test]
    fn is_a_no_op_on_an_already_element_less_resource() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(None, None, None);
        dispose_video_resource(&host.capability, &mut resource);
        assert!(released_is(&host, &[]));
        assert!(resource.element.is_none());
    }

    #[test]
    fn revokes_an_owned_object_url_and_clears_it() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), Some("blob:owned"), None);
        dispose_video_resource(&host.capability, &mut resource);
        assert_eq!(
            host.log.lock().unwrap().revoked,
            vec!["blob:owned".to_string()]
        );
        assert!(resource.object_url.is_none());
    }

    #[test]
    fn does_not_revoke_again_when_disposed_twice() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), Some("blob:owned"), None);
        dispose_video_resource(&host.capability, &mut resource);
        dispose_video_resource(&host.capability, &mut resource);
        assert_eq!(
            host.log.lock().unwrap().revoked,
            vec!["blob:owned".to_string()]
        );
    }

    #[test]
    fn revokes_nothing_when_the_resource_owns_no_object_url() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), None, None);
        dispose_video_resource(&host.capability, &mut resource);
        assert!(host.log.lock().unwrap().revoked.is_empty());
    }

    #[test]
    fn revokes_the_object_url_only_after_the_host_has_released_the_element() {
        let host = fake_video_host(state());
        let mut resource = create_video_resource(Some(video_source()), Some("blob:owned"), None);
        dispose_video_resource(&host.capability, &mut resource);
        assert_eq!(host.log.lock().unwrap().order, vec!["release", "revoke"]);
    }
}

mod get_video_channel_state_string {
    use super::*;

    #[test]
    fn round_trips_every_state_through_its_source_string() {
        for (value, text) in [
            (VideoChannelState::Complete, "complete"),
            (VideoChannelState::Paused, "paused"),
            (VideoChannelState::Playing, "playing"),
            (VideoChannelState::Stopped, "stopped"),
        ] {
            assert_eq!(get_video_channel_state_string(value), text);
            assert_eq!(parse_video_channel_state(text), Some(value));
        }
        assert_eq!(parse_video_channel_state("ended"), None);
    }
}

mod get_video_resource_duration {
    use super::*;

    #[test]
    fn returns_0_when_there_is_no_element() {
        let host = fake_video_host(state());
        assert_eq!(
            get_video_resource_duration(&host.capability, &create_video_resource(None, None, None)),
            0.0
        );
    }

    #[test]
    fn reads_duration_from_the_host() {
        let host = fake_video_host(FakeVideoState {
            duration: Some(12.5),
            ..state()
        });
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(
            get_video_resource_duration(&host.capability, &resource),
            12.5
        );
    }

    #[test]
    fn returns_0_when_the_host_cannot_report_a_duration() {
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(
            get_video_resource_duration(&empty_video_host(false), &resource),
            0.0
        );
    }

    #[test]
    fn passes_host_nan_and_infinity_through() {
        let resource = create_video_resource(Some(video_source()), None, None);
        let pending = fake_video_host(FakeVideoState {
            duration: Some(f64::NAN),
            ..state()
        });
        let live = fake_video_host(FakeVideoState {
            duration: Some(f64::INFINITY),
            ..state()
        });
        assert!(get_video_resource_duration(&pending.capability, &resource).is_nan());
        assert_eq!(
            get_video_resource_duration(&live.capability, &resource),
            f64::INFINITY
        );
    }
}

mod get_video_resource_height {
    use super::*;

    #[test]
    fn returns_0_when_there_is_no_element() {
        let host = fake_video_host(state());
        assert_eq!(
            get_video_resource_height(&host.capability, &create_video_resource(None, None, None)),
            0.0
        );
    }

    #[test]
    fn reads_the_decoded_height_from_the_host() {
        let host = fake_video_host(FakeVideoState {
            height: Some(480.0),
            ..state()
        });
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(
            get_video_resource_height(&host.capability, &resource),
            480.0
        );
    }

    #[test]
    fn returns_0_when_the_host_cannot_report_dimensions() {
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(
            get_video_resource_height(&empty_video_host(false), &resource),
            0.0
        );
    }
}

mod get_video_resource_load_readiness_string {
    use super::*;

    #[test]
    fn round_trips_every_readiness_through_its_source_string() {
        for (value, text) in [
            (VideoResourceLoadReadiness::Metadata, "metadata"),
            (VideoResourceLoadReadiness::Canplay, "canplay"),
            (VideoResourceLoadReadiness::Canplaythrough, "canplaythrough"),
        ] {
            assert_eq!(get_video_resource_load_readiness_string(value), text);
            assert_eq!(parse_video_resource_load_readiness(text), Some(value));
        }
        assert_eq!(parse_video_resource_load_readiness("loaded"), None);
    }
}

mod get_video_resource_width {
    use super::*;

    #[test]
    fn returns_0_when_there_is_no_element() {
        let host = fake_video_host(state());
        assert_eq!(
            get_video_resource_width(&host.capability, &create_video_resource(None, None, None)),
            0.0
        );
    }

    #[test]
    fn reads_the_decoded_width_from_the_host() {
        let host = fake_video_host(FakeVideoState {
            width: Some(640.0),
            ..state()
        });
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(get_video_resource_width(&host.capability, &resource), 640.0);
    }

    #[test]
    fn returns_0_when_the_host_cannot_report_dimensions() {
        let resource = create_video_resource(Some(video_source()), None, None);
        assert_eq!(
            get_video_resource_width(&empty_video_host(false), &resource),
            0.0
        );
    }
}

mod has_video_resource_element {
    use super::*;

    #[test]
    fn is_false_without_an_element_and_true_with_one() {
        assert!(!has_video_resource_element(&create_video_resource(
            None, None, None
        )));
        assert!(has_video_resource_element(&create_video_resource(
            Some(video_source()),
            None,
            None
        )));
    }
}

mod initialize_video_resource {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_video_resource() {
        let source = video_source();
        let mut out = create_video_resource(None, None, None);
        initialize_video_resource(&mut out, Some(source.clone()), Some("blob:x"), Some(true));
        let made = create_video_resource(Some(source.clone()), Some("blob:x"), Some(true));
        assert!(Arc::ptr_eq(out.element.as_ref().unwrap(), &source));
        assert_eq!(out.object_url, made.object_url);
        assert_eq!(out.owns_element, made.owns_element);
        initialize_video_resource(&mut out, None, None, None);
        assert!(out.element.is_none() && out.object_url.is_none() && !out.owns_element);
    }
}

mod is_video_resource_empty {
    use super::*;

    #[test]
    fn is_true_when_there_is_no_element() {
        let host = fake_video_host(FakeVideoState {
            height: Some(480.0),
            width: Some(640.0),
            ..state()
        });
        assert!(is_video_resource_empty(
            &host.capability,
            &create_video_resource(None, None, None)
        ));
    }

    #[test]
    fn is_true_when_the_host_reports_no_decoded_dimensions() {
        let host = fake_video_host(FakeVideoState {
            height: Some(0.0),
            width: Some(0.0),
            ..state()
        });
        assert!(is_video_resource_empty(
            &host.capability,
            &create_video_resource(Some(video_source()), None, None)
        ));
    }

    #[test]
    fn is_false_once_the_host_reports_dimensions() {
        let host = fake_video_host(FakeVideoState {
            height: Some(480.0),
            width: Some(640.0),
            ..state()
        });
        assert!(!is_video_resource_empty(
            &host.capability,
            &create_video_resource(Some(video_source()), None, None)
        ));
    }

    #[test]
    fn is_true_when_only_one_dimension_is_zero() {
        let wide = fake_video_host(FakeVideoState {
            height: Some(0.0),
            width: Some(640.0),
            ..state()
        });
        let tall = fake_video_host(FakeVideoState {
            height: Some(480.0),
            width: Some(0.0),
            ..state()
        });
        let resource = create_video_resource(Some(video_source()), None, None);
        assert!(is_video_resource_empty(&wide.capability, &resource));
        assert!(is_video_resource_empty(&tall.capability, &resource));
    }

    #[test]
    fn is_true_when_the_host_cannot_report_dimensions_at_all() {
        let resource = create_video_resource(Some(video_source()), None, None);
        assert!(is_video_resource_empty(&empty_video_host(false), &resource));
    }
}

mod is_video_resource_ready {
    use super::*;

    #[test]
    fn is_false_when_there_is_no_element() {
        let host = fake_video_host(FakeVideoState {
            ready: Some(true),
            ..state()
        });
        assert!(!is_video_resource_ready(
            &host.capability,
            &create_video_resource(None, None, None)
        ));
    }

    #[test]
    fn is_false_while_the_host_reports_no_decoded_frame() {
        let host = fake_video_host(FakeVideoState {
            ready: Some(false),
            ..state()
        });
        assert!(!is_video_resource_ready(
            &host.capability,
            &create_video_resource(Some(video_source()), None, None)
        ));
    }

    #[test]
    fn is_true_once_the_host_reports_a_decoded_frame() {
        let host = fake_video_host(FakeVideoState {
            ready: Some(true),
            ..state()
        });
        assert!(is_video_resource_ready(
            &host.capability,
            &create_video_resource(Some(video_source()), None, None)
        ));
    }

    #[test]
    fn is_false_when_the_host_cannot_answer_readiness() {
        let resource = create_video_resource(Some(video_source()), None, None);
        assert!(!is_video_resource_ready(
            &empty_video_host(false),
            &resource
        ));
    }
}

mod parse_video_channel_state {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_video_channel_state("Playing"), None);
        assert_eq!(parse_video_channel_state(""), None);
    }
}

mod parse_video_resource_load_readiness {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_video_resource_load_readiness("CanPlay"), None);
        assert_eq!(parse_video_resource_load_readiness(""), None);
    }
}
