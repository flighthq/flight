use crate::collada_animation_decoder::COLLADA_ANIMATION_DECODER;
use crate::collada_camera_decoder::COLLADA_CAMERA_DECODER;
use crate::collada_controller_decoder::COLLADA_CONTROLLER_DECODER;
use crate::collada_geometry_decoder::COLLADA_GEOMETRY_DECODER;
use crate::collada_light_decoder::COLLADA_LIGHT_DECODER;
use crate::collada_material_decoder::COLLADA_MATERIAL_DECODER;
use crate::collada_types::ColladaElementDecoder;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static COLLADA_ALL_ELEMENT_DECODERS: LazyLock<Vec<Ref<ColladaElementDecoder>>> =
    LazyLock::new(|| {
        vec![
            COLLADA_MATERIAL_DECODER.clone(),
            COLLADA_CAMERA_DECODER.clone(),
            COLLADA_GEOMETRY_DECODER.clone(),
            COLLADA_CONTROLLER_DECODER.clone(),
            COLLADA_ANIMATION_DECODER.clone(),
            COLLADA_LIGHT_DECODER.clone(),
        ]
    });
