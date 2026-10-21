use std::sync::LazyLock;

use flight_path_boolean::PathBooleanKernel;

use crate::rive_animation::register_rive_animation_handlers;
use crate::rive_assets::register_rive_asset_handlers;
use crate::rive_clipping::register_rive_clipping_handlers;
use crate::rive_draw_order::register_rive_draw_order_handlers;
use crate::rive_import_registry::create_rive_import_registry;
use crate::rive_layout::register_rive_layout_handlers;
use crate::rive_shape_node::register_rive_shape_handlers;
use crate::rive_shape_paint::register_rive_paint_handlers;
use crate::rive_shape_path::register_rive_path_handlers;
use crate::rive_skeleton::register_rive_skeleton_handlers;
use crate::rive_solo::register_rive_solo_handlers;
use crate::rive_state_machine::register_rive_state_machine_handlers;
use crate::rive_text::register_rive_text_handlers;
use crate::types::*;

pub static RIVE_ALL_PATH_BOOLEAN_REGISTRARS: [RivePathBooleanRegistrar; 1] =
    [register_rive_clipping_handlers];

pub static RIVE_ALL_REGISTRARS: [RiveRegistrar; 11] = [
    register_rive_path_handlers,
    register_rive_paint_handlers,
    register_rive_text_handlers,
    register_rive_asset_handlers,
    register_rive_draw_order_handlers,
    register_rive_solo_handlers,
    register_rive_shape_handlers,
    register_rive_skeleton_handlers,
    register_rive_layout_handlers,
    register_rive_state_machine_handlers,
    register_rive_animation_handlers,
];

pub static RIVE_FULL_IMPORT_OPTIONS: LazyLock<RiveImportOptions> = LazyLock::new(|| {
    return RiveImportOptions {
        path_boolean_registrars: Some(RIVE_ALL_PATH_BOOLEAN_REGISTRARS.to_vec()),
        registrars: Some(RIVE_ALL_REGISTRARS.to_vec()),
    };
});

pub fn create_rive_import_registry_from_options(
    options: &RiveImportOptions,
    path_boolean_kernel: &PathBooleanKernel,
) -> RiveImportRegistry {
    let mut registry = create_rive_import_registry();
    apply_rive_import_options(options, path_boolean_kernel, &mut registry);
    return registry;
}

pub fn apply_rive_import_options(
    options: &RiveImportOptions,
    path_boolean_kernel: &PathBooleanKernel,
    registry: &mut RiveImportRegistry,
) {
    for registrar in options.path_boolean_registrars.as_deref().unwrap_or(&[]) {
        registrar(path_boolean_kernel, registry);
    }
    for registrar in options.registrars.as_deref().unwrap_or(&[]) {
        registrar(registry);
    }
}
