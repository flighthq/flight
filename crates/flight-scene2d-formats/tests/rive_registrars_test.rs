use std::collections::HashSet;

use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d_formats::contract::*;

mod apply_rive_import_options {
    use super::*;

    #[test]
    fn applies_a_kernel_dependent_registrar_with_the_kernel_it_was_given() {
        let options = RiveImportOptions {
            path_boolean_registrars: Some(RIVE_ALL_PATH_BOOLEAN_REGISTRARS.to_vec()),
            registrars: None,
        };
        let mut registry = create_rive_import_registry();
        apply_rive_import_options(&options, &MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        assert!(!registry.handlers.is_empty());
    }

    #[test]
    fn installs_nothing_for_empty_options() {
        let options = RiveImportOptions {
            path_boolean_registrars: None,
            registrars: None,
        };
        let mut registry = create_rive_import_registry();
        apply_rive_import_options(&options, &MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        assert!(registry.handlers.is_empty());
    }

    #[test]
    fn installs_only_the_families_named() {
        let options = RiveImportOptions {
            path_boolean_registrars: None,
            registrars: Some(vec![register_rive_text_handlers]),
        };
        let mut registry = create_rive_import_registry();
        apply_rive_import_options(&options, &MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        assert_eq!(keys(&registry), text_keys());
    }

    #[test]
    fn runs_the_clipping_artboard_pass_first() {
        let preset = create_rive_import_registry_from_options(
            &RIVE_FULL_IMPORT_OPTIONS,
            &MARTINEZ_PATH_BOOLEAN_KERNEL,
        );
        let mut shipped = create_rive_import_registry();
        register_all_rive_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut shipped);
        let preset_passes = artboard_passes(&preset);
        let shipped_passes = artboard_passes(&shipped);
        assert!(preset_passes.len() > 1);
        assert_eq!(preset_passes[0], shipped_passes[0]);
    }
}

mod create_rive_import_registry_from_options {
    use super::*;

    #[test]
    fn builds_a_registry_carrying_exactly_the_named_families() {
        let options = RiveImportOptions {
            path_boolean_registrars: None,
            registrars: Some(vec![register_rive_text_handlers]),
        };
        let registry =
            create_rive_import_registry_from_options(&options, &MARTINEZ_PATH_BOOLEAN_KERNEL);
        assert_eq!(keys(&registry), text_keys());
    }

    #[test]
    fn returns_an_empty_registry_for_empty_options() {
        let options = RiveImportOptions {
            path_boolean_registrars: None,
            registrars: None,
        };
        let registry =
            create_rive_import_registry_from_options(&options, &MARTINEZ_PATH_BOOLEAN_KERNEL);
        assert!(registry.handlers.is_empty());
    }
}

mod rive_all_path_boolean_registrars {
    use super::*;

    #[test]
    fn holds_the_registrars_that_need_a_kernel_and_no_others() {
        assert!(!RIVE_ALL_PATH_BOOLEAN_REGISTRARS.is_empty());
        for registrar in RIVE_ALL_PATH_BOOLEAN_REGISTRARS {
            let mut registry = create_rive_import_registry();
            registrar(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
            assert!(!registry.handlers.is_empty());
        }
    }
}

mod rive_all_registrars {
    use super::*;

    #[test]
    fn claims_each_core_type_once() {
        let mut owners = HashSet::new();
        for registrar in RIVE_ALL_REGISTRARS {
            let mut registry = create_rive_import_registry();
            registrar(&mut registry);
            for entry in registry.handlers {
                assert!(owners.insert(entry.type_key), "core type claimed twice");
            }
        }
    }

    #[test]
    fn holds_registrars_that_need_only_the_registry() {
        for registrar in RIVE_ALL_REGISTRARS {
            let mut registry = create_rive_import_registry();
            registrar(&mut registry);
            assert!(!registry.handlers.is_empty());
        }
    }
}

mod rive_full_import_options {
    use super::*;

    #[test]
    fn leaves_a_fresh_registry_empty() {
        assert!(create_rive_import_registry().handlers.is_empty());
    }

    #[test]
    fn reproduces_what_register_all_rive_handlers_installs() {
        let preset = create_rive_import_registry_from_options(
            &RIVE_FULL_IMPORT_OPTIONS,
            &MARTINEZ_PATH_BOOLEAN_KERNEL,
        );
        let mut shipped = create_rive_import_registry();
        register_all_rive_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut shipped);
        assert_eq!(keys(&preset), keys(&shipped));
        assert_eq!(artboard_passes(&preset), artboard_passes(&shipped));
        assert_eq!(document_passes(&preset), document_passes(&shipped));
    }

    #[test]
    fn stores_two_lists_of_function_references() {
        assert_eq!(
            RIVE_FULL_IMPORT_OPTIONS
                .path_boolean_registrars
                .as_ref()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            RIVE_FULL_IMPORT_OPTIONS.registrars.as_ref().unwrap().len(),
            11
        );
    }
}

fn artboard_passes(registry: &RiveImportRegistry) -> Vec<i32> {
    return registry
        .handlers
        .iter()
        .filter(|entry| entry.handle.apply_artboard.is_some())
        .map(|entry| entry.type_key)
        .collect();
}

fn document_passes(registry: &RiveImportRegistry) -> Vec<i32> {
    return registry
        .handlers
        .iter()
        .filter(|entry| entry.handle.apply_document.is_some())
        .map(|entry| entry.type_key)
        .collect();
}

fn keys(registry: &RiveImportRegistry) -> Vec<i32> {
    let mut keys = registry
        .handlers
        .iter()
        .map(|entry| entry.type_key)
        .collect::<Vec<_>>();
    keys.sort_unstable();
    return keys;
}

fn text_keys() -> Vec<i32> {
    let mut registry = create_rive_import_registry();
    register_rive_text_handlers(&mut registry);
    return keys(&registry);
}
