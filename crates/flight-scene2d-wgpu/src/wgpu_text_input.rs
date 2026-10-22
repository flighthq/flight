// flight-lint: allow-file(contract-vocabulary) D17 the text-input overlay draws through the narrowed host Canvas 2D context
//! The caret/selection overlay drawn onto a RichText's offscreen field canvas when its input slot is
//! present (TS `wgpuTextInput.ts`). Identical to the GL overlay: both backends rasterize the field to
//! a 2D canvas before uploading, so the chrome is plain Canvas 2D drawing.

use flight_color::compute_rgba_css_string;
use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_render_wgpu::WgpuRenderState;
use flight_text::contract::{RichText, get_rich_text_scroll_y_offset};
use flight_textinput::{
    get_text_input_caret_rectangle, get_text_input_selection_begin_index,
    get_text_input_selection_end_index, get_text_input_selection_rectangles, get_text_input_state,
};
use flight_textlayout::contract::{TextLayoutResult, TextSelectionRectangle};

use crate::scene2d_wgpu_runtime::narrow_canvas_2d_context;
use crate::wgpu_rich_text::register_wgpu_text_input_overlay;

const CARET_WIDTH: f32 = 1.0;

/// Rasterizes the editable-field overlay (selection highlight and caret) onto the offscreen field
/// canvas of a RichText whose input slot is present (TS `drawWgpuTextInputOverlay`).
pub fn draw_wgpu_text_input_overlay(
    context: &CanvasRenderingContext2D,
    source: &Ref<RichText>,
    result: &TextLayoutResult,
    field_w: f32,
    field_h: f32,
    _text: &str,
) {
    let Some(input) = get_text_input_state(source) else {
        return;
    };
    let input = input.read().unwrap().clone();
    if !input.focused && !input.always_show_selection {
        return;
    }

    let (scroll_v, scroll_h) = {
        let source = source.read().unwrap();
        (source.data.scroll_v, source.data.scroll_h)
    };
    let first_visible_line = scroll_v - 1.0;
    let scroll_y_offset = if first_visible_line > 0.0 {
        get_rich_text_scroll_y_offset(&result.line_heights, first_visible_line as usize)
    } else {
        0.0
    };
    let scroll_x_offset = scroll_h;
    let context = narrow_canvas_2d_context(context);

    context.save();
    context.begin_path();
    context.rect(0.0, 0.0, field_w, field_h);
    context.clip();

    let mut selection_rectangles: Vec<TextSelectionRectangle> = Vec::new();
    get_text_input_selection_rectangles(&mut selection_rectangles, source, result);
    if !selection_rectangles.is_empty() {
        context.set_fill_style(&compute_rgba_css_string(input.selection_color));
        context.set_global_alpha(input.selection_alpha);
        for rect in &selection_rectangles {
            context.fill_rect(
                rect.x - scroll_x_offset,
                rect.y - scroll_y_offset,
                rect.width,
                rect.height,
            );
        }
    }

    if input.focused
        && get_text_input_selection_begin_index(source)
            == get_text_input_selection_end_index(source)
    {
        let mut caret_rectangle = TextSelectionRectangle {
            height: 0.0,
            line_index: 0,
            width: 0.0,
            x: 0.0,
            y: 0.0,
        };
        get_text_input_caret_rectangle(&mut caret_rectangle, source, result);
        context.set_fill_style(&compute_rgba_css_string(input.caret_color));
        context.set_global_alpha(1.0);
        context.fill_rect(
            caret_rectangle.x - scroll_x_offset,
            caret_rectangle.y - scroll_y_offset,
            CARET_WIDTH,
            caret_rectangle.height,
        );
    }

    context.restore();
}

/// Installs the caret/selection overlay onto the RichText renderer of `state` (TS
/// `enableWgpuTextInput`); a static RichText leaves the slot empty.
// flight-lint: allow(conform-params) D5 the overlay registry is explicit per-state rather than a TS module global
pub fn enable_wgpu_text_input(state: &mut WgpuRenderState) {
    register_wgpu_text_input_overlay(state, draw_wgpu_text_input_overlay);
}
