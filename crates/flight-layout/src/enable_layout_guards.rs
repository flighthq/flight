use crate::types::*;

pub fn enable_layout_guards(
    state: &mut LayoutState,
    warning_sink: LayoutResolutionGuard,
) {
    state.guard = Some(warning_sink);
}
