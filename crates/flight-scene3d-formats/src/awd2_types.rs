use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::{EntityRuntimeSlot, Float64Array, Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;
use flight_meshgeometry::MeshGeometry;
use flight_scene3d::Scene3DDocument;
use std::sync::{Arc, RwLock};

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2Header {
    pub body_length: u32,
    pub compression: u8,
    pub flags: u16,
    pub version_major: u8,
    pub version_minor: u8,
}

/// Native DataView projection: source and view borrow the same byte window.
pub struct Awd2RehydratedBody {
    pub source: Ref<Box<Uint8Array>>,
    pub view: Ref<Box<Uint8Array>>,
}

pub struct Awd2Block {
    pub block_id: u32,
    pub block_type: u8,
    pub data_end: usize,
    pub data_start: usize,
    pub geometry_wide: bool,
    pub matrix_wide: bool,
    pub source: Ref<Box<Uint8Array>>,
    pub view: Ref<Box<Uint8Array>>,
}

pub type Awd2BlockDispatch = Vec<Awd2BlockDispatchEntry>;

pub struct Awd2BlockDispatchEntry {
    pub block_type: u8,
    pub handler: Ref<Awd2BlockHandler>,
}

pub struct Awd2BlockHandler {
    pub block_types: Vec<u8>,
    pub build_phase: Option<f32>,
    pub deferred: Option<bool>,
    pub parse: Arc<dyn Fn(&mut Awd2ParseState, &Awd2Block) + Send + Sync>,
    pub build: Option<Arc<dyn Fn(&mut Awd2ParseState) + Send + Sync>>,
}

pub struct Awd2ParseOptions {
    pub blocks: Vec<Ref<Awd2BlockHandler>>,
    pub deflate: Option<Option<Arc<HostDecompressDeflateCapability>>>,
    pub lzma: Option<Option<Arc<HostDecompressLzmaCapability>>>,
}

/// Native named projection of Partial<Awd2ParseOptions>; missing and explicit-null capabilities remain distinct.
pub struct Awd2ParseOptionsFragment {
    pub blocks: Option<Vec<Ref<Awd2BlockHandler>>>,
    pub deflate: Option<Option<Arc<HostDecompressDeflateCapability>>>,
    pub lzma: Option<Option<Arc<HostDecompressLzmaCapability>>>,
}

pub struct Awd2ParseState {
    pub cameras: Vec<Awd2CameraEntry>,
    pub containers: Vec<Awd2ContainerEntry>,
    pub diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
    pub document: Ref<Scene3DDocument>,
    pub geometries: Vec<Awd2GeometryEntry>,
    pub light_pickers: Vec<Awd2LightPickerEntry>,
    pub lights: Vec<Awd2LightEntry>,
    pub materials: Ref<Vec<Awd2MaterialEntry>>,
    pub mesh_instances: Vec<Awd2MeshInstanceEntry>,
    pub node_index_for_block: Vec<Awd2NodeIndexEntry>,
    pub resolve_material: Option<Arc<dyn Fn(u32) -> i32 + Send + Sync>>,
    pub skeleton_animations: Vec<Awd2SkeletonAnimationEntry>,
    pub skeleton_joint_node_indices: Vec<i32>,
    pub skeleton_poses: Vec<Awd2SkeletonPoseEntry>,
    pub skeletons: Vec<Awd2SkeletonEntry>,
    pub skin_index: Option<i32>,
    pub source: Ref<Box<Uint8Array>>,
    pub textures: Ref<Vec<Awd2TextureEntry>>,
    pub view: Ref<Box<Uint8Array>>,
    runtime: EntityRuntimeSlot,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedCamera {
    pub bottom: f32,
    pub fov: f32,
    pub left: f32,
    pub name: String,
    pub parent_id: u32,
    pub projection_type: i16,
    pub right: f32,
    pub top: f32,
    pub transform: Box<Float64Array>,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedContainer {
    pub name: String,
    pub parent_id: u32,
    pub transform: Box<Float64Array>,
}

pub struct Awd2ParsedGeometry {
    pub geometry: Ref<MeshGeometry>,
    pub skinned: bool,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedJoint {
    pub name: String,
    pub parent_index: u16,
    pub transform: Box<Float64Array>,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedLight {
    pub ambient: f32,
    pub ambient_rgb: u32,
    pub casts_shadow: bool,
    pub diffuse: f32,
    pub direction_x: f32,
    pub direction_y: f32,
    pub direction_z: f32,
    pub fall_off: f32,
    pub has_radius: bool,
    pub light_type: u8,
    pub name: String,
    pub parent_id: u32,
    pub radius: f32,
    pub rgb: u32,
    pub specular: f32,
    pub transform: Box<Float64Array>,
}

pub struct Awd2ParsedLightPicker {
    pub light_ids: Vec<u32>,
    pub name: String,
}

pub struct Awd2ParsedMaterial {
    pub alpha: Option<f32>,
    pub color: Option<u32>,
    pub diffuse_texture_id: u32,
    pub gloss: Option<f32>,
    pub name: String,
    pub normal_texture_id: u32,
    pub num_methods: u8,
    pub specular_color: Option<u32>,
    pub specular_strength: Option<f32>,
    pub specular_texture_id: u32,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedMeshInstance {
    pub geometry_id: u32,
    pub material_ids: Vec<u32>,
    pub name: String,
    pub parent_id: u32,
    pub transform: Box<Float64Array>,
}

pub struct Awd2ParsedSkeleton {
    pub joints: Vec<Awd2ParsedJoint>,
    pub name: String,
}

pub struct Awd2ParsedSkeletonAnimation {
    pub name: String,
    pub poses: Vec<Awd2SkeletonAnimationPose>,
}

pub struct Awd2SkeletonAnimationPose {
    pub duration: f32,
    pub pose_block_id: u32,
}

// flight-lint: allow(f64) Source AWD2 parsed transform fields explicitly use Float64Array, including nullable pose transforms
pub struct Awd2ParsedSkeletonPose {
    pub joint_transforms: Vec<Option<Box<Float64Array>>>,
    pub name: String,
}

pub struct Awd2ParsedTexture {
    pub bytes: Option<Ref<Box<Uint8Array>>>,
    pub mime_type: Option<String>,
    pub name: String,
    pub url: Option<String>,
}

pub struct Awd2CameraEntry {
    pub key: u32,
    pub value: Awd2ParsedCamera,
}

pub struct Awd2ContainerEntry {
    pub key: u32,
    pub value: Awd2ParsedContainer,
}

pub struct Awd2GeometryEntry {
    pub key: u32,
    pub value: Vec<Awd2ParsedGeometry>,
}

pub struct Awd2LightEntry {
    pub key: u32,
    pub value: Awd2ParsedLight,
}

pub struct Awd2LightPickerEntry {
    pub key: u32,
    pub value: Awd2ParsedLightPicker,
}

pub struct Awd2MaterialEntry {
    pub key: u32,
    pub value: Awd2ParsedMaterial,
}

pub struct Awd2MeshInstanceEntry {
    pub key: u32,
    pub value: Awd2ParsedMeshInstance,
}

pub struct Awd2NodeIndexEntry {
    pub key: u32,
    pub value: i32,
}

pub struct Awd2SkeletonEntry {
    pub key: u32,
    pub value: Awd2ParsedSkeleton,
}

pub struct Awd2SkeletonAnimationEntry {
    pub key: u32,
    pub value: Awd2ParsedSkeletonAnimation,
}

pub struct Awd2SkeletonPoseEntry {
    pub key: u32,
    pub value: Awd2ParsedSkeletonPose,
}

pub struct Awd2TextureEntry {
    pub key: u32,
    pub value: Awd2ParsedTexture,
}

flight_entity::impl_entity!(Awd2ParseState);

impl Default for Awd2ParseState {
    fn default() -> Self {
        let bytes = Arc::new(RwLock::new(Vec::new().into_boxed_slice()));
        return Self {
            cameras: Vec::new(),
            containers: Vec::new(),
            diagnostics: None,
            document: Arc::new(RwLock::new(crate::awd2_parse::empty_awd_document())),
            geometries: Vec::new(),
            light_pickers: Vec::new(),
            lights: Vec::new(),
            materials: Arc::new(RwLock::new(Vec::new())),
            mesh_instances: Vec::new(),
            node_index_for_block: Vec::new(),
            resolve_material: None,
            skeleton_animations: Vec::new(),
            skeleton_joint_node_indices: Vec::new(),
            skeleton_poses: Vec::new(),
            skeletons: Vec::new(),
            skin_index: None,
            source: bytes.clone(),
            textures: Arc::new(RwLock::new(Vec::new())),
            view: bytes,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}
