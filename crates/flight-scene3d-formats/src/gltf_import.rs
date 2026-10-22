use crate::gltf_parse::{
    create_scene3d_from_glb_with_core_feature_handlers,
    create_scene3d_from_gltf_with_core_feature_handlers, parse_glb_with_core_feature_handlers,
    parse_gltf_with_core_feature_handlers,
};
use crate::gltf_source::GltfSource;
use crate::gltf_types::{GltfCoreFeatureHandler, GltfImportOptions};
use crate::register_gltf_animation_handlers::register_gltf_animation_handlers;
use crate::register_gltf_camera_handlers::register_gltf_camera_handlers;
use crate::register_gltf_skin_handlers::register_gltf_skin_handlers;
use flight_buffer::ArrayBufferView;
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::{Scene3D, Scene3DDocument, create_scene3ds_from_document};

pub fn create_scene3d_from_glb(
    bytes: &ArrayBufferView,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Scene3D {
    return create_scene3d_from_glb_with_core_feature_handlers(
        bytes,
        &full_gltf_core_feature_handlers(),
        diagnostics,
        options,
    );
}

pub fn create_scene3d_from_gltf(
    source: &GltfSource<'_>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Scene3D {
    return create_scene3d_from_gltf_with_core_feature_handlers(
        source,
        &full_gltf_core_feature_handlers(),
        diagnostics,
        options,
    );
}

pub fn create_scene3ds_from_glb(
    bytes: &ArrayBufferView,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Vec<Scene3D> {
    let document = parse_glb(bytes, diagnostics, options);
    return create_scene3ds_from_document(&document.read().unwrap());
}

pub fn create_scene3ds_from_gltf(
    source: &GltfSource<'_>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Vec<Scene3D> {
    let document = parse_gltf(source, diagnostics, options);
    return create_scene3ds_from_document(&document.read().unwrap());
}

fn full_gltf_core_feature_handlers() -> Vec<Ref<GltfCoreFeatureHandler>> {
    let mut handlers = Vec::new();
    register_gltf_animation_handlers(&mut handlers);
    register_gltf_camera_handlers(&mut handlers);
    register_gltf_skin_handlers(&mut handlers);
    return handlers;
}

pub fn parse_glb(
    bytes: &ArrayBufferView,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Ref<Scene3DDocument> {
    return parse_glb_with_core_feature_handlers(
        bytes,
        &full_gltf_core_feature_handlers(),
        diagnostics,
        options,
    );
}

pub fn parse_gltf(
    source: &GltfSource<'_>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Ref<Scene3DDocument> {
    return parse_gltf_with_core_feature_handlers(
        source,
        &full_gltf_core_feature_handlers(),
        diagnostics,
        options,
    );
}
