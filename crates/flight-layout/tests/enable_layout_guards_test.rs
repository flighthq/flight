use std::cell::RefCell;

use flight_layout::*;

thread_local! {
    static GUARD_CALLS: RefCell<Vec<LayoutResolutionExplanation>> = RefCell::new(Vec::new());
}

fn test_warn(explanation: &LayoutResolutionExplanation) {
    GUARD_CALLS.with(|c| c.borrow_mut().push(explanation.clone()));
}

mod enable_layout_guards {
    use super::*;

    #[test]
    fn warns_with_the_structured_explanation_for_a_silent_sentinel() {
        GUARD_CALLS.with(|c| c.borrow_mut().clear());
        let mut state = create_layout_state();
        super::enable_layout_guards(&mut state, test_warn);
        let root = LayoutNode {
            container_style: ContainerStyle::None,
            item_style: ItemStyle::None,
            kind: "acme.Root".to_string(),
            parent_index: -1,
        };
        let tree = LayoutTree {
            nodes: vec![root],
        };
        let mut out = vec![0.0_f32; 3];
        resolve_layout_tree(&mut out, &mut state, &tree, &[0.0_f32; 2], 100.0, 100.0);
        GUARD_CALLS.with(|c| {
            let calls = c.borrow();
            assert_eq!(calls.len(), 1);
            assert_eq!(
                calls[0].kind,
                LayoutResolutionFailureKind::OutputTooSmall
            );
        });
    }
}
