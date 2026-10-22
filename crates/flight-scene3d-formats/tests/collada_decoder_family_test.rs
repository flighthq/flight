use flight_camera::Projection;
use flight_entity::Ref;
use flight_materials::StandardPbrMaterial;
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::*;
use std::sync::Arc;

const FULL_DOCUMENT: &str = r##"<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><up_axis>Y_UP</up_axis></asset>
  <library_effects>
    <effect id="fx"><profile_COMMON><technique sid="t"><lambert>
      <diffuse><color>0.8 0.2 0.1 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
  <library_cameras><camera id="cam"><optics><technique_common><perspective>
    <yfov>45</yfov><znear>0.1</znear><zfar>100</zfar>
  </perspective></technique_common></optics></camera></library_cameras>
  <library_lights><light id="lit"><technique_common><point>
    <color>1 1 1</color>
  </point></technique_common></light></library_lights>
  <library_geometries>
    <geometry id="geo"><mesh>
      <source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array></source>
      <vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices>
      <triangles count="1" material="mat"><input semantic="VERTEX" source="#verts" offset="0"/><p>0 1 2</p></triangles>
    </mesh></geometry>
  </library_geometries>
  <library_animations>
    <animation id="anim">
      <source id="t-in"><float_array id="t-in-a" count="2">0 1</float_array></source>
      <source id="t-out"><float_array id="t-out-a" count="2">0 5</float_array></source>
      <sampler id="samp"><input semantic="INPUT" source="#t-in"/><input semantic="OUTPUT" source="#t-out"/></sampler>
      <channel source="#samp" target="nodeA/translate.X"/>
    </animation>
  </library_animations>
  <library_visual_scenes>
    <visual_scene id="scene">
      <node id="nodeA"><instance_geometry url="#geo">
        <bind_material><technique_common>
          <instance_material symbol="mat" target="#mat"/>
        </technique_common></bind_material>
      </instance_geometry></node>
      <node id="nodeC"><instance_camera url="#cam"/></node>
      <node id="nodeL"><instance_light url="#lit"/></node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>"##;

fn full_fixture_snapshot(document: &Scene3DDocument) -> Vec<String> {
    // Canonical EntityRuntimeSlot Debug is opaque; every data field remains in these snapshots.
    let animations = document
        .animations
        .iter()
        .map(|animation| {
            let channels = animation
                .channels
                .iter()
                .map(|channel| {
                    format!(
                        "{:?}",
                        (channel.node, channel.path, &*channel.track.read().unwrap())
                    )
                })
                .collect::<Vec<_>>();
            format!("{:?}", (animation.duration, &animation.name, channels))
        })
        .collect::<Vec<_>>();
    let cameras = document
        .cameras
        .iter()
        .map(|camera| {
            let projection = match &camera.projection {
                Projection::Perspective(projection) => {
                    let projection = projection.read().unwrap();
                    format!("Perspective {:?}", (projection.aspect, projection.fov_y))
                }
                Projection::Orthographic(projection) => {
                    let projection = projection.read().unwrap();
                    format!(
                        "Orthographic {:?}",
                        (projection.half_height, projection.half_width)
                    )
                }
                Projection::Raw(projection) => {
                    let projection = projection.read().unwrap();
                    format!("Raw {:?}", &projection.matrix.read().unwrap().m)
                }
            };
            format!(
                "{:?}",
                (
                    camera.far,
                    camera.near,
                    camera.node,
                    &camera.name,
                    projection,
                    &camera.transform
                )
            )
        })
        .collect::<Vec<_>>();
    let lights = document
        .lights
        .iter()
        .map(|light| {
            format!(
                "{:?}",
                (
                    &*light.descriptor.read().unwrap(),
                    &light.name,
                    light.node,
                    &light.transform
                )
            )
        })
        .collect::<Vec<_>>();
    let materials = document
        .materials
        .iter()
        .map(|material| match material {
            Scene3DDocumentMaterial::Entity(entity) => {
                let material = entity.material.read().unwrap();
                format!(
                    "Entity {:?}",
                    material
                        .as_any()
                        .downcast_ref::<StandardPbrMaterial>()
                        .unwrap()
                )
            }
            Scene3DDocumentMaterial::Fields(fields) => {
                format!("Fields {:?}", (&fields.kind, &fields.name))
            }
        })
        .collect::<Vec<_>>();
    let meshes = document
        .meshes
        .iter()
        .map(|mesh| {
            let morph = mesh
                .morph
                .as_ref()
                .map(|morph| format!("{:?}", &*morph.read().unwrap()));
            format!(
                "{:?}",
                (
                    &*mesh.geometry.read().unwrap(),
                    &mesh.materials,
                    morph,
                    &mesh.name,
                    mesh.skin
                )
            )
        })
        .collect::<Vec<_>>();
    let metadata = document
        .metadata
        .as_ref()
        .map(|metadata| format!("{:?}", &*metadata.read().unwrap()));
    let nodes = document
        .nodes
        .iter()
        .map(|node| {
            format!(
                "{:?}",
                (
                    &node.children,
                    &node.kind,
                    node.mesh,
                    &node.name,
                    &node.transform
                )
            )
        })
        .collect::<Vec<_>>();
    // The original complete-family fixture declares no images; its complete resource array is [].
    assert!(document.resources.is_empty());
    let scenes = document
        .scenes
        .iter()
        .map(|scene| format!("{:?}", (&scene.name, &scene.root_nodes)))
        .collect::<Vec<_>>();
    let skins = document
        .skins
        .iter()
        .map(|skin| format!("{:?}", (&skin.joints, &skin.inverse_bind)))
        .collect::<Vec<_>>();
    return vec![
        format!("animations={animations:?}"),
        format!("cameras={cameras:?}"),
        format!("lights={lights:?}"),
        format!("materials={materials:?}"),
        format!("meshes={meshes:?}"),
        format!("metadata={metadata:?}"),
        format!("nodes={nodes:?}"),
        "resources=[]".to_string(),
        format!("scenes={scenes:?}"),
        format!("skins={skins:?}"),
    ];
}

