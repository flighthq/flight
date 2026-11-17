use std::ffi::c_void;

use crate::FfiShapeBoundsContextVTable;

macro_rules! succeeding_callback {
    ($name:ident($($argument:ident: $ty:ty),* $(,)?)) => {
        unsafe extern "C-unwind" fn $name($($argument: $ty),*) -> bool {
            $(let _ = $argument;)*
            true
        }
    };
}

succeeding_callback!(close_path(context: *mut c_void));
succeeding_callback!(
    cubic_curve_to(
        context: *mut c_void,
        control_x1: f64,
        control_y1: f64,
        control_x2: f64,
        control_y2: f64,
        x: f64,
        y: f64,
    )
);
succeeding_callback!(draw_circle(context: *mut c_void, center_x: f64, center_y: f64, radius: f64));
succeeding_callback!(
    draw_ellipse(context: *mut c_void, center_x: f64, center_y: f64, radius_x: f64, radius_y: f64)
);
succeeding_callback!(draw_rectangle(context: *mut c_void, x: f64, y: f64, width: f64, height: f64));
succeeding_callback!(
    draw_rounded_rectangle(
        context: *mut c_void,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        radius: f64,
    )
);
succeeding_callback!(expand_point(context: *mut c_void, x: f64, y: f64));
succeeding_callback!(line_to(context: *mut c_void, x: f64, y: f64));
succeeding_callback!(move_to(context: *mut c_void, x: f64, y: f64));
succeeding_callback!(
    quadratic_curve_to(context: *mut c_void, control_x: f64, control_y: f64, x: f64, y: f64)
);
succeeding_callback!(
    set_stroke_style(context: *mut c_void, width: f64, caps: u32, joints: u32, miter_limit: f64)
);

#[test]
fn callback_panic_is_caught_before_it_can_cross_the_c_abi() {
    let vtable = FfiShapeBoundsContextVTable {
        close_path: Some(close_path),
        cubic_curve_to: Some(cubic_curve_to),
        draw_circle: Some(draw_circle),
        draw_ellipse: Some(draw_ellipse),
        draw_rectangle: Some(draw_rectangle),
        draw_rounded_rectangle: Some(draw_rounded_rectangle),
        expand_point: Some(expand_point),
        flush_path: Some(panicking_flush_path),
        line_to: Some(line_to),
        move_to: Some(move_to),
        quadratic_curve_to: Some(quadratic_curve_to),
        set_stroke_style: Some(set_stroke_style),
    };
    let mut context = 0_u8;

    let succeeded = unsafe {
        crate::flight_default_shape_bounds_flush(
            std::ptr::from_mut(&mut context).cast::<c_void>(),
            &vtable,
        )
    };

    assert!(!succeeded);
}

unsafe extern "C-unwind" fn panicking_flush_path(_context: *mut c_void) -> bool {
    panic!("callback panic must stop at the FFI boundary");
}
