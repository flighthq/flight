use std::sync::Arc;

use flight_entity::{
    allocate_entity, get_entity_id, get_entity_runtime, get_entity_uid, has_entity_runtime,
    set_entity_uid,
};
use flight_font::contract::*;

use crate::support::face;

mod create_font_resource {
    use super::*;

    #[test]
    fn accepts_authored_fields_without_replacing_entity_or_face_identity() {
        let mut resource = create_font_resource();
        let id = get_entity_id(&resource);
        set_entity_uid(&mut resource, "font-resource".to_string());
        let runtime = get_entity_runtime(&resource).unwrap() as *const _;
        let attached = face("Arial");
        resource.family = "Arial".to_string();
        resource.face = Some(attached.clone());
        assert_eq!(get_entity_id(&resource), id);
        assert_eq!(get_entity_uid(&mut resource), "font-resource");
        assert_eq!(get_entity_runtime(&resource).unwrap() as *const _, runtime);
        assert_eq!(resource.family, "Arial");
        assert!(Arc::ptr_eq(resource.face.as_ref().unwrap(), &attached));
    }

    #[test]
    fn creates_an_unloaded_resource_then_accepts_an_assigned_family() {
        let mut resource = create_font_resource();
        assert!(resource.family.is_empty());
        resource.family = "Arial".to_string();
        assert_eq!(resource.family, "Arial");
        assert!(resource.face.is_none());
        assert!(!has_entity_runtime(&resource));
    }

    #[test]
    fn returns_a_new_entity_each_call() {
        let mut first = create_font_resource();
        first.family = "Arial".to_string();
        let mut second = create_font_resource();
        second.family = "Arial".to_string();
        assert_ne!(get_entity_id(&first), get_entity_id(&second));
        let _ = flight_entity::get_entity_uid(&mut first);
        assert!(has_entity_runtime(&first));
        assert!(!has_entity_runtime(&second));
    }
}

mod initialize_font_resource {
    use super::*;

    #[test]
    fn initializes_preallocated_construction_storage_without_replacing_its_runtime() {
        let mut resource: FontResource = allocate_entity();
        let id = get_entity_id(&resource);
        set_entity_uid(&mut resource, "preallocated-font".to_string());
        let runtime = get_entity_runtime(&resource).unwrap() as *const _;
        initialize_font_resource(&mut resource);
        assert!(resource.family.is_empty());
        assert!(resource.face.is_none());
        assert_eq!(get_entity_id(&resource), id);
        assert_eq!(get_entity_uid(&mut resource), "preallocated-font");
        assert_eq!(get_entity_runtime(&resource).unwrap() as *const _, runtime);
    }
}
