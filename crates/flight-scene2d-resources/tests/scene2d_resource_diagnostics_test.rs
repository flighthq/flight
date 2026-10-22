use std::sync::{Arc, Mutex};

use flight_audio::{
    AudioResourceReference, ExternalAudioResourceReferenceValue,
    create_external_audio_resource_reference,
};
use flight_image::{
    ExternalImageResourceReferenceValue, ImageResourceReference,
    create_external_image_resource_reference, create_image_resolver_state,
};
use flight_image_codec::HostImageDecodeCapabilities;
use flight_resource::ResourceResolutionState;
use flight_scene2d::create_display_object;
use flight_scene2d_resources::contract::*;

use crate::guard_state;

fn notice(reason: Scene2DResourceFailureReason) -> Scene2DResourceFailureNotice {
    return Scene2DResourceFailureNotice {
        operation: Scene2DResourceFailureOperation::ResolveScene2DResources,
        reason,
        total: 2,
        unresolved: 1,
        url: None,
    };
}

mod explain_scene2d_resource_coverage {
    use super::*;

    #[test]
    fn counts_every_asset_reference_and_only_required_slots() {
        let resolved_image = create_external_image_resource_reference("resolved.png".to_string());
        let failed_image = create_external_image_resource_reference("failed.png".to_string());
        resolved_image.write().unwrap().state = ResourceResolutionState::Resolved;
        failed_image.write().unwrap().state = ResourceResolutionState::Failed;
        let audio = create_external_audio_resource_reference("sound.mp3".to_string());
        audio.write().unwrap().state = ResourceResolutionState::Loading;
        let filled = create_scene2d_slot_reference();
        {
            let mut filled = filled.write().unwrap();
            filled.content = Some(create_display_object());
            filled.required = true;
        }
        let missing = create_scene2d_slot_reference();
        missing.write().unwrap().required = true;
        let optional = create_scene2d_slot_reference();
        optional.write().unwrap().required = false;
        let document = create_scene2d_document();
        {
            let mut document = document.write().unwrap();
            document.audio_resources = vec![AudioResourceReference::External(
                ExternalAudioResourceReferenceValue { reference: audio },
            )];
            document.image_resources = vec![
                ImageResourceReference::External(ExternalImageResourceReferenceValue {
                    reference: resolved_image,
                }),
                ImageResourceReference::External(ExternalImageResourceReferenceValue {
                    reference: failed_image,
                }),
            ];
            document.slots = vec![filled, missing, optional];
        }
        let mut out = Scene2DResourceCoverageExplanation {
            audio_resources: Scene2DResourceCoverageCount {
                resolved: 99,
                total: 99,
            },
            complete: true,
            image_resources: Scene2DResourceCoverageCount {
                resolved: 99,
                total: 99,
            },
            required_slots: Scene2DResourceCoverageCount {
                resolved: 99,
                total: 99,
            },
        };
        explain_scene2d_resource_coverage(&mut out, &document.read().unwrap());
        assert_eq!(
            out.audio_resources,
            Scene2DResourceCoverageCount {
                resolved: 0,
                total: 1
            }
        );
        assert_eq!(
            out.image_resources,
            Scene2DResourceCoverageCount {
                resolved: 1,
                total: 2
            }
        );
        assert_eq!(
            out.required_slots,
            Scene2DResourceCoverageCount {
                resolved: 1,
                total: 2
            }
        );
        assert!(!out.complete);
    }

    #[test]
    fn reports_an_empty_document_as_complete() {
        let document = create_scene2d_document();
        let mut out = Scene2DResourceCoverageExplanation {
            audio_resources: Scene2DResourceCoverageCount {
                resolved: 1,
                total: 2,
            },
            complete: false,
            image_resources: Scene2DResourceCoverageCount {
                resolved: 1,
                total: 2,
            },
            required_slots: Scene2DResourceCoverageCount {
                resolved: 1,
                total: 2,
            },
        };
        explain_scene2d_resource_coverage(&mut out, &document.read().unwrap());
        assert!(out.complete);
        assert_eq!(out.audio_resources.total, 0);
        assert_eq!(out.image_resources.total, 0);
        assert_eq!(out.required_slots.total, 0);
    }
}

