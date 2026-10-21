use std::sync::Arc;

use flight_audio::contract::*;
use flight_entity::Ref;

fn resource_with_samples() -> Ref<AudioResource> {
    let buffer = create_audio_buffer(3, 2, 48_000.0);
    copy_to_audio_buffer_channel(&buffer, &[0.0, 0.5, 0.25], 0);
    copy_to_audio_buffer_channel(&buffer, &[0.75, -0.5, 0.25], 1);
    return create_audio_resource(Some(buffer));
}

mod clone_audio_resource {
    use super::*;

    #[test]
    fn creates_an_independent_entity_over_the_same_buffer_reference() {
        let resource = resource_with_samples();
        let cloned = clone_audio_resource(&resource);
        assert!(!Arc::ptr_eq(&resource, &cloned));
        assert!(Arc::ptr_eq(
            resource.read().unwrap().buffer.as_ref().unwrap(),
            cloned.read().unwrap().buffer.as_ref().unwrap()
        ));
    }
}

mod create_audio_resource {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_optional_shared_buffer() {
        let empty = create_audio_resource(None);
        assert!(empty.read().unwrap().buffer.is_none());
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let resource = create_audio_resource(Some(buffer.clone()));
        assert!(Arc::ptr_eq(
            resource.read().unwrap().buffer.as_ref().unwrap(),
            &buffer
        ));
    }
}

mod dispose_audio_resource {
    use super::*;

    #[test]
    fn releases_the_buffer_reference() {
        let resource = resource_with_samples();
        dispose_audio_resource(&resource);
        assert!(resource.read().unwrap().buffer.is_none());
    }
}

mod get_audio_resource_byte_size {
    use super::*;

    #[test]
    fn reports_zero_or_channels_times_length_times_float_size() {
        assert_eq!(
            get_audio_resource_byte_size(&create_audio_resource(None)),
            0
        );
        assert_eq!(get_audio_resource_byte_size(&resource_with_samples()), 24);
    }
}

mod get_audio_resource_channel_count {
    use super::*;

    #[test]
    fn derives_the_count_from_the_channel_handles() {
        assert_eq!(
            get_audio_resource_channel_count(&create_audio_resource(None)),
            0
        );
        assert_eq!(
            get_audio_resource_channel_count(&resource_with_samples()),
            2
        );
    }
}

mod get_audio_resource_channel_data {
    use super::*;

    #[test]
    fn returns_the_shared_mutable_channel_handle_only_in_range() {
        let resource = resource_with_samples();
        let channel = get_audio_resource_channel_data(&resource, 1).unwrap();
        assert!(Arc::ptr_eq(
            &channel,
            &resource
                .read()
                .unwrap()
                .buffer
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .channels[1]
        ));
        channel.write().unwrap()[0] = 1.0;
        assert_eq!(
            resource
                .read()
                .unwrap()
                .buffer
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .channels[1]
                .read()
                .unwrap()[0],
            1.0
        );
        assert!(get_audio_resource_channel_data(&resource, -1).is_none());
        assert!(get_audio_resource_channel_data(&resource, 2).is_none());
        assert!(get_audio_resource_channel_data(&create_audio_resource(None), 0).is_none());
    }
}

mod get_audio_resource_duration {
    use super::*;

    #[test]
    fn derives_double_precision_seconds_or_zero() {
        assert_eq!(
            get_audio_resource_duration(&create_audio_resource(None)),
            0.0
        );
        assert_eq!(
            get_audio_resource_duration(&resource_with_samples()),
            3.0 / 48_000.0
        );
    }
}

mod get_audio_resource_sample_rate {
    use super::*;

    #[test]
    fn reports_the_buffer_rate_or_zero() {
        assert_eq!(
            get_audio_resource_sample_rate(&create_audio_resource(None)),
            0.0
        );
        assert_eq!(
            get_audio_resource_sample_rate(&resource_with_samples()),
            48_000.0
        );
    }
}

mod has_audio_resource_buffer {
    use super::*;

    #[test]
    fn distinguishes_absent_and_present_buffers() {
        assert!(!has_audio_resource_buffer(&create_audio_resource(None)));
        assert!(has_audio_resource_buffer(&resource_with_samples()));
    }
}

mod initialize_audio_resource {
    use super::*;

    #[test]
    fn replaces_the_construction_buffer_without_copying_it() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let resource = create_audio_resource(None);
        initialize_audio_resource(&mut resource.write().unwrap(), Some(buffer.clone()));
        assert!(Arc::ptr_eq(
            resource.read().unwrap().buffer.as_ref().unwrap(),
            &buffer
        ));
    }
}

mod is_audio_resource_empty {
    use super::*;

    #[test]
    fn is_true_only_without_a_buffer_or_for_a_zero_length_plain_record() {
        assert!(is_audio_resource_empty(&create_audio_resource(None)));
        assert!(!is_audio_resource_empty(&resource_with_samples()));
    }
}
