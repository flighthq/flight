use crate::md2_animation_handler::MD2_ANIMATION_FAMILY;
use crate::md2_skin_handler::MD2_SKIN_FAMILY;
use crate::md2_types::Md2SectionHandler;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static MD2_ALL_SECTION_HANDLERS: LazyLock<Vec<Ref<Md2SectionHandler>>> = LazyLock::new(|| {
    MD2_SKIN_FAMILY
        .iter()
        .chain(MD2_ANIMATION_FAMILY.iter())
        .cloned()
        .collect()
});
