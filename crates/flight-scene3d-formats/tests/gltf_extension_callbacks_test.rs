use crate::gltf_extension_test_helper::*;
use flight_entity::Ref;
use flight_materials::{
    PbrExtension, SpecularGlossinessPbrMaterial, StandardPbrMaterial,
    TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

mod extension_callback_order {
    use super::*;

    #[test]
    fn reads_clearcoat_scalars_in_source_order_and_releases_all_locks_before_texture_callbacks() {
        let calls = Arc::new(AtomicUsize::new(0));
        let captured_calls = calls.clone();
        let observer = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "native-observe-clearcoat".to_string(),
            apply: Arc::new(move |context| {
                let source = context.read().unwrap().source.clone();
                let document = context.read().unwrap().document.clone();
                let resolve = context.read().unwrap().resolve_texture.clone();
                let weak_context = Arc::downgrade(context);
                let calls = captured_calls.clone();
                context.write().unwrap().resolve_texture = Arc::new(move |info, space| {
                    assert!(weak_context.upgrade().unwrap().try_write().is_ok());
                    assert!(document.try_write().is_ok());
                    let source = source.try_write().unwrap();
                    let material = source.materials.as_ref().unwrap()[0].try_write().unwrap();
                    let extensions = material.extensions.as_ref().unwrap().try_write().unwrap();
                    let mut block = extensions
                        .khr_materials_clearcoat
                        .as_ref()
                        .unwrap()
                        .try_write()
                        .unwrap();
                    match calls.fetch_add(1, Ordering::SeqCst) {
                        0 => block.clearcoat_factor = Some(0.9),
                        1 => {
                            block
                                .clearcoat_normal_texture
                                .as_ref()
                                .unwrap()
                                .try_write()
                                .unwrap()
                                .scale = Some(2.0);
                            block.clearcoat_roughness_factor = Some(0.75);
                        }
                        2 => (),
                        _ => panic!("unexpected texture callback"),
                    }
                    drop(block);
                    drop(extensions);
                    drop(material);
                    drop(source);
                    return resolve(info, space);
                });
            }),
        }));
        let document = extension_gltf(
            "coat.png",
            json!({"extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":0.1,"clearcoatNormalTexture":{"index":0,"scale":0.5},"clearcoatTexture":{"index":0},"clearcoatRoughnessTexture":{"index":0}}}}),
            &[observer, GLTF_CLEARCOAT_EXTENSION_HANDLER.clone()],
        );
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*extension else {
            panic!("expected clearcoat");
        };
        assert_eq!(extension.clearcoat, 0.1);
        assert_eq!(extension.clearcoat_normal_scale, 2.0);
        assert_eq!(extension.clearcoat_roughness, 0.75);
    }

    #[test]
    fn exposes_the_shared_transmission_descriptor_before_resolving_its_texture_and_keeps_its_identity()
     {
        let observed: Ref<Option<Ref<PbrExtension>>> = Arc::new(RwLock::new(None));
        let captured = observed.clone();
        let observer = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "native-observe-transmission".to_string(),
            apply: Arc::new(move |context| {
                let document = context.read().unwrap().document.clone();
                let captured = captured.clone();
                context.write().unwrap().resolve_texture = Arc::new(move |_, _| {
                    let target = find_gltf_pbr_extension(
                        &document.try_write().unwrap(),
                        0,
                        TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
                    )
                    .unwrap();
                    {
                        let mut extension = target.try_write().unwrap();
                        let PbrExtension::TransmissionVolume(extension) = &mut *extension else {
                            panic!("expected transmission volume");
                        };
                        assert_eq!(extension.transmission, 0.75);
                        extension.thickness = 9.0;
                    }
                    *captured.write().unwrap() = Some(target);
                    return None;
                });
            }),
        }));
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_transmission":{"transmissionFactor":0.75}}}),
            &[observer, GLTF_TRANSMISSION_EXTENSION_HANDLER.clone()],
        );
        let target = first_gltf_extension(&document);
        assert!(Arc::ptr_eq(
            &target,
            observed.read().unwrap().as_ref().unwrap()
        ));
        let target = target.read().unwrap();
        let PbrExtension::TransmissionVolume(target) = &*target else {
            panic!("expected transmission volume");
        };
        assert_eq!(target.thickness, 9.0);
    }

    #[test]
    fn specular_glossiness_copies_shared_fields_after_the_first_callback_and_alpha_after_the_last()
    {
        let calls = Arc::new(AtomicUsize::new(0));
        let captured = calls.clone();
        let observer = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "native-observe-specular-glossiness".to_string(),
            apply: Arc::new(move |context| {
                let document = context.read().unwrap().document.clone();
                let captured = captured.clone();
                context.write().unwrap().resolve_texture = Arc::new(move |_, _| {
                    let document = document.try_write().unwrap();
                    let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
                        panic!("expected entity");
                    };
                    let mut material = material.material.try_write().unwrap();
                    let standard = material
                        .as_any_mut()
                        .downcast_mut::<StandardPbrMaterial>()
                        .unwrap();
                    match captured.fetch_add(1, Ordering::SeqCst) {
                        0 => standard.emissive_strength = 4.0,
                        1 => {
                            standard.emissive_strength = 8.0;
                            flight_materials::Material3D::material3d_fields_mut(standard)
                                .alpha_cutoff = 0.75;
                        }
                        _ => panic!("unexpected texture callback"),
                    }
                    return None;
                });
            }),
        }));
        let document = extension_gltf(
            "sg.png",
            json!({"extensions":{"KHR_materials_pbrSpecularGlossiness":{}}}),
            &[observer, GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        with_gltf_material::<SpecularGlossinessPbrMaterial>(&document, |material| {
            assert_eq!(material.emissive_strength, 4.0);
            assert_eq!(
                flight_materials::Material3D::material3d_fields(material).alpha_cutoff,
                0.75
            );
        });
    }
}
