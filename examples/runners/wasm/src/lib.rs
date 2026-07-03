use example_drawingshapes::{DrawingPrimitive, HEIGHT, WIDTH, drawing_primitives};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

#[wasm_bindgen]
pub fn mount_drawingshapes() -> Result<(), JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("window unavailable"))?;
    let document = window
        .document()
        .ok_or_else(|| JsValue::from_str("document unavailable"))?;
    let body = document
        .body()
        .ok_or_else(|| JsValue::from_str("document.body unavailable"))?;
    let pixel_ratio = window.device_pixel_ratio();

    let canvas = document
        .create_element("canvas")?
        .dyn_into::<HtmlCanvasElement>()?;
    canvas.set_width((WIDTH as f64 * pixel_ratio) as u32);
    canvas.set_height((HEIGHT as f64 * pixel_ratio) as u32);
    canvas.set_attribute(
        "style",
        &format!("width:{WIDTH}px;height:{HEIGHT}px;display:block"),
    )?;
    body.append_child(&canvas)?;

    let context = canvas
        .get_context("2d")?
        .ok_or_else(|| JsValue::from_str("2D canvas unavailable"))?
        .dyn_into::<CanvasRenderingContext2d>()?;
    context.scale(pixel_ratio, pixel_ratio)?;
    context.set_fill_style_str("#ffffff");
    context.fill_rect(0.0, 0.0, WIDTH as f64, HEIGHT as f64);
    context.set_fill_style_str("#24afc4");

    for primitive in drawing_primitives() {
        draw_primitive(&context, &primitive)?;
    }
    Ok(())
}

fn draw_primitive(
    context: &CanvasRenderingContext2d,
    primitive: &DrawingPrimitive,
) -> Result<(), JsValue> {
    match primitive {
        DrawingPrimitive::Rectangle {
            x,
            y,
            width,
            height,
        } => context.fill_rect(*x as f64, *y as f64, *width as f64, *height as f64),
        DrawingPrimitive::Circle { x, y, radius } => {
            context.begin_path();
            context.arc(
                *x as f64,
                *y as f64,
                *radius as f64,
                0.0,
                std::f64::consts::TAU,
            )?;
            context.fill();
        }
        DrawingPrimitive::Ellipse {
            x,
            y,
            width,
            height,
        } => {
            context.begin_path();
            context.ellipse(
                (*x + *width / 2.0) as f64,
                (*y + *height / 2.0) as f64,
                (*width / 2.0) as f64,
                (*height / 2.0) as f64,
                0.0,
                0.0,
                std::f64::consts::TAU,
            )?;
            context.fill();
        }
        DrawingPrimitive::RoundRectangle {
            x,
            y,
            width,
            height,
            radius,
        } => draw_round_rectangle(context, *x, *y, *width, *height, *radius),
        DrawingPrimitive::Polygon { points } => {
            let Some(&(x, y)) = points.first() else {
                return Ok(());
            };
            context.begin_path();
            context.move_to(x as f64, y as f64);
            for &(x, y) in &points[1..] {
                context.line_to(x as f64, y as f64);
            }
            context.close_path();
            context.fill();
        }
    }
    Ok(())
}

fn draw_round_rectangle(
    context: &CanvasRenderingContext2d,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    radius: f32,
) {
    let right = x + width;
    let bottom = y + height;
    context.begin_path();
    context.move_to((x + radius) as f64, y as f64);
    context.line_to((right - radius) as f64, y as f64);
    context.quadratic_curve_to(right as f64, y as f64, right as f64, (y + radius) as f64);
    context.line_to(right as f64, (bottom - radius) as f64);
    context.quadratic_curve_to(
        right as f64,
        bottom as f64,
        (right - radius) as f64,
        bottom as f64,
    );
    context.line_to((x + radius) as f64, bottom as f64);
    context.quadratic_curve_to(x as f64, bottom as f64, x as f64, (bottom - radius) as f64);
    context.line_to(x as f64, (y + radius) as f64);
    context.quadratic_curve_to(x as f64, y as f64, (x + radius) as f64, y as f64);
    context.close_path();
    context.fill();
}
