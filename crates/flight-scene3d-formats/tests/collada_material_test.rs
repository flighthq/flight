use flight_image::ImageResourceReference;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::contract::get_pbr_roughness_from_phong_shininess;
use flight_materials::{Material3D, MaterialAlphaMode, StandardPbrMaterial};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::contract::ColladaIndexEntry;
use flight_scene3d_formats::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use flight_xml::parse_xml_document;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

const SOURCE_XML_0: &str = r##"
      <COLLADA>
        <library_effects>
          <effect id="lambert-fx">
            <profile_COMMON><technique><lambert>
              <diffuse><color>0.25 0.5 1 0.8</color></diffuse>
              <emission><color>0.1 0 0.25 1</color></emission>
              <transparent opaque="A_ONE"><color>1 1 1 0.5</color></transparent>
              <transparency><float>0.5</float></transparency>
            </lambert></technique></profile_COMMON>
          </effect>
          <effect id="phong-fx">
            <profile_COMMON>
              <newparam sid="shine"><float>18</float></newparam>
              <technique><phong>
                <diffuse><color>0.5 0.25 0.125 1</color></diffuse>
                <shininess><param ref="shine"/></shininess>
              </phong></technique>
            </profile_COMMON>
          </effect>
          <effect id="blinn-fx">
            <profile_COMMON><technique><blinn>
              <diffuse><color>1 1 1 1</color></diffuse>
              <shininess><float>32</float></shininess>
              <transparent opaque="RGB_ZERO"><color>0.5 0.5 0.5 1</color></transparent>
              <transparency><float>0.5</float></transparency>
            </blinn></technique></profile_COMMON>
          </effect>
        </library_effects>
        <library_materials>
          <material id="lambert" name="Matte"><instance_effect url="#lambert-fx"/></material>
          <material id="phong"><instance_effect url="#phong-fx"/></material>
          <material id="blinn"><instance_effect url="#blinn-fx"/></material>
        </library_materials>
      </COLLADA>
    "##;

const SOURCE_XML_1: &str = r##"
        <c:COLLADA xmlns:c="urn:collada">
          <c:library_images>
            <c:image id="base-image"><c:init_from>base.png</c:init_from></c:image>
            <c:image id="normal-image"><c:init_from>normal.png</c:init_from></c:image>
          </c:library_images>
          <c:library_effects><c:effect id="textured-fx"><c:profile_COMMON>
            <c:newparam sid="base-surface"><c:surface type="2D"><c:init_from>base-image</c:init_from></c:surface></c:newparam>
            <c:newparam sid="base-sampler"><c:sampler2D><c:source>wrong-surface</c:source></c:sampler2D></c:newparam>
            <c:technique><c:newparam sid="normal-surface"><c:surface type="2D"><c:init_from>normal-image</c:init_from></c:surface></c:newparam>
              <c:newparam sid="normal-sampler"><c:sampler2D><c:source>normal-surface</c:source></c:sampler2D></c:newparam>
              <c:lambert>
                <c:diffuse><c:texture texture="base-sampler" texcoord="UVSET0"/></c:diffuse>
                <c:emission><c:texture texture="base-sampler" texcoord="UVSET0"/></c:emission>
              </c:lambert>
              <c:extra><c:technique profile="FCOLLADA"><c:bump><c:texture texture="normal-sampler" texcoord="UVSET0"/></c:bump></c:technique></c:extra>
            </c:technique>
          </c:profile_COMMON></c:effect></c:library_effects>
          <c:library_materials><c:material id="textured"><c:instance_effect url="#textured-fx">
            <c:setparam ref="base-sampler"><c:sampler2D><c:source>base-surface</c:source></c:sampler2D></c:setparam>
          </c:instance_effect></c:material></c:library_materials>
        </c:COLLADA>
      "##;

const SOURCE_XML_2: &str = r##"
      <COLLADA>
        <library_effects>
          <effect id="custom-fx"><profile_GLSL/></effect>
          <effect id="missing-image-fx"><profile_COMMON>
            <newparam sid="surface"><surface type="2D"><init_from>absent-image</init_from></surface></newparam>
            <newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam>
            <technique><lambert><diffuse><texture texture="sampler"/></diffuse></lambert></technique>
          </profile_COMMON></effect>
        </library_effects>
        <library_materials>
          <material id="custom"><instance_effect url="#custom-fx"/></material>
          <material id="missing-effect"><instance_effect url="#absent-effect"/></material>
          <material id="missing-image"><instance_effect url="#missing-image-fx"/></material>
        </library_materials>
      </COLLADA>
    "##;

fn append_fixture(
    xml: &str,
    base_path: Option<&str>,
) -> (
    Vec<Scene3DDocumentMaterial>,
    Vec<ImageResourceReference>,
    Vec<ColladaIndexEntry>,
    Vec<ImportDiagnostic>,
) {
    let root = Arc::new(RwLock::new(parse_xml_document(xml).unwrap()));
    let mut materials = Vec::new();
    let mut resources = Vec::new();
    let mut indices = Vec::new();
    let mut diagnostics = Vec::new();
    append_collada_materials(
        &root,
        &mut materials,
        &mut resources,
        &mut indices,
        base_path,
        Some(&mut diagnostics),
    );
    return (materials, resources, indices, diagnostics);
}

