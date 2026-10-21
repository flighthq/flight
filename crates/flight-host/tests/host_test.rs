use flight_entity::{allocate_entity, get_entity_id, has_entity_runtime};
use flight_host::contract::*;

use crate::fixtures::fixture_host_audio_device_capability;
use crate::host_groups::HOST_GROUPS;

fn group_names(host: &Host) -> Vec<String> {
    return explain_host(host)
        .groups
        .into_iter()
        .map(|group| group.group)
        .collect();
}

fn filled_groups(host: &Host) -> Vec<String> {
    return explain_host(host)
        .groups
        .into_iter()
        .filter(|group| !group.slots.is_empty())
        .map(|group| group.group)
        .collect();
}

mod create_host {
    use super::*;

    #[test]
    fn creates_an_entity_immediately_while_leaving_its_runtime_allocation_lazy() {
        let host = create_host();
        let _: &dyn flight_entity::Entity = &host;
        assert!(!has_entity_runtime(&host));
    }

    #[test]
    fn materializes_the_complete_stable_host_shape_with_truthful_empty_groups() {
        let host = create_host();
        assert_eq!(group_names(&host), HOST_GROUPS);
        assert!(filled_groups(&host).is_empty());
    }

    #[test]
    fn preserves_supplied_capability_group_and_capability_identities_without_populating_another_group()
     {
        // D23 (B): the source's `createHost({ accessibility })` is create, then assign the group.
        let mut host = create_host();
        host.audio.device = Some(fixture_host_audio_device_capability());
        let provider = host.audio.device.as_ref().unwrap().provider.clone();
        assert!(std::sync::Arc::ptr_eq(
            &get_host_audio_device(&host).unwrap().provider,
            &provider
        ));
        assert_eq!(filled_groups(&host), vec!["audio".to_string()]);
    }

    // The source also asserts createHost is on the contract lane only. In Rust that is a module
    // visibility fact enforced at compile time: `flight_host::create_host` does not exist and
    // `flight_host::contract::create_host` does, so no runtime assertion can (or needs to) observe it.
}

mod initialize_host {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_host() {
        let mut out: Host = allocate_entity();
        initialize_host(&mut out);
        assert_eq!(group_names(&out), HOST_GROUPS);
        assert!(filled_groups(&out).is_empty());
    }

    #[test]
    fn writes_every_group_into_an_existing_construction_target_without_allocating() {
        let mut out = create_host();
        let id = get_entity_id(&out);
        out.audio.device = Some(fixture_host_audio_device_capability());
        initialize_host(&mut out);
        assert_eq!(get_entity_id(&out), id);
        assert_eq!(group_names(&out), HOST_GROUPS);
        assert!(out.audio.device.is_none());
    }
}
