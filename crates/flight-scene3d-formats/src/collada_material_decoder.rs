use crate::collada_material::append_collada_materials;
use crate::collada_types::*;
use flight_entity::Ref;
use std::sync::{Arc, LazyLock, RwLock};

pub static COLLADA_MATERIAL_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: None,
        build_phase: None,
        elements: vec!["material".to_string(), "effect".to_string()],
        features: vec![
            "Material",
            "Effect.Blinn",
            "Effect.Lambert",
            "Effect.Phong",
            "Image",
        ]
        .into_iter()
        .map(str::to_string)
        .collect(),
        decode: Arc::new(|context| {
            let (root, document, materials, diagnostics, base_url) = {
                let context = context.read().unwrap();
                (
                    context.root.clone(),
                    context.document.clone(),
                    context.material_indices.clone(),
                    context.diagnostics.clone(),
                    context.base_url.clone(),
                )
            };
            let mut document = document.write().unwrap();
            let flight_scene3d::Scene3DDocument {
                materials: output,
                resources,
                ..
            } = &mut *document;
            append_collada_materials(
                &root,
                output,
                resources,
                &mut materials.write().unwrap(),
                base_url.as_deref(),
                Some(&mut diagnostics.write().unwrap()),
            );
        }),
    }))
});