fn inspect_material(
    materials: &[Scene3DDocumentMaterial],
    index: usize,
    inspect: impl FnOnce(&StandardPbrMaterial),
) {
    let Scene3DDocumentMaterial::Entity(entity) = &materials[index] else {
        panic!("canonical material Entity");
    };
    let material = entity.material.read().unwrap();
    inspect(
        material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap(),
    );
}

mod append_collada_materials {
    use super::*;

    #[test]
    fn converts_lambert_phong_and_blinn_factors_to_standard_pbr() {
        let (materials, _, _, diagnostics) = append_fixture(SOURCE_XML_0, None);
        assert!(diagnostics.is_empty());
        assert_eq!(materials.len(), 3);
        inspect_material(&materials, 0, |material| {
            assert_eq!(material.name.as_deref(), Some("Matte"));
            assert_eq!(material.base_color, 0x89bcff33);
            assert_eq!(material.emissive, 0x590089ff);
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Blend
            );
            assert_eq!(material.metallic, 0.0);
            assert_eq!(material.roughness, 1.0);
        });
        inspect_material(&materials, 1, |material| {
            assert_eq!(material.name.as_deref(), Some("phong"));
            // D1 f32 bound (TS: 0.005)
            assert!(
                (material.roughness - get_pbr_roughness_from_phong_shininess(18.0)).abs() < 0.005
            );
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Opaque
            );
        });
        inspect_material(&materials, 2, |material| {
            assert_eq!(material.base_color, 0xffffffbf);
            // D1 f32 bound (TS: 0.005)
            assert!(
                (material.roughness - get_pbr_roughness_from_phong_shininess(32.0)).abs() < 0.005
            );
        });
    }

    #[test]
    fn resolves_profile_parameters_and_image_chains_for_color_and_normal_textures() {
        let (materials, resources, _, _) = append_fixture(SOURCE_XML_1, Some("/models"));
        assert_eq!(resources.len(), 2);
        for (resource, uri, count) in [
            (&resources[0], "base.png", 2),
            (&resources[1], "normal.png", 1),
        ] {
            let ImageResourceReference::External(resource) = resource else {
                panic!("external resource kind");
            };
            let resource = resource.reference.read().unwrap();
            assert_eq!(resource.uri, uri);
            assert_eq!(resource.base_path.as_deref(), Some("/models"));
            assert_eq!(resource.textures.len(), count);
        }
        inspect_material(&materials, 0, |material| {
            let base = material.base_color_map.as_ref().unwrap();
            let emission = material.emissive_map.as_ref().unwrap();
            let normal = material.normal_map.as_ref().unwrap();
            assert_eq!(
                base.read().unwrap().texture_fields().color_space,
                TextureColorSpace::Srgb
            );
            assert_eq!(
                emission.read().unwrap().texture_fields().color_space,
                TextureColorSpace::Srgb
            );
            assert_eq!(
                normal.read().unwrap().texture_fields().color_space,
                TextureColorSpace::Linear
            );
            assert!(!Arc::ptr_eq(base, emission));
        });
    }

    #[test]
    fn reports_unsupported_profiles_and_preserves_fallbacks_for_missing_effects_and_images() {
        let (materials, _, indices, diagnostics) = append_fixture(SOURCE_XML_2, None);
        assert_eq!(materials.len(), 3);
        assert_eq!(
            indices
                .iter()
                .map(|entry| (entry.key.as_str(), entry.value))
                .collect::<Vec<_>>(),
            [("custom", 0), ("missing-effect", 1), ("missing-image", 2)]
        );
        let expected = [
            (
                "collada.unsupported-profile",
                ImportDiagnosticSeverity::Skip,
                vec![("effect", "custom-fx"), ("profile", "profile_GLSL")],
            ),
            (
                "collada.missing-reference",
                ImportDiagnosticSeverity::Recover,
                vec![
                    ("element", "effect"),
                    ("owner", "missing-effect"),
                    ("reference", "absent-effect"),
                ],
            ),
            (
                "collada.missing-reference",
                ImportDiagnosticSeverity::Recover,
                vec![
                    ("element", "image"),
                    ("owner", "missing-image-fx"),
                    ("reference", "absent-image"),
                ],
            ),
        ];
        assert_eq!(diagnostics.len(), expected.len());
        for (actual, (kind, severity, detail)) in diagnostics.iter().zip(expected) {
            assert_eq!(actual.kind, kind);
            assert_eq!(actual.severity, severity);
            assert_eq!(actual.origin, "appendColladaMaterials");
            assert_eq!(
                actual.detail,
                Some(
                    detail
                        .into_iter()
                        .map(|(key, value)| (
                            key.to_string(),
                            ImportDiagnosticDetailValue::String(value.to_string())
                        ))
                        .collect::<HashMap<_, _>>()
                )
            );
        }
    }
}
