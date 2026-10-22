use std::path::Path;
mod gui_tree_shaking {
    use super::*;
    #[test]
    fn does_not_pull_the_catalog_or_tween_runtime_into_a_button_only_graph() {
        let source = implementation_graph("button_controller");
        assert!(source.contains("pub fn create_button_controller"));
        for marker in [
            "set_interval",
            "on_expand_change",
            "create_text_input_manager",
            "flight_tween::",
        ] {
            assert!(
                !source.contains(marker),
                "Button-only graph reaches {marker}"
            );
        }
    }
    #[test]
    fn does_not_pull_later_application_gui_systems_or_tween_into_a_dialog_only_graph() {
        let source = implementation_graph("gui_dialog");
        assert!(source.contains("pub fn create_gui_dialog"));
        for marker in [
            "flight_command::",
            "flight_dialog::",
            "flight_layout::",
            "flight_menu::",
            "flight_tween::",
            "create_text_input_manager",
            "on_expand_change",
        ] {
            assert!(
                !source.contains(marker),
                "GuiDialog-only graph reaches {marker}"
            );
        }
    }
}
// Counterpart of the source packages-external esbuild instrument: actual module-qualified
// implementation reachability, not a linked artifact or a bundle size claim.
fn implementation_graph(entry: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut pending = vec![entry.to_string()];
    let mut seen = Vec::new();
    let mut implementation = String::new();
    while let Some(module) = pending.pop() {
        if seen.contains(&module) {
            continue;
        }
        let source = std::fs::read_to_string(root.join(format!("{module}.rs"))).unwrap();
        assert!(
            !source.contains("use crate::{"),
            "update graph traversal for root group import in {module}"
        );
        for (index, _) in source.match_indices("crate::") {
            let tail = &source[index + 7..];
            let name: String = tail
                .chars()
                .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
                .collect();
            assert!(
                !name.is_empty(),
                "unrecognized crate dependency in {module}"
            );
            assert!(
                root.join(format!("{name}.rs")).is_file(),
                "unresolved module dependency {name} in {module}"
            );
            pending.push(name);
        }
        implementation.push_str(&source);
        seen.push(module);
    }
    return implementation;
}
