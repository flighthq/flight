use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex, RwLock, Weak};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_menu::contract::*;
use flight_signals::connect_signal;

use crate::block_on;

fn empty_template() -> MenuItemTemplate {
    return MenuItemTemplate {
        id: None,
        label: None,
        type_: None,
        role: None,
        accelerator: None,
        enabled: None,
        checked: None,
        visible: None,
        sublabel: None,
        tool_tip: None,
        submenu: None,
    };
}

fn item(id: &str, label: &str) -> MenuItemTemplate {
    return MenuItemTemplate {
        id: Some(id.to_string()),
        label: Some(label.to_string()),
        ..empty_template()
    };
}

fn node(template: MenuItemTemplate) -> Ref<MenuItemTemplate> {
    return Arc::new(RwLock::new(template));
}

fn released_state() -> AppMenuDestroyedProviders {
    return AppMenuDestroyedProviders {
        released: Vec::new(),
    };
}

fn signals_state() -> MenuSignalsState {
    return MenuSignalsState { signals: None };
}

mod clone_menu_template {
    use super::*;

    #[test]
    fn produces_an_equal_but_distinct_tree() {
        let original = create_menu_item_template(Some(&node(MenuItemTemplate {
            id: Some("file".to_string()),
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![node(MenuItemTemplate {
                id: Some("open".to_string()),
                label: Some("Open".to_string()),
                type_: Some(MenuItemType::Submenu),
                submenu: Some(vec![node(item("nested", "Nested"))]),
                ..empty_template()
            })]),
            ..empty_template()
        })));
        let clone = clone_menu_template(&original);
        assert!(!Arc::ptr_eq(&clone, &original));
        assert_eq!(clone.read().unwrap().id, original.read().unwrap().id);
        let original_submenu = original.read().unwrap().submenu.clone().unwrap();
        let clone_submenu = clone.read().unwrap().submenu.clone().unwrap();
        assert!(!Arc::ptr_eq(&original_submenu[0], &clone_submenu[0]));
        assert_eq!(
            clone_submenu[0].read().unwrap().id,
            original_submenu[0].read().unwrap().id
        );
        let original_nested = original_submenu[0].read().unwrap().submenu.clone().unwrap();
        let clone_nested = clone_submenu[0].read().unwrap().submenu.clone().unwrap();
        assert!(!Arc::ptr_eq(&original_nested[0], &clone_nested[0]));
        assert_eq!(
            clone_nested[0].read().unwrap().id,
            original_nested[0].read().unwrap().id
        );
    }
}

mod create_menu_item_template {
    use super::*;

    #[test]
    fn fills_type_and_enabled_defaults() {
        let created = create_menu_item_template(Some(&node(item("copy", "Copy"))));
        let borrowed = created.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Normal));
        assert_eq!(borrowed.enabled, Some(true));
    }

    #[test]
    fn fills_defaults_without_a_supplied_template() {
        let created = create_menu_item_template(None);
        let borrowed = created.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Normal));
        assert_eq!(borrowed.enabled, Some(true));
    }

    #[test]
    fn normalizes_submenu_children_recursively_into_fresh_nodes() {
        let supplied_child = node(MenuItemTemplate {
            id: Some("child".to_string()),
            ..empty_template()
        });
        let created = create_menu_item_template(Some(&node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![supplied_child.clone()]),
            ..empty_template()
        })));
        let children = created.read().unwrap().submenu.clone().unwrap();
        assert!(!Arc::ptr_eq(&children[0], &supplied_child));
        let child = children[0].read().unwrap();
        assert_eq!(child.type_, Some(MenuItemType::Normal));
        assert_eq!(child.enabled, Some(true));
    }

    #[test]
    fn preserves_supplied_type_and_enabled() {
        let created = create_menu_item_template(Some(&node(MenuItemTemplate {
            type_: Some(MenuItemType::Checkbox),
            enabled: Some(false),
            ..empty_template()
        })));
        let borrowed = created.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Checkbox));
        assert_eq!(borrowed.enabled, Some(false));
    }
}

mod destroy_app_menu {
    use super::*;

