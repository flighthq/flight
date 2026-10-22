use crate::collada_scene_shared::ColladaIndexEntry;
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::Scene3DDocument;
use flight_xml::XmlElement;
use std::sync::Arc;

pub struct ColladaBuildContext {
    pub deferred_cameras: Vec<ColladaDeferredCameraBinding>,
    pub deferred_controllers: Vec<ColladaDeferredControllerBinding>,
    pub deferred_lights: Vec<ColladaDeferredLightBinding>,
    pub node_id_map: Vec<ColladaIndexEntry>,
    pub parse: Ref<ColladaParseContext>,
    pub root_node_indices: Vec<i32>,
}

pub enum ColladaCameraDefinition {
    Orthographic(ColladaOrthographicCameraDefinition),
    Perspective(ColladaPerspectiveCameraDefinition),
}

pub struct ColladaCameraEntry {
    pub key: String,
    pub value: Option<Ref<ColladaCameraDefinition>>,
}

pub struct ColladaDecodedAnimationChannel {
    pub target: String,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
    pub interpolation: Vec<String>,
    pub in_tangents: Vec<f32>,
    pub out_tangents: Vec<f32>,
}

pub struct ColladaDecodedMorph {
    pub controller_id: String,
    pub base_geometry: String,
    pub method: ColladaMorphMethod,
    pub targets: Vec<String>,
    pub weights: Vec<f32>,
}

pub struct ColladaDecodedSkin {
    pub bind_shape_matrix: Vec<f32>,
    pub controller_id: String,
    pub geometry_ref: String,
    pub influences: Vec<Vec<ColladaSkinInfluence>>,
    pub inverse_bind_matrices: Vec<Vec<f32>>,
    pub joint_names: Vec<String>,
    pub joint_sids: Vec<String>,
}

pub struct ColladaDeferredCameraBinding {
    pub camera_id: String,
    pub node_index: i32,
}

pub struct ColladaDeferredControllerBinding {
    pub controller_id: String,
    pub material_overrides: Vec<ColladaIndexEntry>,
    pub node_index: i32,
    pub skeleton_root: Option<String>,
}

pub struct ColladaDeferredLightBinding {
    pub node_index: i32,
    pub url: String,
}

pub struct ColladaElementDecoder {
    pub build: Option<Arc<dyn Fn(&Ref<ColladaBuildContext>) + Send + Sync>>,
    pub build_phase: Option<f32>,
    pub elements: Vec<String>,
    pub features: Vec<String>,
    pub decode: Arc<dyn Fn(&Ref<ColladaParseContext>) + Send + Sync>,
}

pub struct ColladaFloatArrayEntry {
    pub key: String,
    pub value: Ref<Vec<f32>>,
}

pub struct ColladaImportOptions {
    pub base_url: Option<String>,
    pub decoders: Option<Vec<Ref<ColladaElementDecoder>>>,
}

pub struct ColladaLightDefinition {
    pub color: u32,
    pub decay: f32,
    pub inner_cone_degrees: f32,
    pub intensity: f32,
    pub kind: ColladaLightKind,
    pub name: Option<String>,
    pub outer_cone_degrees: f32,
    pub spot_blend: f32,
}

pub struct ColladaLightEntry {
    pub key: String,
    pub value: Option<Ref<ColladaLightDefinition>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColladaLightKind {
    Ambient,
    Directional,
    Point,
    Spot,
}

pub struct ColladaMorphEntry {
    pub key: String,
    pub value: Ref<ColladaDecodedMorph>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColladaMorphMethod {
    Relative,
    Normalized,
}

pub struct ColladaOrthographicCameraDefinition {
    pub far: f32,
    pub half_height: f32,
    pub half_width: f32,
    pub name: Option<String>,
    pub near: f32,
}

pub struct ColladaParseContext {
    pub animation_channels: Ref<Vec<Ref<ColladaDecodedAnimationChannel>>>,
    pub base_url: Option<String>,
    pub camera_definitions: Ref<Vec<ColladaCameraEntry>>,
    pub diagnostics: Ref<Vec<ImportDiagnostic>>,
    pub document: Ref<Scene3DDocument>,
    pub geometry_id_to_mesh_index: Ref<Vec<ColladaIndexEntry>>,
    pub geometry_positions: Ref<Vec<ColladaFloatArrayEntry>>,
    pub geometry_primitive_symbols: Ref<Vec<ColladaStringArrayEntry>>,
    pub light_definitions: Ref<Vec<ColladaLightEntry>>,
    pub material_indices: Ref<Vec<ColladaIndexEntry>>,
    pub morphs: Ref<Vec<ColladaMorphEntry>>,
    pub root: Ref<XmlElement>,
    pub skins: Ref<Vec<ColladaSkinEntry>>,
}

pub struct ColladaParseResult {
    pub document: Ref<Scene3DDocument>,
    pub diagnostics: Ref<Vec<ImportDiagnostic>>,
    pub up_axis: ColladaUpAxis,
    pub root_transform: Arc<Vec<f32>>,
}

pub struct ColladaPerspectiveCameraDefinition {
    pub aspect: f32,
    pub far: f32,
    pub fov_y: f32,
    pub name: Option<String>,
    pub near: f32,
}

pub struct ColladaSkinEntry {
    pub key: String,
    pub value: Ref<ColladaDecodedSkin>,
}

pub struct ColladaSkinInfluence {
    pub joint: String,
    pub weight: f32,
}

pub struct ColladaStringArrayEntry {
    pub key: String,
    pub value: Ref<Vec<String>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColladaUpAxis {
    XUp,
    YUp,
    ZUp,
}

impl ColladaImportOptions {
    pub fn parse_with_decoders(
        &self,
        xml: &str,
        decoders: &[Ref<ColladaElementDecoder>],
    ) -> ColladaParseResult {
        return crate::collada_parse::parse_collada_with_decoders(xml, decoders, Some(self));
    }
}