fn without(omitted: &Ref<ColladaElementDecoder>) -> Vec<Ref<ColladaElementDecoder>> {
    return COLLADA_ALL_ELEMENT_DECODERS
        .iter()
        .filter(|decoder| !Arc::ptr_eq(decoder, omitted))
        .cloned()
        .collect();
}

mod collada_all_element_decoders {
    use super::*;

    #[test]
    fn is_the_six_decoders_in_the_order_the_single_function_parser_ran_them() {
        let features = COLLADA_ALL_ELEMENT_DECODERS
            .iter()
            .map(|decoder| decoder.read().unwrap().features[0].clone())
            .collect::<Vec<_>>();
        assert_eq!(
            features,
            [
                "Material",
                "Camera",
                "Geometry",
                "Controller",
                "Animation",
                "Light"
            ]
        );
        assert!(
            features
                .iter()
                .position(|feature| feature == "Material")
                .unwrap()
                < features
                    .iter()
                    .position(|feature| feature == "Geometry")
                    .unwrap()
        );
        for (actual, expected) in COLLADA_ALL_ELEMENT_DECODERS.iter().zip([
            &*COLLADA_MATERIAL_DECODER,
            &*COLLADA_CAMERA_DECODER,
            &*COLLADA_GEOMETRY_DECODER,
            &*COLLADA_CONTROLLER_DECODER,
            &*COLLADA_ANIMATION_DECODER,
            &*COLLADA_LIGHT_DECODER,
        ]) {
            assert!(Arc::ptr_eq(actual, expected));
        }
    }

    #[test]
    fn joins_every_decoder_feature_to_the_feature_map_and_claims_exact_coarse_elements_once() {
        let mut features = Vec::new();
        for decoder in &*COLLADA_ALL_ELEMENT_DECODERS {
            let decoder = decoder.read().unwrap();
            assert!(!decoder.elements.is_empty());
            for feature in &decoder.features {
                assert!(
                    COLLADA_FEATURE_ELEMENTS
                        .iter()
                        .any(|entry| entry.feature == *feature)
                );
                assert!(!features.contains(feature));
                features.push(feature.clone());
            }
            let mut actual = decoder.elements.clone();
            actual.sort();
            let mut expected = COLLADA_FEATURE_ELEMENTS
                .iter()
                .find(|entry| entry.feature == decoder.features[0])
                .unwrap()
                .elements
                .clone();
            expected.sort();
            assert_eq!(actual, expected);
        }
        assert_eq!(features.len(), COLLADA_FEATURE_ELEMENTS.len());
        for feature in &*COLLADA_FEATURE_ELEMENTS {
            assert!(features.contains(&feature.feature));
        }
    }

    #[test]
    fn exposes_and_invokes_a_callable_decode_on_every_member() {
        let result = parse_collada(
            FULL_DOCUMENT,
            Some(&ColladaImportOptions {
                base_url: None,
                decoders: Some(Vec::new()),
            }),
        );
        // The stock callbacks run on a real retained parse context, without installing any default.
        let saved = std::sync::Arc::new(std::sync::RwLock::new(None::<Ref<ColladaParseContext>>));
        let observed = saved.clone();
        let observer = std::sync::Arc::new(std::sync::RwLock::new(ColladaElementDecoder {
            elements: Vec::new(),
            features: Vec::new(),
            build: None,
            build_phase: None,
            decode: Arc::new(move |context| {
                *observed.write().unwrap() = Some(context.clone());
            }),
        }));
        let explicit = parse_collada_with_decoders(FULL_DOCUMENT, &[observer], None);
        assert!(explicit.document.read().unwrap().meshes.is_empty());
        assert!(result.document.read().unwrap().meshes.is_empty());
        let context = saved.read().unwrap().as_ref().unwrap().clone();
        for decoder in &*COLLADA_ALL_ELEMENT_DECODERS {
            let decode = decoder.read().unwrap().decode.clone();
            decode(&context);
        }
        assert!(
            !context
                .read()
                .unwrap()
                .document
                .read()
                .unwrap()
                .meshes
                .is_empty()
        );
    }
}

