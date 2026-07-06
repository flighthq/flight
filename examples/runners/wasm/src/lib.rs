use std::cell::RefCell;
use std::rc::Rc;

use example_common::{ExamplePrimitive, ExampleScene, ExampleSceneBehavior};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement, Window};

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
    match &scene.behavior {
        ExampleSceneBehavior::Static => mount_static_scene(scene),
        ExampleSceneBehavior::BunnyMark {
            image_path,
            initial_count,
            add_count,
            gravity,
        } => mount_bunny_mark(scene, image_path, *initial_count, *add_count, *gravity),
    }
}

fn mount_static_scene(scene: &ExampleScene) -> Result<(), JsValue> {
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

fn mount_bunny_mark(
    scene: &ExampleScene,
    image_path: &str,
    initial_count: usize,
    add_count: usize,
    gravity: f32,
) -> Result<(), JsValue> {
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

    let counter = document.create_element("div")?;
    counter.set_attribute(
        "style",
        "position:fixed;bottom:0;right:0;width:80px;padding:3px 0;background:#fff;color:#333;font:bold 9px monospace;text-align:center;opacity:0.9;z-index:10000",
    )?;
    body.append_child(&counter)?;

    let context = canvas
        .get_context("2d")?
        .ok_or_else(|| JsValue::from_str("2D canvas unavailable"))?
        .dyn_into::<CanvasRenderingContext2d>()?;
    context.scale(pixel_ratio, pixel_ratio)?;

    let adding = Rc::new(RefCell::new(false));
    let on_mouse_down = Closure::<dyn FnMut(_)>::wrap(Box::new({
        let adding = adding.clone();
        move |_event: web_sys::Event| {
            *adding.borrow_mut() = true;
        }
    }));
    canvas.add_event_listener_with_callback("mousedown", on_mouse_down.as_ref().unchecked_ref())?;
    on_mouse_down.forget();

    let on_mouse_up = Closure::<dyn FnMut(_)>::wrap(Box::new({
        let adding = adding.clone();
        move |_event: web_sys::Event| {
            *adding.borrow_mut() = false;
        }
    }));
    canvas.add_event_listener_with_callback("mouseup", on_mouse_up.as_ref().unchecked_ref())?;
    on_mouse_up.forget();

    let image = HtmlImageElement::new()?;
    let on_load = Closure::<dyn FnMut()>::wrap(Box::new({
        let window = window.clone();
        let context = context.clone();
        let counter = counter.clone();
        let image = image.clone();
        let adding = adding.clone();
        let background = scene.background;
        let width = scene.width;
        let height = scene.height;
        move || {
            let _ = start_bunny_mark_loop(BunnyMarkLoop {
                window: window.clone(),
                context: context.clone(),
                counter: counter.clone(),
                image: image.clone(),
                adding: adding.clone(),
                width,
                height,
                background,
                initial_count,
                add_count,
                gravity,
            });
        }
    }));
    image.set_onload(Some(on_load.as_ref().unchecked_ref()));
    image.set_src(image_path);
    on_load.forget();

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

struct Bunny {
    x: f32,
    y: f32,
    speed_x: f32,
    speed_y: f32,
}

struct BunnyMarkLoop {
    window: Window,
    context: CanvasRenderingContext2d,
    counter: web_sys::Element,
    image: HtmlImageElement,
    adding: Rc<RefCell<bool>>,
    width: u32,
    height: u32,
    background: u32,
    initial_count: usize,
    add_count: usize,
    gravity: f32,
}

struct BunnyMarkState {
    bunnies: Vec<Bunny>,
    random_seed: u32,
}

fn start_bunny_mark_loop(options: BunnyMarkLoop) -> Result<(), JsValue> {
    let image_width = options.image.natural_width() as f32;
    let image_height = options.image.natural_height() as f32;
    let state = Rc::new(RefCell::new(BunnyMarkState {
        bunnies: Vec::new(),
        random_seed: 0x12_34_56_78,
    }));
    {
        let mut state = state.borrow_mut();
        for _ in 0..options.initial_count {
            add_bunny(&mut state);
        }
    }

    let frame = Rc::new(RefCell::new(None::<Closure<dyn FnMut(f64)>>));
    let next_frame = frame.clone();
    let initial_window = options.window.clone();
    let animation_window = options.window.clone();

    *frame.borrow_mut() = Some(Closure::<dyn FnMut(f64)>::wrap(Box::new(move |_| {
        let count = {
            let mut state = state.borrow_mut();
            render_bunny_mark_frame(&options, &mut state, image_width, image_height);
            state.bunnies.len()
        };
        options
            .counter
            .set_text_content(Some(&format!("{count} bunnies")));
        let _ = request_animation_frame(&animation_window, next_frame.borrow().as_ref().unwrap());
    })));
    request_animation_frame(&initial_window, frame.borrow().as_ref().unwrap())?;
    Ok(())
}

fn render_bunny_mark_frame(
    options: &BunnyMarkLoop,
    state: &mut BunnyMarkState,
    image_width: f32,
    image_height: f32,
) {
    set_fill_style(&options.context, options.background);
    options
        .context
        .fill_rect(0.0, 0.0, options.width as f64, options.height as f64);

    let mut random_seed = state.random_seed;
    for bunny in &mut state.bunnies {
        bunny.x += bunny.speed_x;
        bunny.y += bunny.speed_y;
        bunny.speed_y += options.gravity;

        if bunny.x > options.width as f32 - image_width {
            bunny.speed_x *= -1.0;
            bunny.x = options.width as f32 - image_width;
        } else if bunny.x < 0.0 {
            bunny.speed_x *= -1.0;
            bunny.x = 0.0;
        }

        if bunny.y > options.height as f32 - image_height {
            bunny.speed_y *= -0.8;
            bunny.y = options.height as f32 - image_height;
            if next_random_seed(&mut random_seed) > 0.5 {
                bunny.speed_y -= 3.0 + next_random_seed(&mut random_seed) * 4.0;
            }
        } else if bunny.y < 0.0 {
            bunny.speed_y = 0.0;
            bunny.y = 0.0;
        }

        let _ = options.context.draw_image_with_html_image_element(
            &options.image,
            bunny.x as f64,
            bunny.y as f64,
        );
    }
    state.random_seed = random_seed;

    if *options.adding.borrow() {
        for _ in 0..options.add_count {
            add_bunny(state);
        }
    }
}

fn add_bunny(state: &mut BunnyMarkState) {
    let speed_x = next_random(state) * 5.0;
    let speed_y = next_random(state) * 5.0 - 2.5;
    state.bunnies.push(Bunny {
        x: 0.0,
        y: 0.0,
        speed_x,
        speed_y,
    });
}

fn next_random(state: &mut BunnyMarkState) -> f32 {
    next_random_seed(&mut state.random_seed)
}

fn next_random_seed(seed: &mut u32) -> f32 {
    let mut x = *seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *seed = x;
    x as f32 / u32::MAX as f32
}

fn request_animation_frame(
    window: &Window,
    closure: &Closure<dyn FnMut(f64)>,
) -> Result<i32, JsValue> {
    window.request_animation_frame(closure.as_ref().unchecked_ref())
}
