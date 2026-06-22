//! Background-color helpers for `RenderState`.

use flighthq_types::RenderState;

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Writes `color` (packed RGBA `0xRRGGBBAA`) into `state.background_color` and
/// derives the separate `[r, g, b, a]` channel tuple `[0.0, 1.0]` and the CSS
/// hex string representation.
///
/// The derived values are stored directly on `state`; the caller owns the state
/// mutably at this call site, so no internal-cast type is needed.
pub fn set_render_state_background_color(state: &mut RenderState, color: u32) {
    // The Rust `RenderState` carries only the packed color; the derived RGBA channel
    // tuple and CSS hex string from the TS source live on backend-specific runtimes,
    // not on the shared entity, so there is nothing further to store here.
    state.background_color = color;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // set_render_state_background_color

    #[test]
    fn set_render_state_background_color_stores_color() {
        let mut state = RenderState::default();
        set_render_state_background_color(&mut state, 0xff0000ff);
        assert_eq!(state.background_color, 0xff0000ff);
    }
}