mod parse_collada {
    use super::*;

    #[test]
    fn parses_identically_with_the_default_and_with_the_full_family_named_explicitly() {
        let implicit = parse_collada(FULL_DOCUMENT, None);
        let explicit = parse_collada(
            FULL_DOCUMENT,
            Some(&ColladaImportOptions {
                base_url: None,
                decoders: Some(COLLADA_ALL_ELEMENT_DECODERS.clone()),
            }),
        );
        assert_eq!(
            full_fixture_snapshot(&explicit.document.read().unwrap()),
            full_fixture_snapshot(&implicit.document.read().unwrap())
        );
        assert_eq!(
            *explicit.diagnostics.read().unwrap(),
            *implicit.diagnostics.read().unwrap()
        );
        assert_eq!(explicit.up_axis, implicit.up_axis);
        assert_eq!(explicit.root_transform, implicit.root_transform);
    }

    #[test]
    fn produces_content_at_all_from_the_full_family() {
        let result = parse_collada(FULL_DOCUMENT, None);
        let document = result.document.read().unwrap();
        assert!(!document.meshes.is_empty());
        assert!(!document.materials.is_empty());
    }

    #[test]
    fn omitting_the_material_or_geometry_decoder_empties_only_what_it_owns_for_both_actual_table_rows()
     {
        for (name, omitted) in [
            ("Material", &*COLLADA_MATERIAL_DECODER),
            ("Geometry", &*COLLADA_GEOMETRY_DECODER),
        ] {
            let full = parse_collada(FULL_DOCUMENT, None);
            let partial = parse_collada(
                FULL_DOCUMENT,
                Some(&ColladaImportOptions {
                    base_url: None,
                    decoders: Some(without(omitted)),
                }),
            );
            let full = full.document.read().unwrap();
            let partial = partial.document.read().unwrap();
            if name == "Material" {
                assert!(!full.materials.is_empty());
                assert!(partial.materials.is_empty());
            } else {
                assert!(!full.meshes.is_empty());
                assert!(partial.meshes.is_empty());
            }
        }
    }

    #[test]
    fn omitting_camera_light_controller_or_animation_keeps_the_rest_for_all_four_actual_table_rows()
    {
        for omitted in [
            &*COLLADA_CAMERA_DECODER,
            &*COLLADA_LIGHT_DECODER,
            &*COLLADA_CONTROLLER_DECODER,
            &*COLLADA_ANIMATION_DECODER,
        ] {
            let full = parse_collada(FULL_DOCUMENT, None);
            let partial = parse_collada(
                FULL_DOCUMENT,
                Some(&ColladaImportOptions {
                    base_url: None,
                    decoders: Some(without(omitted)),
                }),
            );
            let full = full.document.read().unwrap();
            let partial = partial.document.read().unwrap();
            assert_eq!(partial.meshes.len(), full.meshes.len());
            assert_eq!(partial.materials.len(), full.materials.len());
        }
    }

    #[test]
    fn parses_a_document_with_no_decoders_at_all_and_preserves_asset_conversion_for_all_three_family_choices()
     {
        let result = parse_collada(
            FULL_DOCUMENT,
            Some(&ColladaImportOptions {
                base_url: None,
                decoders: Some(Vec::new()),
            }),
        );
        let document = result.document.read().unwrap();
        assert!(document.meshes.is_empty());
        assert!(document.materials.is_empty());
        assert_eq!(result.up_axis, ColladaUpAxis::YUp);
        assert!(!result.root_transform.is_empty());
        let z_up = FULL_DOCUMENT.replace("<up_axis>Y_UP</up_axis>", "<up_axis>Z_UP</up_axis>");
        for family in [
            None,
            Some(COLLADA_ALL_ELEMENT_DECODERS.clone()),
            Some(Vec::new()),
        ] {
            let options = family.map(|decoders| ColladaImportOptions {
                base_url: None,
                decoders: Some(decoders),
            });
            let result = parse_collada(&z_up, options.as_ref());
            assert_eq!(result.up_axis, ColladaUpAxis::ZUp);
            assert!(
                result
                    .diagnostics
                    .read()
                    .unwrap()
                    .iter()
                    .any(|entry| entry.kind == "collada.coordinate-conversion")
            );
        }
    }
}
