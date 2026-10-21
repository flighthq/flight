use flight_path_boolean::PathBooleanKernel;

use crate::rive_animation::register_rive_animation_handlers;
use crate::rive_assets::register_rive_asset_handlers;
use crate::rive_clipping::register_rive_clipping_handlers;
use crate::rive_draw_order::register_rive_draw_order_handlers;
use crate::rive_layout::register_rive_layout_handlers;
use crate::rive_shape_node::register_rive_shape_handlers;
use crate::rive_shape_paint::register_rive_paint_handlers;
use crate::rive_shape_path::register_rive_path_handlers;
use crate::rive_skeleton::register_rive_skeleton_handlers;
use crate::rive_solo::register_rive_solo_handlers;
use crate::rive_state_machine::register_rive_state_machine_handlers;
use crate::rive_text::register_rive_text_handlers;
use crate::types::RiveImportRegistry;

pub fn register_all_rive_handlers(
    path_boolean_kernel: &PathBooleanKernel,
    registry: &mut RiveImportRegistry,
) {
    register_rive_path_handlers(registry);
    register_rive_paint_handlers(registry);
    register_rive_text_handlers(registry);
    register_rive_asset_handlers(registry);
    register_rive_clipping_handlers(path_boolean_kernel, registry);
    register_rive_draw_order_handlers(registry);
    register_rive_solo_handlers(registry);
    register_rive_shape_handlers(registry);
    register_rive_skeleton_handlers(registry);
    register_rive_layout_handlers(registry);
    register_rive_state_machine_handlers(registry);
    register_rive_animation_handlers(registry);
}
