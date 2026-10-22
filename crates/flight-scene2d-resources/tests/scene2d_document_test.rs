use std::sync::{Arc, RwLock};

use flight_audio::{
    AudioResourceReference, EmbeddedAudioResourceReferenceValue,
    create_embedded_audio_resource_reference,
};
use flight_image::{
    EmbeddedImageResourceReferenceValue, ImageResourceReference,
    create_embedded_image_resource_reference,
};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_resources::contract::*;

fn bytes(value: u8) -> Arc<RwLock<Box<[u8]>>> {
    return Arc::new(RwLock::new(vec![value].into_boxed_slice()));
}

mod create_scene2d_document {
    use super::*;

    #[test]
    fn allocates_empty_contracts_for_a_document_that_carries_none() {
        let document = create_scene2d_document();
        let document = document.read().unwrap();
        assert!(document.slots.is_empty());
        assert!(document.image_resources.is_empty());
        assert!(document.audio_resources.is_empty());
        assert!(document.background_color.is_none());
        assert!(document.source_kind.is_none());
    }

    #[test]
    fn retains_fields_assigned_after_canonical_construction() {
        let root: Node2DRef = create_display_object();
        let slot = create_scene2d_slot_reference();
        let image = create_embedded_image_resource_reference(bytes(1));
        image.write().unwrap().mime_type = Some("image/png".to_string());
        let audio = create_embedded_audio_resource_reference(bytes(2));
        audio.write().unwrap().mime_type = Some("audio/mpeg".to_string());
        let document = create_scene2d_document();
        {
            let mut document = document.write().unwrap();
            document.audio_resources = vec![AudioResourceReference::Embedded(
                EmbeddedAudioResourceReferenceValue { reference: audio },
            )];
            document.image_resources = vec![ImageResourceReference::Embedded(
                EmbeddedImageResourceReferenceValue { reference: image },
            )];
            document.root = root.clone();
            document.slots = vec![slot.clone()];
            document.source_kind = Some("acme".to_string());
        }
        let document = document.read().unwrap();
        assert!(Arc::ptr_eq(&document.root, &root));
        assert!(Arc::ptr_eq(&document.slots[0], &slot));
        assert_eq!(document.source_kind.as_deref(), Some("acme"));
        assert_eq!(document.image_resources.len(), 1);
        assert_eq!(document.audio_resources.len(), 1);
    }
}

mod create_scene2d_slot_reference {
    use super::*;

    #[test]
    fn allocates_an_empty_manifest_slot() {
        let reference = create_scene2d_slot_reference();
        let reference = reference.read().unwrap();
        assert!(reference.content.is_none());
        assert!(reference.linkage.is_none());
        assert!(reference.name.is_empty());
        assert!(!reference.required);
    }
}

mod initialize_scene2d_document {
    use super::*;

    #[test]
    fn resets_the_document_to_canonical_empty_fields() {
        let document = create_scene2d_document();
        document.write().unwrap().source_kind = Some("old".to_string());
        initialize_scene2d_document(&mut document.write().unwrap());
        assert!(document.read().unwrap().source_kind.is_none());
    }
}

mod initialize_scene2d_slot_reference {
    use super::*;

    #[test]
    fn resets_the_slot_to_canonical_empty_fields() {
        let reference = create_scene2d_slot_reference();
        reference.write().unwrap().name = "old".to_string();
        initialize_scene2d_slot_reference(&mut reference.write().unwrap());
        assert!(reference.read().unwrap().name.is_empty());
    }
}
