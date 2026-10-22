use crate::three_ds_camera_handler::THREE_DS_CAMERA_FAMILY;
use crate::three_ds_keyframe_handler::THREE_DS_KEYFRAME_FAMILY;
use crate::three_ds_light_handler::THREE_DS_LIGHT_FAMILY;
use crate::three_ds_material_handler::THREE_DS_MATERIAL_FAMILY;
use crate::three_ds_mesh_handler::THREE_DS_MESH_FAMILY;
use crate::three_ds_types::ThreeDsChunkHandler;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static THREE_DS_ALL_CHUNK_HANDLERS: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| {
        let mut handlers = Vec::new();
        handlers.extend(THREE_DS_CAMERA_FAMILY.iter().cloned());
        handlers.extend(THREE_DS_KEYFRAME_FAMILY.iter().cloned());
        handlers.extend(THREE_DS_LIGHT_FAMILY.iter().cloned());
        handlers.extend(THREE_DS_MATERIAL_FAMILY.iter().cloned());
        handlers.extend(THREE_DS_MESH_FAMILY.iter().cloned());
        return handlers;
    });
