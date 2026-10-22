use crate::awd2_camera_handler::AWD2_CAMERA_HANDLER;
use crate::awd2_geometry_handler::AWD2_TRIANGLE_GEOMETRY_HANDLER;
use crate::awd2_lighting_handler::{AWD2_LIGHT_HANDLER, AWD2_LIGHT_PICKER_HANDLER};
use crate::awd2_material_handler::{AWD2_MATERIAL_HANDLER, AWD2_TEXTURE_HANDLER};
use crate::awd2_scene_structure_handler::{AWD2_CONTAINER_HANDLER, AWD2_MESH_INSTANCE_HANDLER};
use crate::awd2_skeleton_handler::{
    AWD2_SKELETON_ANIMATION_HANDLER, AWD2_SKELETON_BLOCK_HANDLER, AWD2_SKELETON_POSE_HANDLER,
};
use crate::awd2_types::Awd2BlockHandler;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static AWD2_ALL_BLOCK_HANDLERS: LazyLock<Vec<Ref<Awd2BlockHandler>>> = LazyLock::new(|| {
    AWD2_MATERIALS_FAMILY
        .iter()
        .chain(AWD2_SKELETON_FAMILY.iter())
        .chain(AWD2_GEOMETRY_FAMILY.iter())
        .chain(AWD2_SCENE_STRUCTURE_FAMILY.iter())
        .chain(AWD2_LIGHTING_FAMILY.iter())
        .chain(AWD2_CAMERA_FAMILY.iter())
        .cloned()
        .collect()
});

pub static AWD2_CAMERA_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> =
    LazyLock::new(|| vec![AWD2_CAMERA_HANDLER.clone()]);
pub static AWD2_GEOMETRY_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> =
    LazyLock::new(|| vec![AWD2_TRIANGLE_GEOMETRY_HANDLER.clone()]);
pub static AWD2_LIGHTING_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> = LazyLock::new(|| {
    vec![
        AWD2_LIGHT_HANDLER.clone(),
        AWD2_LIGHT_PICKER_HANDLER.clone(),
    ]
});
pub static AWD2_MATERIALS_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> =
    LazyLock::new(|| vec![AWD2_MATERIAL_HANDLER.clone(), AWD2_TEXTURE_HANDLER.clone()]);
pub static AWD2_SCENE_STRUCTURE_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> =
    LazyLock::new(|| {
        vec![
            AWD2_CONTAINER_HANDLER.clone(),
            AWD2_MESH_INSTANCE_HANDLER.clone(),
        ]
    });
pub static AWD2_SKELETON_FAMILY: LazyLock<Vec<Ref<Awd2BlockHandler>>> = LazyLock::new(|| {
    vec![
        AWD2_SKELETON_BLOCK_HANDLER.clone(),
        AWD2_SKELETON_POSE_HANDLER.clone(),
        AWD2_SKELETON_ANIMATION_HANDLER.clone(),
    ]
});
