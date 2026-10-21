use crate::{Scene3DAnimationPath, Scene3DMetadata};
use flight_animation::AnimationTrack;
use flight_camera::Projection;
use flight_entity::{Kind, Ref};
use flight_geometry::{Matrix4, Transform3D};
use flight_image::ImageResourceReference;
use flight_lighting::LightRef;
use flight_materials::Material3D;
use flight_meshgeometry::{MeshGeometry, MeshMorph};

pub struct Scene3DDocument {
    pub animations: Vec<Scene3DDocumentAnimation>,
    pub cameras: Vec<Scene3DDocumentCamera>,
    pub lights: Vec<Scene3DDocumentLight>,
    pub materials: Vec<Scene3DDocumentMaterial>,
    pub meshes: Vec<Scene3DDocumentMesh>,
    pub metadata: Option<Ref<Scene3DMetadata>>,
    pub nodes: Vec<Scene3DDocumentNode>,
    pub resources: Vec<ImageResourceReference>,
    pub scenes: Vec<Scene3DDocumentScene>,
    pub skins: Vec<Scene3DDocumentSkin>,
}
pub struct Scene3DDocumentAnimation {
    pub channels: Vec<Scene3DDocumentAnimationChannel>,
    pub duration: f32,
    pub name: Option<String>,
}
pub struct Scene3DDocumentAnimationChannel {
    pub node: i32,
    pub path: Scene3DAnimationPath,
    pub track: Ref<AnimationTrack>,
}
pub struct Scene3DDocumentCamera {
    pub far: f32,
    pub name: Option<String>,
    pub near: f32,
    pub node: Option<i32>,
    pub projection: Projection,
    pub transform: Transform3D,
}
pub struct Scene3DDocumentLight {
    pub descriptor: LightRef,
    pub name: Option<String>,
    pub node: Option<i32>,
    pub transform: Transform3D,
}
pub enum Scene3DDocumentMaterial {
    Entity(Scene3DDocumentMaterialEntity),
    Fields(Scene3DDocumentMaterialFields),
}
// flight-lint: allow(contract-vocabulary) D16 open Material3D family retains original heterogeneous EntityRefs through native structural dispatch
pub struct Scene3DDocumentMaterialEntity {
    pub material: Ref<dyn Material3D>,
}
pub struct Scene3DDocumentMaterialFields {
    pub kind: Kind,
    pub name: Option<String>,
}
pub struct Scene3DDocumentMesh {
    pub geometry: Ref<MeshGeometry>,
    pub materials: Vec<i32>,
    pub morph: Option<Ref<MeshMorph>>,
    pub name: Option<String>,
    pub skin: Option<i32>,
}
pub struct Scene3DDocumentNode {
    pub children: Vec<i32>,
    pub kind: Kind,
    pub mesh: Option<i32>,
    pub name: Option<String>,
    pub transform: Transform3D,
}
pub struct Scene3DDocumentScene {
    pub name: Option<String>,
    pub root_nodes: Vec<i32>,
}
pub struct Scene3DDocumentSkin {
    pub inverse_bind: Vec<Matrix4>,
    pub joints: Vec<i32>,
}
