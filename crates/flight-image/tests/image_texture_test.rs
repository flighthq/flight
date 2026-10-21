use std::sync::{Arc, RwLock};

use flight_entity::{Ref, Uint8Array};
use flight_image::contract::*;

fn embedded() -> ImageResourceReference {
    let bytes: Ref<Box<Uint8Array>> = Arc::new(RwLock::new(vec![1].into_boxed_slice()));
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue {
        reference: create_embedded_image_resource_reference(bytes, None, None),
    });
}

mod create_texture_from_image_resource {
    use super::*;

    #[test]
    fn joins_the_reference_exactly_once() {
        let reference = embedded();
        let texture = create_texture_from_image_resource(&reference, None);
        let ImageResourceReference::Embedded(value) = reference else {
            panic!("expected embedded reference");
        };
        let reference = value.reference.read().unwrap();
        assert_eq!(reference.textures.len(), 1);
        assert!(Arc::ptr_eq(&reference.textures[0], &texture));
    }

    #[test]
    fn each_call_creates_and_registers_one_distinct_texture() {
        let reference = embedded();
        let first = create_texture_from_image_resource(&reference, None);
        let second = create_texture_from_image_resource(&reference, None);
        assert!(!Arc::ptr_eq(&first, &second));
        let ImageResourceReference::Embedded(value) = reference else {
            panic!("expected embedded reference");
        };
        assert_eq!(value.reference.read().unwrap().textures.len(), 2);
    }
}
