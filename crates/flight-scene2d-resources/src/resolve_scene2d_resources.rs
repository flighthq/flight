use flight_entity::Ref;

use crate::scene2d_resource_diagnostics::report_scene2d_resource_failure;
use crate::scene2d_slot_reference::set_scene2d_slot_reference_content;
use crate::types::*;

// flight-lint: allow(conform-params) D24 caller-owned aggregate output is cleared and filled; D5 caller-owned guard state replaces the source module hook
pub fn resolve_scene2d_resources(
    out: &mut Scene2DResources,
    document: &Ref<Scene2DDocument>,
    options: Option<&ResolveScene2DResourcesOptions>,
    guard_state: &Scene2DResourceFailureGuardStateRef,
) {
    let (root, slots) = {
        let document = document.read().unwrap();
        (document.root.clone(), document.slots.clone())
    };
    out.document = document.clone();
    out.resolved.clear();
    out.root = root;
    out.unresolved.clear();
    let mut required_total = 0;
    let mut required_unresolved = 0;
    for reference in slots {
        let selected = {
            let reference = reference.read().unwrap();
            options
                .and_then(|options| options.select.as_ref())
                .map(|select| select(&reference))
                .unwrap_or(true)
        };
        if !selected {
            continue;
        }
        let (required, content) = {
            let reference = reference.read().unwrap();
            let content = options
                .and_then(|options| options.resolve_slot_content.as_ref())
                .and_then(|resolve| resolve(&reference));
            (reference.required, content)
        };
        if required {
            required_total += 1;
        }
        set_scene2d_slot_reference_content(&mut reference.write().unwrap(), content.clone());
        if let Some(content) = content {
            out.resolved
                .push(Scene2DSlotResolution { content, reference });
        } else {
            if required {
                required_unresolved += 1;
            }
            out.unresolved.push(reference);
        }
    }
    if required_unresolved > 0 {
        report_scene2d_resource_failure(
            guard_state,
            &Scene2DResourceFailureNotice {
                operation: Scene2DResourceFailureOperation::ResolveScene2DResources,
                reason: Scene2DResourceFailureReason::RequiredSlotsUnresolved,
                total: required_total,
                unresolved: required_unresolved,
                url: None,
            },
        );
    }
}
