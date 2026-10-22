use crate::md5_material_handler::MD5_MATERIAL_FAMILY;
use crate::md5_skeleton_handler::MD5_SKELETON_FAMILY;
use crate::md5_types::Md5SectionHandler;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static MD5_ALL_SECTION_HANDLERS: LazyLock<Vec<Ref<Md5SectionHandler>>> = LazyLock::new(|| {
    MD5_SKELETON_FAMILY
        .iter()
        .chain(MD5_MATERIAL_FAMILY.iter())
        .cloned()
        .collect()
});
