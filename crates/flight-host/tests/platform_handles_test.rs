//! flight-compiler: rust-only
//!
//! The module under test is Rust-only (H6): TypeScript keeps its current companion shapes.

use std::sync::{Arc, Mutex};

use flight_host::contract::*;

struct NativeContext {
    generation: u32,
}

// A recording fake of the platform 2D drawing API: each call is logged under its DOM name.
#[derive(Default)]
struct RecordingCanvas2D {
    calls: Mutex<Vec<String>>,
}

impl RecordingCanvas2D {
    fn log(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl Canvas2DContext for RecordingCanvas2D {
    fn begin_path(&self) {
        self.log("beginPath()".to_string());
    }
    fn clear_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("clearRect({x},{y},{width},{height})"));
    }
    fn clip(&self) {
        self.log("clip()".to_string());
    }
    fn fill_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("fillRect({x},{y},{width},{height})"));
    }
    fn fill_text(&self, text: &str, x: f32, y: f32) {
        self.log(format!("fillText({text},{x},{y})"));
    }
    fn line_to(&self, x: f32, y: f32) {
        self.log(format!("lineTo({x},{y})"));
    }
    fn measure_text(&self, text: &str) -> CanvasTextMetrics {
        return CanvasTextMetrics {
            width: text.chars().count() as f32 * 5.0,
        };
    }
    fn move_to(&self, x: f32, y: f32) {
        self.log(format!("moveTo({x},{y})"));
    }
    fn rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("rect({x},{y},{width},{height})"));
    }
    fn restore(&self) {
        self.log("restore()".to_string());
    }
    fn save(&self) {
        self.log("save()".to_string());
    }
    fn set_fill_style(&self, style: &str) {
        self.log(format!("fillStyle={style}"));
    }
    fn set_font(&self, font: &str) {
        self.log(format!("font={font}"));
    }
    fn set_global_alpha(&self, alpha: f32) {
        self.log(format!("globalAlpha={alpha}"));
    }
    fn set_line_width(&self, width: f32) {
        self.log(format!("lineWidth={width}"));
    }
    fn set_stroke_style(&self, style: &str) {
        self.log(format!("strokeStyle={style}"));
    }
    fn set_text_align(&self, align: &str) {
        self.log(format!("textAlign={align}"));
    }
    fn set_text_baseline(&self, baseline: &str) {
        self.log(format!("textBaseline={baseline}"));
    }
    fn set_transform(&self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) {
        self.log(format!("setTransform({a},{b},{c},{d},{e},{f})"));
    }
    fn stroke(&self) {
        self.log("stroke()".to_string());
    }
    fn stroke_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("strokeRect({x},{y},{width},{height})"));
    }
}

// A record copy keeps the exact platform object: the handle's Arc identity is the platform identity,
// and the consuming backend narrows it back to its native type.
#[test]
fn a_gl_context_copy_shares_the_platform_handle_and_narrows_to_its_native_type() {
    let provider: ProviderRef = Arc::new(());
    let context = GlContext {
        provider: provider.clone(),
        handle: Arc::new(NativeContext { generation: 3 }),
    };
    let copy = context.clone();
    assert!(Arc::ptr_eq(&copy.handle, &context.handle));
    assert!(Arc::ptr_eq(&copy.provider, &provider));
    assert_eq!(
        copy.handle
            .downcast_ref::<NativeContext>()
            .map(|native| native.generation),
        Some(3)
    );
}

#[test]
fn wgpu_handles_from_one_provider_share_provider_identity_but_not_handle_identity() {
    let provider: ProviderRef = Arc::new(());
    let device = WgpuDevice {
        provider: provider.clone(),
        handle: Arc::new(1_u8),
    };
    let context = WgpuSurfaceContext {
        provider: provider.clone(),
        handle: Arc::new(2_u8),
    };
    assert!(Arc::ptr_eq(&device.provider, &context.provider));
    assert!(!Arc::ptr_eq(&device.handle, &context.handle));
    assert!(device.handle.downcast_ref::<u16>().is_none());
}

#[test]
fn a_shared_host_image_source_keeps_one_platform_identity_across_holders() {
    let source = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new("image"),
    });
    let held = source.clone();
    assert!(Arc::ptr_eq(&held, &source));
    assert_eq!(held.handle.downcast_ref::<&str>(), Some(&"image"));
}

#[test]
fn native_handles_keep_their_platform_object_and_provider_through_a_copy() {
    let provider: ProviderRef = Arc::new(());
    let surface = NativeSurfaceHandle {
        provider: provider.clone(),
        handle: Arc::new(7_i32),
    };
    let window = NativeWindowHandle {
        provider: provider.clone(),
        handle: Arc::new(8_i32),
    };
    let view = NativeViewHandle {
        provider: provider.clone(),
        handle: Arc::new(9_i32),
    };
    let stream = MediaStreamHandle {
        provider: provider.clone(),
        handle: Arc::new(10_i32),
    };
    let face = FontFaceHandle {
        provider: provider.clone(),
        handle: Arc::new(11_i32),
    };
    let canvas = CanvasRenderingContext2D {
        provider: provider.clone(),
        handle: Arc::new(RecordingCanvas2D::default()),
    };
    assert!(Arc::ptr_eq(&surface.clone().handle, &surface.handle));
    assert!(Arc::ptr_eq(&window.clone().handle, &window.handle));
    assert!(Arc::ptr_eq(&view.clone().handle, &view.handle));
    assert!(Arc::ptr_eq(&stream.clone().handle, &stream.handle));
    assert!(Arc::ptr_eq(&face.clone().handle, &face.handle));
    assert!(Arc::ptr_eq(&canvas.clone().handle, &canvas.handle));
    for token in [
        &surface.provider,
        &window.provider,
        &view.provider,
        &stream.provider,
        &face.provider,
        &canvas.provider,
    ] {
        assert!(Arc::ptr_eq(token, &provider));
    }
    assert_eq!(surface.handle.downcast_ref::<i32>(), Some(&7));
}

// The 2D handle is the drawing API itself: callers draw through it directly, with no narrowing, and
// a copy draws into the same platform object.
#[test]
fn a_canvas_2d_context_handle_draws_through_the_platform_api_it_carries() {
    let canvas = Arc::new(RecordingCanvas2D::default());
    let context = CanvasRenderingContext2D {
        provider: Arc::new(()),
        handle: canvas.clone(),
    };
    let copy = context.clone();
    copy.handle.set_fill_style("#ff0000");
    copy.handle.fill_rect(1.0, 2.0, 3.0, 4.0);
    assert_eq!(context.handle.measure_text("abc").width, 15.0);
    assert_eq!(
        *canvas.calls.lock().unwrap(),
        vec![
            "fillStyle=#ff0000".to_string(),
            "fillRect(1,2,3,4)".to_string()
        ]
    );
}
