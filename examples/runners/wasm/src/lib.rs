use example_common::{ExamplePrimitive, ExampleScene};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

macro_rules! mount_example {
    ($name:ident, $create_scene:path) => {
        #[wasm_bindgen]
        pub fn $name() -> Result<(), JsValue> {
            mount_scene(&$create_scene())
        }
    };
}

mount_example!(mount_addinganimation, example_addinganimation::create_scene);
mount_example!(mount_addingtext, example_addingtext::create_scene);
mount_example!(mount_animatedsprite, example_animatedsprite::create_scene);
mount_example!(mount_batchloading, example_batchloading::create_scene);
mount_example!(mount_bunnymark, example_bunnymark::create_scene);
mount_example!(
    mount_comparebitmapdata,
    example_comparebitmapdata::create_scene
);
mount_example!(
    mount_displayingabitmap,
    example_displayingabitmap::create_scene
);
mount_example!(mount_drawingshapes, example_drawingshapes::create_scene);
mount_example!(mount_nyancat, example_nyancat::create_scene);
mount_example!(mount_piratepig, example_piratepig::create_scene);
mount_example!(mount_playingsound, example_playingsound::create_scene);
mount_example!(mount_playingvideo, example_playingvideo::create_scene);
mount_example!(mount_renderview, example_renderview::create_scene);
mount_example!(mount_sparktrail, example_sparktrail::create_scene);
mount_example!(mount_textmetrics, example_textmetrics::create_scene);
mount_example!(mount_tweenexample, example_tweenexample::create_scene);
mount_example!(mount_usingtilemap, example_usingtilemap::create_scene);

fn mount_scene(scene: &ExampleScene) -> Result<(), JsValue> {
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
    canvas.set_width((scene.width as f64 * pixel_ratio) as u32);
    canvas.set_height((scene.height as f64 * pixel_ratio) as u32);
    canvas.set_attribute(
        "style",
        &format!(
            "width:{}px;height:{}px;display:block",
            scene.width, scene.height
        ),
    )?;
    body.append_child(&canvas)?;

    let context = canvas
        .get_context("2d")?
        .ok_or_else(|| JsValue::from_str("2D canvas unavailable"))?
        .dyn_into::<CanvasRenderingContext2d>()?;
    context.scale(pixel_ratio, pixel_ratio)?;
    set_fill_style(&context, scene.background);
    context.fill_rect(0.0, 0.0, scene.width as f64, scene.height as f64);
    set_fill_style(&context, scene.fill);

    for primitive in &scene.primitives {
        draw_primitive(&context, primitive)?;
    }
    Ok(())
}

fn draw_primitive(
    context: &CanvasRenderingContext2d,
    primitive: &ExamplePrimitive,
) -> Result<(), JsValue> {
    match primitive {
        ExamplePrimitive::Rectangle {
            x,
            y,
            width,
            height,
        } => context.fill_rect(*x as f64, *y as f64, *width as f64, *height as f64),
        ExamplePrimitive::Circle { x, y, radius } => {
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
        ExamplePrimitive::Ellipse {
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
        ExamplePrimitive::RoundRectangle {
            x,
            y,
            width,
            height,
            radius,
        } => draw_round_rectangle(context, *x, *y, *width, *height, *radius),
        ExamplePrimitive::Polygon { points } => {
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
        ExamplePrimitive::Text { x, y, value, size } => {
            context.set_font(&format!("{size}px sans-serif"));
            context.fill_text(value, *x as f64, *y as f64)?;
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

fn set_fill_style(context: &CanvasRenderingContext2d, color: u32) {
    let [r, g, b, a] = color.to_be_bytes();
    context.set_fill_style_str(&format!("rgba({r},{g},{b},{})", a as f32 / 255.0));
}
