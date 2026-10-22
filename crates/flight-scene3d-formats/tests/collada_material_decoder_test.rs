use flight_entity::Ref;
use flight_materials::{Material3D, MaterialAlphaMode, StandardPbrMaterial};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

mod collada_material_decoder {
    use super::*;

    #[test]
    fn exposes_the_original_claims_and_fills_the_original_material_table_before_geometry_binding() {
        let decoder = COLLADA_MATERIAL_DECODER.read().unwrap();
        assert_eq!(decoder.elements, ["material", "effect"]);
        assert_eq!(
            decoder.features,
            [
                "Material",
                "Effect.Blinn",
                "Effect.Lambert",
                "Effect.Phong",
                "Image"
            ]
        );
        assert!(decoder.build.is_none());
        assert!(decoder.build_phase.is_none());
        drop(decoder);
        let saved = Arc::new(RwLock::new(None::<Ref<ColladaParseContext>>));
        let observed = saved.clone();
        let observer = Arc::new(RwLock::new(ColladaElementDecoder {
            elements: Vec::new(),
            features: Vec::new(),
            build: None,
            build_phase: None,
            decode: Arc::new(move |context| {
                *observed.write().unwrap() = Some(context.clone());
            }),
        }));
        let result = parse_collada_with_decoders(
            r##"<COLLADA>
            <library_effects><effect id="fx"><profile_COMMON><technique><lambert><diffuse><color>1 0 0 1</color></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
            <library_materials><material id="mat" name="Red"><instance_effect url="#fx"/></material></library_materials>
            <library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles material="symbol"><input semantic="VERTEX" source="#v"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries>
            <library_visual_scenes><visual_scene id="vs"><node><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="symbol" target="#mat"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
            <scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##,
            &[
                COLLADA_MATERIAL_DECODER.clone(),
                COLLADA_GEOMETRY_DECODER.clone(),
                observer,
            ],
            None,
        );
        assert!(result.diagnostics.read().unwrap().is_empty());
        let context = saved.read().unwrap().as_ref().unwrap().clone();
        let context = context.read().unwrap();
        assert!(Arc::ptr_eq(&context.document, &result.document));
        let indices = context.material_indices.read().unwrap();
        assert_eq!(indices.len(), 1);
        assert_eq!((indices[0].key.as_str(), indices[0].value), ("mat", 0));
        let document = result.document.read().unwrap();
        assert_eq!(document.materials.len(), 1);
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("material Entity");
        };
        let material = material.material.read().unwrap();
        let material = material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap();
        assert_eq!(material.name.as_deref(), Some("Red"));
        assert_eq!(material.base_color, 0xff0000ff);
        assert_eq!(
            material.material3d_fields().alpha_mode,
            MaterialAlphaMode::Opaque
        );
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.nodes[0].mesh, Some(0));
    }
}