mod report_scene2d_resource_failure {
    use super::*;

    #[test]
    fn routes_a_notice_only_through_an_installed_hook() {
        let state = guard_state();
        let seen = Arc::new(Mutex::new(Vec::new()));
        report_scene2d_resource_failure(
            &state,
            &notice(Scene2DResourceFailureReason::RequiredSlotsUnresolved),
        );
        let captured = seen.clone();
        set_scene2d_resource_failure_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.reason);
            })),
        );
        report_scene2d_resource_failure(
            &state,
            &notice(Scene2DResourceFailureReason::ImageResourcesUnresolved),
        );
        assert_eq!(
            *seen.lock().unwrap(),
            vec![Scene2DResourceFailureReason::ImageResourcesUnresolved]
        );
    }
}

mod set_scene2d_resource_failure_guard {
    use super::*;

    #[test]
    fn observes_each_sentinel_at_the_operation_that_produced_it() {
        let state = guard_state();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        set_scene2d_resource_failure_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.reason);
            })),
        );

        let slot = create_scene2d_slot_reference();
        slot.write().unwrap().required = true;
        let slot_document = create_scene2d_document();
        slot_document.write().unwrap().slots = vec![slot];
        let root = slot_document.read().unwrap().root.clone();
        let mut resolved = Scene2DResources {
            document: slot_document.clone(),
            resolved: Vec::new(),
            root,
            unresolved: Vec::new(),
        };
        resolve_scene2d_resources(&mut resolved, &slot_document, None, &state);

        let image = create_external_image_resource_reference("missing.png".to_string());
        let image_document = create_scene2d_document();
        image_document.write().unwrap().image_resources = vec![ImageResourceReference::External(
            ExternalImageResourceReferenceValue { reference: image },
        )];
        let image_decode = HostImageDecodeCapabilities {
            avif: None,
            bmp: None,
            gif: None,
            jpeg: None,
            png: None,
            webp: None,
        };
        futures::executor::block_on(load_scene2d_image_resources(
            &image_decode,
            &image_document,
            None,
            &create_image_resolver_state(),
            &state,
        ));

        let audio = create_external_audio_resource_reference("missing.mp3".to_string());
        let audio_document = create_scene2d_document();
        audio_document.write().unwrap().audio_resources = vec![AudioResourceReference::External(
            ExternalAudioResourceReferenceValue { reference: audio },
        )];
        futures::executor::block_on(load_scene2d_audio_resources(&audio_document, None, &state));

        let fetch: Scene2DDocumentFetcher = Arc::new(|_, _, _| Box::pin(async { None }));
        let registry = create_scene2d_document_importer_registry();
        futures::executor::block_on(load_scene2d_document_from_url(
            "missing.scene".to_string(),
            &registry,
            &fetch,
            None,
            &state,
        ));
        create_scene2d_document_from_bytes(&[1], &registry, None, &state);
        let mut registry = registry;
        register_scene2d_document_importer(
            &mut registry,
            "broken".to_string(),
            Arc::new(|_, _| true),
            Arc::new(|_, _| None),
        );
        create_scene2d_document_from_bytes(&[1], &registry, None, &state);

        assert_eq!(
            *reasons.lock().unwrap(),
            vec![
                Scene2DResourceFailureReason::RequiredSlotsUnresolved,
                Scene2DResourceFailureReason::ImageResourcesUnresolved,
                Scene2DResourceFailureReason::AudioResourcesUnresolved,
                Scene2DResourceFailureReason::DocumentFetchFailed,
                Scene2DResourceFailureReason::DocumentImporterMissing,
                Scene2DResourceFailureReason::DocumentImportFailed,
            ]
        );
    }
}
