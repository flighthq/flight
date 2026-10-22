use flight_command::contract::*;

use crate::support::*;

mod explain_command_dispatch {
    use super::*;

    #[test]
    fn names_the_unregistered_kind_behind_a_refusal() {
        let history = create_command_history();
        let explanation = explain_command_dispatch(&history, &command("acme.Unbound", "Nope"));
        assert_eq!(explanation.missing_kind, Some(String::from("acme.Unbound")));
        assert!(!explanation.resolved);
    }

    #[test]
    fn resolves_when_the_kind_is_registered() {
        let history = create_command_history();
        register_command_binding(&history, "acme.Bound", inert_binding());
        let explanation = explain_command_dispatch(&history, &command("acme.Bound", "Yes"));
        assert_eq!(explanation.missing_kind, None);
        assert!(explanation.resolved);
    }

    #[test]
    fn descends_into_a_composite_and_names_an_unbound_child_kind() {
        let history = create_command_history();
        register_command_binding(&history, COMPOSITE_COMMAND_KIND, inert_binding());
        let composite = erased(create_composite_command(&[command(
            "acme.Unbound",
            "Child",
        )]));
        let explanation = explain_command_dispatch(&history, &composite);
        assert_eq!(explanation.missing_kind, Some(String::from("acme.Unbound")));
    }

    #[test]
    fn resolves_a_composite_whose_children_are_all_bound() {
        let history = create_command_history();
        register_command_binding(&history, COMPOSITE_COMMAND_KIND, inert_binding());
        register_command_binding(&history, "acme.Bound", inert_binding());
        let composite = erased(create_composite_command(&[command("acme.Bound", "Child")]));
        assert!(explain_command_dispatch(&history, &composite).resolved);
    }
}
