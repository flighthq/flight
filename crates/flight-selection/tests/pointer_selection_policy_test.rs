use flight_selection::contract::*;

use crate::support::*;

fn modifiers(
    alt_key: bool,
    ctrl_key: bool,
    meta_key: bool,
    shift_key: bool,
) -> SelectionModifierState {
    return SelectionModifierState {
        alt_key,
        ctrl_key,
        meta_key,
        shift_key,
    };
}

mod apply_pointer_selection_policy {
    use super::*;

    #[test]
    fn adds_or_removes_with_shift_and_toggles_with_ctrl_or_command() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
        );
        assert!(same_nodes(
            &get_selected_nodes(&selection),
            &[first.clone()]
        ));
        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
        );
        assert!(get_selected_nodes(&selection).is_empty());

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, true, false, false),
        );
        apply_pointer_selection_policy(
            &selection,
            Some(&second),
            &modifiers(false, false, true, false),
        );
        assert!(same_nodes(
            &get_selected_nodes(&selection),
            &[first.clone(), second.clone()]
        ));
        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, true, false),
        );
        assert!(same_nodes(
            &get_selected_nodes(&selection),
            &[second.clone()]
        ));

        apply_pointer_selection_policy(&selection, None, &modifiers(false, true, false, false));
        assert!(same_nodes(&get_selected_nodes(&selection), &[second]));
    }

    #[test]
    fn applies_unmodified_hit_and_empty_space_behavior() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
        );
        assert!(same_nodes(
            &get_selected_nodes(&selection),
            &[first.clone(), second]
        ));

        let third = create_test_node("third");
        apply_pointer_selection_policy(
            &selection,
            Some(&third),
            &modifiers(false, false, false, false),
        );
        assert!(same_nodes(&get_selected_nodes(&selection), &[third]));

        apply_pointer_selection_policy(&selection, None, &modifiers(false, false, false, false));
        assert!(get_selected_nodes(&selection).is_empty());
    }

    #[test]
    fn leaves_alt_gestures_available_for_caller_defined_alternate_pick_behavior() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone()]);

        apply_pointer_selection_policy(
            &selection,
            Some(&second),
            &modifiers(true, false, false, false),
        );
        apply_pointer_selection_policy(&selection, None, &modifiers(true, false, false, false));

        assert!(same_nodes(&get_selected_nodes(&selection), &[first]));
    }
}

mod apply_pointer_up_selection_policy {
    use super::*;

    #[test]
    fn narrows_an_already_selected_hit_only_on_unmodified_pointer_up_without_a_drag() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
            true,
        );
        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
            false,
        );
        assert!(same_nodes(
            &get_selected_nodes(&selection),
            &[first.clone(), second]
        ));

        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
            false,
        );
        assert!(same_nodes(&get_selected_nodes(&selection), &[first]));
    }
}