    fn provider(
        destroy: Option<Arc<dyn Fn() + Send + Sync>>,
        accepted: bool,
    ) -> Ref<HostAppMenuCapability> {
        return Arc::new(RwLock::new(HostAppMenuCapability {
            destroy,
            set_app_menu: Arc::new(move |_items: &[Ref<MenuItemTemplate>]| accepted),
        }));
    }

    #[test]
    fn destroys_each_distinct_provider_once_even_when_hosts_alias_one() {
        let destroyed = Arc::new(Mutex::new(0));
        let captured = destroyed.clone();
        let shared = provider(Some(Arc::new(move || *captured.lock().unwrap() += 1)), true);
        let mut state = released_state();
        destroy_app_menu(&mut state, &[shared.clone(), shared.clone()]);
        assert_eq!(*destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn never_destroys_an_already_released_provider_a_second_time() {
        let destroyed = Arc::new(Mutex::new(0));
        let captured = destroyed.clone();
        let host = provider(Some(Arc::new(move || *captured.lock().unwrap() += 1)), true);
        let mut state = released_state();
        destroy_app_menu(&mut state, &[host.clone()]);
        destroy_app_menu(&mut state, &[host]);
        assert_eq!(*destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn released_state_does_not_keep_the_provider_alive() {
        let host = provider(Some(Arc::new(|| {})), true);
        let probe: Weak<RwLock<HostAppMenuCapability>> = Arc::downgrade(&host);
        let mut state = released_state();
        destroy_app_menu(&mut state, &[host.clone()]);
        assert_eq!(state.released.len(), 1);
        drop(host);
        assert!(probe.upgrade().is_none());
    }

    #[test]
    fn an_expired_release_entry_does_not_suppress_a_distinct_new_provider() {
        let first = provider(Some(Arc::new(|| {})), true);
        let mut state = released_state();
        destroy_app_menu(&mut state, &[first.clone()]);
        drop(first);
        let second_destroyed = Arc::new(Mutex::new(0));
        let captured = second_destroyed.clone();
        let second = provider(Some(Arc::new(move || *captured.lock().unwrap() += 1)), true);
        destroy_app_menu(&mut state, &[second]);
        assert_eq!(*second_destroyed.lock().unwrap(), 1);
        assert_eq!(state.released.len(), 1);
    }

    #[test]
    fn attempts_every_provider_and_rethrows_the_first_error_after_siblings_run() {
        let second_destroyed = Arc::new(Mutex::new(false));
        let captured = second_destroyed.clone();
        let failing = provider(Some(Arc::new(|| panic!("first failed"))), true);
        let healthy = provider(
            Some(Arc::new(move || *captured.lock().unwrap() = true)),
            true,
        );
        let mut state = released_state();
        let payload = std::panic::catch_unwind(AssertUnwindSafe(|| {
            destroy_app_menu(&mut state, &[failing, healthy]);
        }));
        let message = payload
            .expect_err("the first failure must be rethrown")
            .downcast::<&str>()
            .expect("panic payload must be the provider message");
        assert_eq!(*message, "first failed");
        assert!(*second_destroyed.lock().unwrap());
    }

    #[test]
    fn retries_a_failed_obligation_and_leaves_the_succeeded_one_released() {
        let attempts = Arc::new(Mutex::new(0));
        let captured_attempts = attempts.clone();
        let healthy_destroyed = Arc::new(Mutex::new(0));
        let captured_healthy = healthy_destroyed.clone();
        let flaky = provider(
            Some(Arc::new(move || {
                let attempt = {
                    let mut locked = captured_attempts.lock().unwrap();
                    *locked += 1;
                    *locked
                };
                if attempt == 1 {
                    panic!("transient");
                }
            })),
            true,
        );
        let healthy = provider(
            Some(Arc::new(move || *captured_healthy.lock().unwrap() += 1)),
            true,
        );
        let mut state = released_state();
        let first = std::panic::catch_unwind(AssertUnwindSafe(|| {
            destroy_app_menu(&mut state, &[flaky.clone(), healthy.clone()]);
        }));
        assert!(first.is_err());
        destroy_app_menu(&mut state, &[flaky, healthy]);
        assert_eq!(*attempts.lock().unwrap(), 2);
        assert_eq!(*healthy_destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn tolerates_a_provider_that_declares_no_destroy() {
        let host = provider(None, true);
        let mut state = released_state();
        destroy_app_menu(&mut state, &[host]);
        assert_eq!(state.released.len(), 1);
    }
}

mod enable_menu_signals {
    use super::*;

    #[test]
    fn returns_the_same_group_on_repeated_calls() {
        let mut state = signals_state();
        let first = enable_menu_signals(&mut state);
        let second = enable_menu_signals(&mut state);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_menu_signals {
    use super::*;

    #[test]
    fn returns_the_enabled_group() {
        let mut state = signals_state();
        assert!(get_menu_signals(&state).is_none());
        let enabled = enable_menu_signals(&mut state);
        let fetched = get_menu_signals(&state).expect("enabled group");
        assert!(Arc::ptr_eq(&enabled, &fetched));
    }
}

mod set_app_menu {
    use super::*;

    fn app_host(
        accepted: bool,
        seen: Arc<Mutex<Vec<Vec<Ref<MenuItemTemplate>>>>>,
    ) -> Ref<HostAppMenuCapability> {
        return Arc::new(RwLock::new(HostAppMenuCapability {
            destroy: None,
            set_app_menu: Arc::new(move |items: &[Ref<MenuItemTemplate>]| {
                seen.lock().unwrap().push(items.to_vec());
                return accepted;
            }),
        }));
    }

    #[test]
    fn reports_the_provider_result_and_delivers_the_items() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let host = app_host(true, seen.clone());
        let items = vec![node(item("quit", "Quit"))];
        assert!(set_app_menu(&host, &items));
        let recorded = seen.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert!(Arc::ptr_eq(&recorded[0][0], &items[0]));
    }

    #[test]
    fn reports_a_refused_install_as_false() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let host = app_host(false, seen);
        assert!(!set_app_menu(&host, &[node(item("quit", "Quit"))]));
    }
}

mod show_context_menu {
    use super::*;

    fn popup_host(
        result: Option<String>,
        calls: Arc<Mutex<Vec<String>>>,
    ) -> HostMenuPopupCapability {
        return HostMenuPopupCapability {
            popup: Arc::new(move |_items: Vec<Ref<MenuItemTemplate>>, x: f32, y: f32| {
                calls.lock().unwrap().push(format!("popup@{},{}", x, y));
                let value = result.clone();
                let future: MenuPopupFuture = Box::pin(async move { Ok(value) });
                return future;
            }),
        };
    }

    #[test]
    fn routes_each_call_to_the_host_it_was_given() {
        let first_calls = Arc::new(Mutex::new(Vec::new()));
        let second_calls = Arc::new(Mutex::new(Vec::new()));
        let first = popup_host(Some("from-first".to_string()), first_calls.clone());
        let second = popup_host(Some("from-second".to_string()), second_calls.clone());
        assert_eq!(
            block_on(show_context_menu(&first, &[], 1.0, 2.0, None)),
            Ok(Some("from-first".to_string()))
        );
        assert_eq!(
            block_on(show_context_menu(&second, &[], 3.0, 4.0, None)),
            Ok(Some("from-second".to_string()))
        );
        assert_eq!(*first_calls.lock().unwrap(), vec!["popup@1,2".to_string()]);
        assert_eq!(*second_calls.lock().unwrap(), vec!["popup@3,4".to_string()]);
    }

    #[test]
    fn forwards_descriptor_handles_without_deep_cloning() {
        let recorded = Arc::new(Mutex::new(Vec::new()));
        let captured = recorded.clone();
        let host = HostMenuPopupCapability {
            popup: Arc::new(move |items: Vec<Ref<MenuItemTemplate>>, _x: f32, _y: f32| {
                captured.lock().unwrap().extend(items);
                let future: MenuPopupFuture = Box::pin(async move { Ok(None) });
                return future;
            }),
        };
        let items = vec![node(item("copy", "Copy"))];
        assert_eq!(
            block_on(show_context_menu(&host, &items, 0.0, 0.0, None)),
            Ok(None)
        );
        let recorded_items = recorded.lock().unwrap();
        assert!(Arc::ptr_eq(&recorded_items[0], &items[0]));
    }

    #[test]
    fn emits_the_core_open_and_close_signals_around_the_call() {
        let mut state = signals_state();
        let order = Arc::new(Mutex::new(Vec::new()));
        let open_order = order.clone();
        let close_order = order.clone();
        {
            let signals = enable_menu_signals(&mut state);
            let open = signals.read().unwrap().on_context_menu_open.clone();
            let close = signals.read().unwrap().on_context_menu_close.clone();
            connect_signal(
                &open,
                Arc::new(move |_args: &()| open_order.lock().unwrap().push("open")),
                None,
            );
            connect_signal(
                &close,
                Arc::new(move |_args: &()| close_order.lock().unwrap().push("close")),
                None,
            );
        }
        let calls = Arc::new(Mutex::new(Vec::new()));
        let host = popup_host(Some("x".to_string()), calls);
        assert_eq!(
            block_on(show_context_menu(
                &host,
                &[],
                0.0,
                0.0,
                get_menu_signals(&state)
            )),
            Ok(Some("x".to_string()))
        );
        assert_eq!(*order.lock().unwrap(), vec!["open", "close"]);
    }

    #[test]
    fn propagates_a_rejection_without_emitting_close() {
        let mut state = signals_state();
        let order = Arc::new(Mutex::new(Vec::new()));
        let open_order = order.clone();
        let close_order = order.clone();
        {
            let signals = enable_menu_signals(&mut state);
            let open = signals.read().unwrap().on_context_menu_open.clone();
            let close = signals.read().unwrap().on_context_menu_close.clone();
            connect_signal(
                &open,
                Arc::new(move |_args: &()| open_order.lock().unwrap().push("open")),
                None,
            );
            connect_signal(
                &close,
                Arc::new(move |_args: &()| close_order.lock().unwrap().push("close")),
                None,
            );
        }
        let host = HostMenuPopupCapability {
            popup: Arc::new(|_items: Vec<Ref<MenuItemTemplate>>, _x: f32, _y: f32| {
                let future: MenuPopupFuture = Box::pin(async {
                    Err(FlightError {
                        kind: FlightErrorKind::Error,
                        message: "popup rejected".to_string(),
                    })
                });
                return future;
            }),
        };
        assert_eq!(
            block_on(show_context_menu(
                &host,
                &[],
                0.0,
                0.0,
                get_menu_signals(&state)
            )),
            Err(FlightError {
                kind: FlightErrorKind::Error,
                message: "popup rejected".to_string(),
            })
        );
        assert_eq!(*order.lock().unwrap(), vec!["open".to_string()]);
    }
}

mod validate_menu_item_template {
    use super::*;

    fn checked_item(id: &str, type_: MenuItemType) -> Ref<MenuItemTemplate> {
        return node(MenuItemTemplate {
            type_: Some(type_),
            checked: Some(true),
            ..item(id, "Item")
        });
    }

    #[test]
    fn returns_none_for_a_well_formed_item() {
        let created = create_menu_item_template(Some(&node(item("ok", "Ok"))));
        assert_eq!(validate_menu_item_template(&created), None);
    }

    #[test]
    fn rejects_checked_on_an_item_that_is_not_checkable() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Normal),
            checked: Some(true),
            ..item("copy", "Copy")
        });
        assert!(
            validate_menu_item_template(&template)
                .unwrap()
                .contains("checked")
        );
    }

    #[test]
    fn rejects_checked_false_on_a_normal_item_too() {
        let template = node(MenuItemTemplate {
            checked: Some(false),
            ..item("copy", "Copy")
        });
        assert!(validate_menu_item_template(&template).is_some());
    }

    #[test]
    fn rejects_checked_on_a_submenu_item() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            checked: Some(true),
            submenu: Some(vec![node(item("a", "A"))]),
            ..item("more", "More")
        });
        assert!(validate_menu_item_template(&template).is_some());
    }

    #[test]
    fn accepts_checked_on_checkbox_and_radio_items() {
        let checkbox = checked_item("wrap", MenuItemType::Checkbox);
        assert_eq!(validate_menu_item_template(&checkbox), None);
        let radio = node(MenuItemTemplate {
            type_: Some(MenuItemType::Radio),
            checked: Some(false),
            ..item("left", "Left")
        });
        assert_eq!(validate_menu_item_template(&radio), None);
    }

    #[test]
    fn rejects_a_separator_that_carries_a_label_with_the_exact_message() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Separator),
            ..item("x", "X")
        });
        assert_eq!(
            validate_menu_item_template(&template),
            Some(
                "separator item has a label: \"X\" (separators should not have labels)".to_string()
            )
        );
    }

    #[test]
    fn rejects_a_separator_that_carries_an_accelerator_or_submenu() {
        let accelerated = node(MenuItemTemplate {
            type_: Some(MenuItemType::Separator),
            accelerator: Some("CmdOrCtrl+X".to_string()),
            ..empty_template()
        });
        assert_eq!(
            validate_menu_item_template(&accelerated),
            Some("separator item has an accelerator: \"CmdOrCtrl+X\"".to_string())
        );
        let parented = node(MenuItemTemplate {
            type_: Some(MenuItemType::Separator),
            submenu: Some(vec![]),
            ..empty_template()
        });
        assert_eq!(
            validate_menu_item_template(&parented),
            Some("separator item has a submenu".to_string())
        );
    }

    #[test]
    fn rejects_a_submenu_on_a_non_submenu_type() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Normal),
            submenu: Some(vec![node(item("child", "Child"))]),
            ..empty_template()
        });
        assert_eq!(
            validate_menu_item_template(&template),
            Some(
                "item type \"normal\" has a submenu (only type \"submenu\" should carry children)"
                    .to_string()
            )
        );
    }

    #[test]
    fn allows_checked_radios_in_separate_contiguous_groups() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![
                checked_item("left", MenuItemType::Radio),
                node(MenuItemTemplate {
                    type_: Some(MenuItemType::Normal),
                    ..item("copy", "Copy")
                }),
                checked_item("right", MenuItemType::Radio),
            ]),
            ..empty_template()
        });
        assert_eq!(validate_menu_item_template(&template), None);
    }

    #[test]
    fn rejects_two_checked_radios_in_one_group() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![
                checked_item("left", MenuItemType::Radio),
                checked_item("right", MenuItemType::Radio),
            ]),
            ..empty_template()
        });
        let message = validate_menu_item_template(&template).unwrap();
        assert!(message.contains("radio group"));
    }

    #[test]
    fn accepts_a_checked_radio_in_each_of_two_groups_split_by_a_separator() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![
                checked_item("left", MenuItemType::Radio),
                node(MenuItemTemplate {
                    type_: Some(MenuItemType::Separator),
                    ..empty_template()
                }),
                checked_item("small", MenuItemType::Radio),
            ]),
            ..empty_template()
        });
        assert_eq!(validate_menu_item_template(&template), None);
    }

    #[test]
    fn reports_the_offending_child_of_a_submenu() {
        let template = node(MenuItemTemplate {
            type_: Some(MenuItemType::Submenu),
            submenu: Some(vec![node(MenuItemTemplate {
                checked: Some(true),
                ..item("zoom", "Zoom")
            })]),
            ..empty_template()
        });
        assert!(
            validate_menu_item_template(&template)
                .unwrap()
                .contains("checked")
        );
    }

    #[test]
    fn throws_the_exact_error_on_a_cyclic_submenu_reference() {
        let template = create_menu_item_template(Some(&node(MenuItemTemplate {
            id: Some("cycle".to_string()),
            type_: Some(MenuItemType::Submenu),
            ..empty_template()
        })));
        template.write().unwrap().submenu = Some(vec![template.clone()]);
        let payload = std::panic::catch_unwind(AssertUnwindSafe(|| {
            validate_menu_item_template(&template);
        }));
        let error = payload
            .expect_err("a cyclic submenu reference must throw")
            .downcast::<FlightError>()
            .expect("panic payload must be a FlightError");
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(
            error.message,
            "validateMenuItemTemplate: cyclic submenu reference detected"
        );
    }
}
