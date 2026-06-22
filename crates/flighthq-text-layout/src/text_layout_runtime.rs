use flighthq_types::TextLayoutResult;

use crate::text_layout::create_text_layout_result;

/// Clears a runtime-held layout result slot, releasing it to GC.
///
/// Mirrors the TS `clearTextLayoutResult(runtime)`. In the Rust design the
/// layout result is stored in an explicit `Option<TextLayoutResult>` slot
/// (for example `TextLayoutCache::result` in `flighthq-text`) rather than on a
/// runtime entity, so this operates on the slot directly.
pub fn clear_text_layout_result(slot: &mut Option<TextLayoutResult>) {
    *slot = None;
}

/// Returns the runtime-held layout result, lazily allocating an empty one into
/// `slot` if it has not been created yet.
///
/// Mirrors the TS `getTextLayoutResult(runtime)`.
pub fn get_text_layout_result(slot: &mut Option<TextLayoutResult>) -> &mut TextLayoutResult {
    if slot.is_none() {
        *slot = Some(create_text_layout_result());
    }
    slot.as_mut().expect("slot was just initialized")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clear_text_layout_result_empties_slot() {
        let mut slot = Some(create_text_layout_result());
        clear_text_layout_result(&mut slot);
        assert!(slot.is_none());
    }

    #[test]
    fn get_text_layout_result_allocates_when_empty() {
        let mut slot: Option<TextLayoutResult> = None;
        let result = get_text_layout_result(&mut slot);
        assert_eq!(result.num_lines, 0);
        assert!(slot.is_some());
    }
}
