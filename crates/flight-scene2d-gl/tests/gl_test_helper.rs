#![allow(dead_code)]

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::ffi::{c_char, c_void};
use std::rc::Rc;
use std::sync::Arc;


use flight_render_gl::{
    create_gl_context_state, create_gl_render_state, GlContextState, GlRenderState,
};

#[derive(Clone, Debug, PartialEq)]
pub struct MockGlCall {
    pub bytes: Vec<u8>,
    pub floats: Vec<f32>,
    pub integers: Vec<i64>,
    pub name: String,
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct MockGlDrawState {
    pub blend: bool,
    pub cull_face: bool,
    pub depth_test: bool,
    pub depth_write: bool,
    pub scissor_test: bool,
    pub scissor: [i32; 4],
}

#[derive(Clone, Debug)]
pub struct MockGlState {
    pub call_details: Vec<MockGlCall>,
    pub calls: Vec<String>,
    pub draws: Vec<MockGlDrawState>,
    pub enabled: HashSet<u32>,
    pub integers: HashMap<u32, i32>,
    pub info_log: String,
    pub next_name: u32,
    pub error: u32,
    pub shader_compile: bool,
    pub program_link: bool,
    pub framebuffer_status: u32,
    pub active_texture: u32,
    pub current_program: i32,
    pub framebuffer: i32,
    pub read_framebuffer: i32,
    pub draw_framebuffer: i32,
    pub renderbuffer: i32,
    pub array_buffer: i32,
    pub element_array_buffer: i32,
    pub vertex_array: i32,
    pub viewport: [i32; 4],
    pub scissor: [i32; 4],
    pub clear_color: [f32; 4],
    pub color_mask: [u8; 4],
    pub depth_mask: u8,
    pub textures: HashMap<(u32, u32), i32>,
    pub uniform_names: HashMap<String, i32>,
}

impl Default for MockGlState {
    fn default() -> Self {
        let mut integers = HashMap::new();
        integers.insert(glow::MAX_TEXTURE_SIZE, 4096);
        integers.insert(glow::MAX_COMBINED_TEXTURE_IMAGE_UNITS, 8);
        integers.insert(glow::MAX_SAMPLES, 4);
        integers.insert(glow::MAX_DRAW_BUFFERS, 4);
        integers.insert(glow::MAX_COLOR_ATTACHMENTS, 4);
        integers.insert(glow::MAX_RENDERBUFFER_SIZE, 4096);
        return MockGlState {
            call_details: Vec::new(),
            calls: Vec::new(),
            draws: Vec::new(),
            enabled: HashSet::new(),
            integers,
            info_log: String::new(),
            next_name: 1,
            error: glow::NO_ERROR,
            shader_compile: true,
            program_link: true,
            framebuffer_status: glow::FRAMEBUFFER_COMPLETE,
            active_texture: glow::TEXTURE0,
            current_program: 0,
            framebuffer: 0,
            read_framebuffer: 0,
            draw_framebuffer: 0,
            renderbuffer: 0,
            array_buffer: 0,
            element_array_buffer: 0,
            vertex_array: 0,
            viewport: [0, 0, 640, 480],
            scissor: [0, 0, 640, 480],
            clear_color: [0.0; 4],
            color_mask: [1; 4],
            depth_mask: 1,
            textures: HashMap::new(),
            uniform_names: HashMap::new(),
        };
    }
}

thread_local! {
    static MOCK: RefCell<MockGlState> = RefCell::new(MockGlState::default());
}

fn record(call: impl Into<String>) {
    record_call(call, &[], &[], Vec::new(), String::new());
}

fn record_call(
    name: impl Into<String>,
    integers: &[i64],
    floats: &[f32],
    bytes: Vec<u8>,
    text: String,
) {
    let name = name.into();
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state.calls.push(name.clone());
        state.call_details.push(MockGlCall {
            bytes,
            floats: floats.to_vec(),
            integers: integers.to_vec(),
            name,
            text,
        });
    });
}

unsafe fn copy_bytes(data: *const c_void, size: usize) -> Vec<u8> {
    if data.is_null() || size == 0 {
        return Vec::new();
    }
    // SAFETY: mock GL entry points receive a live client buffer for the declared call size.
    return unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size) }.to_vec();
}

fn pixel_byte_len(width: i32, height: i32, format: u32, kind: u32) -> usize {
    let channels = match format {
        glow::RED | glow::RED_INTEGER | glow::DEPTH_COMPONENT => 1,
        glow::RG | glow::RG_INTEGER => 2,
        glow::RGB | glow::RGB_INTEGER => 3,
        glow::RGBA | glow::RGBA_INTEGER => 4,
        _ => 0,
    };
    let component_size = match kind {
        glow::BYTE | glow::UNSIGNED_BYTE => 1,
        glow::SHORT | glow::UNSIGNED_SHORT | glow::HALF_FLOAT => 2,
        glow::INT | glow::UNSIGNED_INT | glow::FLOAT => 4,
        _ => 0,
    };
    return width.max(0) as usize * height.max(0) as usize * channels * component_size;
}

fn next_name() -> u32 {
    return MOCK.with(|state| {
        let mut state = state.borrow_mut();
        let value = state.next_name;
        state.next_name += 1;
        value
    });
}

pub fn reset() {
    MOCK.with(|state| *state.borrow_mut() = MockGlState::default());
}

pub fn snapshot() -> MockGlState {
    return MOCK.with(|state| state.borrow().clone());
}

pub fn calls_named(name: &str) -> usize {
    return MOCK.with(|state| {
        state
            .borrow()
            .calls
            .iter()
            .filter(|call| match name {
                "delete_name" => {
                    call.starts_with("delete_")
                        && call.as_str() != "delete_program"
                        && call.as_str() != "delete_shader"
                }
                "delete_one" => {
                    call.as_str() == "delete_program" || call.as_str() == "delete_shader"
                }
                "gen" => call.starts_with("gen_"),
                _ => call.as_str() == name,
            })
            .count()
    });
}

pub fn clear_calls() {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state.calls.clear();
        state.call_details.clear();
        state.draws.clear();
    });
}

pub fn calls_with(name: &str) -> Vec<MockGlCall> {
    return MOCK.with(|state| {
        state
            .borrow()
            .call_details
            .iter()
            .filter(|call| call.name == name)
            .cloned()
            .collect()
    });
}

pub fn last_call(name: &str) -> MockGlCall {
    return calls_with(name)
        .into_iter()
        .last()
        .unwrap_or_else(|| panic!("missing mock GL call {name}"));
}

pub fn set_integer(parameter: u32, value: i32) {
    MOCK.with(|state| {
        state.borrow_mut().integers.insert(parameter, value);
    });
}

pub fn set_info_log(value: &str) {
    MOCK.with(|state| state.borrow_mut().info_log = value.to_string());
}

pub fn set_framebuffer_status(value: u32) {
    MOCK.with(|state| state.borrow_mut().framebuffer_status = value);
}

pub fn set_shader_compile(value: bool) {
    MOCK.with(|state| state.borrow_mut().shader_compile = value);
}

pub fn set_program_link(value: bool) {
    MOCK.with(|state| state.borrow_mut().program_link = value);
}

pub fn make_gl() -> Rc<glow::Context> {
    reset();
    // SAFETY: every function used by these tests is backed by an ABI-compatible local mock below.
    return Rc::new(unsafe { glow::Context::from_loader_function(load) });
}

pub fn proc_address(name: &str) -> *const c_void {
    return load(name);
}

pub fn make_context_state() -> Rc<GlContextState> {
    return create_gl_context_state(make_gl()).expect("mock context state");
}

pub fn make_state() -> GlRenderState {
    return create_gl_render_state(make_context_state(), None);
}

pub fn make_state_options() -> flight_render_gl::GlRenderStateOptions {
    return flight_render_gl::GlRenderStateOptions::default();
}

pub fn make_delete_queue() -> flight_render_gl::GlDeleteQueue {
    return flight_render_gl::GlDeleteQueue::default();
}

pub fn make_proxies() -> flight_render::RenderProxies2D<GlRenderState> {
    return flight_render::RenderProxies2D::default();
}

pub fn make_render_texture(width: u32, height: u32) -> flight_render::RenderTexture {
    return flight_render::create_render_texture(&flight_render::CreateRenderTextureOptions {
        width,
        height,
        ..flight_render::CreateRenderTextureOptions::default()
    });
}

pub fn make_external_options(
    width: u32,
    height: u32,
) -> flight_render::CreateExternalTextureOptions {
    return flight_render::CreateExternalTextureOptions {
        width,
        height,
        ..flight_render::CreateExternalTextureOptions::default()
    };
}

pub fn make_compressed_support() -> flight_render_gl::GlCompressedTextureSupport {
    return flight_render_gl::GlCompressedTextureSupport::default();
}

pub fn make_proxy(state: &mut GlRenderState) -> flight_render::RenderProxy2D<GlRenderState> {
    let source: flight_node::NodeRef = flight_scene2d::create_display_object();
    return flight_render::create_render_proxy_2d(state, &source);
}

pub fn make_target_descriptor(width: f32, height: f32) -> flight_render::RenderTargetDescriptor {
    return flight_render::RenderTargetDescriptor {
        width,
        height,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
}

pub fn make_texture_target(
    state: &GlRenderState,
    width: f32,
    height: f32,
) -> flight_render_gl::GlTextureRenderTarget {
    return flight_render_gl::create_gl_texture_render_target(
        state,
        &make_target_descriptor(width, height),
        None,
    )
    .expect("mock target allocation")
    .expect("supported mock target");
}

pub fn make_image_resource(
    width: u32,
    height: u32,
    ready: bool,
) -> flight_entity::Ref<flight_image::ImageResource> {
    let source = Arc::new(flight_host::HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(flight_render_gl::GlImageSourceToken {
            width,
            height,
            ready,
            pixels: Arc::new(vec![255; width as usize * height as usize * 4]),
        }),
    });
    return flight_image::create_image_resource(
        source,
        &flight_image::create_image_resolver_state(),
    );
}



// ---- scene2d-gl helpers (TS `glTestHelper.ts` + per-file fixtures) ----

/// TS `createGlState`: a mock-backed render state whose drawing buffer (here the live viewport) is
/// the helper canvas's 200x100.
pub fn create_gl_state() -> GlRenderState {
    let state = make_state();
    set_viewport(0, 0, 200, 100);
    return state;
}

/// TS `createGlState` with explicit options (hosts, registries).
pub fn create_gl_state_with(options: &flight_render_gl::GlRenderStateOptions) -> GlRenderState {
    let state = create_gl_render_state(make_context_state(), Some(options));
    set_viewport(0, 0, 200, 100);
    return state;
}

// flight-lint: allow(test-default-call) test scaffolding constructs Rust-only option bags and guard contexts that have no source create function
pub fn test_default<T: Default>() -> T {
    return T::default();
}

pub fn display_node() -> flight_node::NodeRef {
    return flight_scene2d::create_display_object();
}

/// TS `createGlState` + `setTestHosts`: a state whose canvas and image hosts allocate recording
/// surfaces wrapped as GL-uploadable images.
pub fn create_gl_state_with_hosts() -> (GlRenderState, TestCanvasHost) {
    let mut state = create_gl_state();
    let canvas_host = create_test_canvas_host();
    state.canvas_host = Some(canvas_host.host.clone());
    state.image_host = Some(create_test_image_host());
    return (state, canvas_host);
}

pub fn set_viewport(x: i32, y: i32, width: i32, height: i32) {
    MOCK.with(|state| state.borrow_mut().viewport = [x, y, width, height]);
}

pub fn count_calls(name: &str) -> usize {
    return MOCK.with(|state| state.borrow().calls.iter().filter(|call| call.as_str() == name).count());
}

pub fn call_names() -> Vec<String> {
    return MOCK.with(|state| state.borrow().calls.clone());
}

pub fn bytes_as_f32(bytes: &[u8]) -> Vec<f32> {
    return bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
}

pub fn make_scene2d_proxy(
    state: &mut GlRenderState,
    source: flight_node::NodeRef,
) -> flight_render::RenderProxy2D<GlRenderState> {
    return flight_render::create_render_proxy_2d(state, &source);
}

pub fn make_color_scale_bias(
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
    red_bias: f32,
    green_bias: f32,
    blue_bias: f32,
    alpha_bias: f32,
) -> flight_materials::ColorScaleBias {
    let mut out = flight_materials::contract::create_color_scale_bias();
    out.red_scale = red_scale;
    out.green_scale = green_scale;
    out.blue_scale = blue_scale;
    out.alpha_scale = alpha_scale;
    out.red_bias = red_bias;
    out.green_bias = green_bias;
    out.blue_bias = blue_bias;
    out.alpha_bias = alpha_bias;
    return out;
}

pub fn make_ct(scale: f32) -> flight_materials::ColorScaleBias {
    return make_color_scale_bias(scale, scale, scale, 1.0, 0.0, 0.0, 0.0, 0.0);
}

pub fn make_tint_material_data(tint: u32) -> flight_materials::TintMaterialData {
    let mut out: flight_materials::TintMaterialData = flight_entity::allocate_entity();
    out.tint = tint;
    return out;
}

/// A fake host 2D context recording every drawing call as `name(args)` (TS jsdom canvas + vi spies).
/// `measure_text` reports `char_width` per character.
pub struct RecordingCanvas2D {
    pub calls: std::sync::Mutex<Vec<String>>,
    pub char_width: f32,
    pub height: f32,
    pub width: f32,
}

impl RecordingCanvas2D {
    fn push(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl flight_scene2d_gl::Canvas2DContext for RecordingCanvas2D {
    fn begin_path(&self) {
        self.push("beginPath()".to_string());
    }
    fn clear_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.push(format!("clearRect({x},{y},{width},{height})"));
    }
    fn clip(&self) {
        self.push("clip()".to_string());
    }
    fn fill_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.push(format!("fillRect({x},{y},{width},{height})"));
    }
    fn fill_text(&self, text: &str, x: f32, y: f32) {
        self.push(format!("fillText({text},{x},{y})"));
    }
    fn line_to(&self, x: f32, y: f32) {
        self.push(format!("lineTo({x},{y})"));
    }
    fn measure_text(&self, text: &str) -> f32 {
        return text.chars().count() as f32 * self.char_width;
    }
    fn move_to(&self, x: f32, y: f32) {
        self.push(format!("moveTo({x},{y})"));
    }
    fn rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.push(format!("rect({x},{y},{width},{height})"));
    }
    fn restore(&self) {
        self.push("restore()".to_string());
    }
    fn save(&self) {
        self.push("save()".to_string());
    }
    fn set_fill_style(&self, style: &str) {
        self.push(format!("fillStyle={style}"));
    }
    fn set_font(&self, font: &str) {
        self.push(format!("font={font}"));
    }
    fn set_global_alpha(&self, alpha: f32) {
        self.push(format!("globalAlpha={alpha}"));
    }
    fn set_line_width(&self, width: f32) {
        self.push(format!("lineWidth={width}"));
    }
    fn set_stroke_style(&self, style: &str) {
        self.push(format!("strokeStyle={style}"));
    }
    fn set_text_align(&self, align: &str) {
        self.push(format!("textAlign={align}"));
    }
    fn set_text_baseline(&self, baseline: &str) {
        self.push(format!("textBaseline={baseline}"));
    }
    fn set_transform(&self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) {
        self.push(format!("setTransform({a},{b},{c},{d},{e},{f})"));
    }
    fn stroke(&self) {
        self.push("stroke()".to_string());
    }
    fn stroke_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.push(format!("strokeRect({x},{y},{width},{height})"));
    }
}

/// The recording context behind a surface made by `make_canvas_surface`.
pub fn surface_canvas(surface: &flight_entity::Ref<flight_surface::CanvasSurface>) -> Arc<RecordingCanvas2D> {
    let id = flight_entity::get_entity_id(&*surface.read().unwrap());
    return CANVASES.with(|canvases| canvases.borrow().get(&id).cloned().expect("recording canvas"));
}

/// Every recorded call on a surface's context.
pub fn surface_calls(surface: &flight_entity::Ref<flight_surface::CanvasSurface>) -> Vec<String> {
    return surface_canvas(surface).calls.lock().unwrap().clone();
}

thread_local! {
    static CANVASES: RefCell<HashMap<u64, Arc<RecordingCanvas2D>>> = RefCell::new(HashMap::new());
}

pub fn make_canvas_surface(width: f32, height: f32) -> flight_entity::Ref<flight_surface::CanvasSurface> {
    let surface: flight_entity::Ref<flight_surface::CanvasSurface> =
        flight_surface::allocate_surface(None);
    let canvas = Arc::new(RecordingCanvas2D {
        calls: std::sync::Mutex::new(Vec::new()),
        char_width: 6.0,
        height,
        width,
    });
    let context: Arc<dyn flight_scene2d_gl::Canvas2DContext> = canvas.clone();
    surface.write().unwrap().context =
        flight_scene2d_gl::create_canvas_2d_context_handle(Arc::new(()), context);
    let id = flight_entity::get_entity_id(&*surface.read().unwrap());
    CANVASES.with(|canvases| canvases.borrow_mut().insert(id, canvas));
    return surface;
}

/// A canvas host whose surfaces are counted on creation and destruction.
pub struct TestCanvasHost {
    pub host: flight_surface::HostCanvasCapability,
    pub created: Arc<std::sync::Mutex<Vec<(f32, f32)>>>,
    pub destroyed: Arc<std::sync::Mutex<usize>>,
}

pub fn create_test_canvas_host() -> TestCanvasHost {
    return create_test_canvas_host_with(true);
}

pub fn create_test_canvas_host_with(allocates: bool) -> TestCanvasHost {
    let created = Arc::new(std::sync::Mutex::new(Vec::new()));
    let destroyed = Arc::new(std::sync::Mutex::new(0));
    let created_calls = created.clone();
    let destroyed_calls = destroyed.clone();
    let host = flight_surface::HostCanvasCapability {
        provider: Arc::new(()),
        acquire: Arc::new(|_, _| None),
        create: Arc::new(|_, _, _, _| None),
        create_surface: Arc::new(move |width, height| {
            created_calls.lock().unwrap().push((width, height));
            if !allocates {
                return None;
            }
            return Some(make_canvas_surface(width, height));
        }),
        destroy_surface: Arc::new(move |_| {
            *destroyed_calls.lock().unwrap() += 1;
        }),
        release: Arc::new(|_| {}),
    };
    return TestCanvasHost {
        host,
        created,
        destroyed,
    };
}

/// An image host wrapping each surface in an ImageResource sized like the surface's context.
pub fn create_test_image_host() -> flight_image::HostImageCapability {
    return flight_image::HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: Some(Arc::new(|surface: &flight_surface::SurfaceRef| {
            let id = flight_entity::get_entity_id(&*surface.read().unwrap());
            let (width, height) = CANVASES.with(|canvases| {
                canvases
                    .borrow()
                    .get(&id)
                    .map_or((1.0, 1.0), |canvas| (canvas.width, canvas.height))
            });
            let width = width.max(1.0) as u32;
            let height = height.max(1.0) as u32;
            let source = Arc::new(flight_host::HostImageSource {
                provider: Arc::new(()),
                handle: Arc::new(flight_render_gl::GlImageSourceToken {
                    width,
                    height,
                    ready: true,
                    pixels: Arc::new(vec![255; width as usize * height as usize * 4]),
                }),
            });
            return flight_image::create_image_resource(
                source,
                &flight_image::create_image_resolver_state(),
            );
        })),
        load_image_from_url: Arc::new(|_, _, _| {
            return Box::pin(std::future::pending());
        }),
        provider: Arc::new(()),
    };
}

/// A 2D texture over a GL-uploadable host image of the given size (TS `createImageResource(img)`
/// with the test dimension resolver).
pub fn make_image_texture_2d(width: u32, height: u32) -> flight_texture::Texture2D {
    let image = make_image_resource(width, height, true);
    {
        let mut guard = image.write().unwrap();
        let fields = flight_texture::TextureSource::texture_source_fields_mut(&mut *guard);
        fields.width = width;
        fields.height = height;
    }
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(image as flight_texture::TextureSourceRef);
    return texture;
}

/// A 2D texture over a CPU bitmap source (TS `createTexture({ dimension: '2d', source: createBitmap })`).
pub fn make_bitmap_texture(width: u32, height: u32) -> flight_entity::Ref<flight_texture::Texture> {
    let bitmap = Arc::new(std::sync::RwLock::new(flight_bitmap::create_bitmap(width, height, None)));
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(bitmap as flight_texture::TextureSourceRef);
    return Arc::new(std::sync::RwLock::new(flight_texture::Texture::Texture2D(texture)));
}

/// TS `makeAtlas`: a 64x64 image atlas with one region at the origin.
pub fn make_atlas(region_width: f32, region_height: f32) -> flight_entity::Ref<flight_textureatlas::TextureAtlas> {
    let atlas = flight_textureatlas::create_texture_atlas();
    {
        let mut atlas = atlas.write().unwrap();
        flight_textureatlas::add_texture_atlas_region(
            &mut atlas,
            0.0,
            0.0,
            region_width,
            region_height,
            None,
            None,
            None,
        );
        atlas.texture = Some(Arc::new(std::sync::RwLock::new(make_image_texture_2d(64, 64))));
    }
    return atlas;
}

fn load(name: &str) -> *const c_void {
    let pointer = match name {
        "glGetString" => gl_get_string as *const (),
        "glGetStringi" => gl_get_string_i as *const (),
        "glGetIntegerv" => gl_get_integer_v as *const (),
        "glGetBooleanv" => gl_get_boolean_v as *const (),
        "glGetFloatv" => gl_get_float_v as *const (),
        "glGetError" => gl_get_error as *const (),
        "glGenBuffers" => gl_gen_buffers as *const (),
        "glGenTextures" => gl_gen_textures as *const (),
        "glGenFramebuffers" => gl_gen_framebuffers as *const (),
        "glGenRenderbuffers" => gl_gen_renderbuffers as *const (),
        "glGenVertexArrays" => gl_gen_vertex_arrays as *const (),
        "glCreateProgram" => gl_create_program as *const (),
        "glCreateShader" => gl_create_shader as *const (),
        "glGetShaderiv" => gl_get_shader_iv as *const (),
        "glGetProgramiv" => gl_get_program_iv as *const (),
        "glGetShaderInfoLog" | "glGetProgramInfoLog" => gl_get_info_log as *const (),
        "glGetAttribLocation" => gl_get_attrib_location as *const (),
        "glGetUniformLocation" => gl_get_uniform_location as *const (),
        "glCheckFramebufferStatus" => gl_check_framebuffer_status as *const (),
        "glIsEnabled" => gl_is_enabled as *const (),
        "glBindBuffer" => gl_bind_buffer as *const (),
        "glBindFramebuffer" => gl_bind_framebuffer as *const (),
        "glBindRenderbuffer" => gl_bind_renderbuffer as *const (),
        "glBindTexture" => gl_bind_texture as *const (),
        "glBindVertexArray" => gl_bind_vertex_array as *const (),
        "glActiveTexture" => gl_active_texture as *const (),
        "glUseProgram" => gl_use_program as *const (),
        "glEnable" => gl_enable as *const (),
        "glDisable" => gl_disable as *const (),
        "glDepthMask" => gl_depth_mask as *const (),
        "glColorMask" => gl_color_mask as *const (),
        "glClearColor" => gl_clear_color as *const (),
        "glViewport" => gl_viewport as *const (),
        "glScissor" => gl_scissor as *const (),
        "glBufferData" => gl_buffer_data as *const (),
        "glBufferSubData" => gl_buffer_sub_data as *const (),
        "glTexImage2D" => gl_tex_image_2d as *const (),
        "glTexSubImage2D" => gl_tex_sub_image_2d as *const (),
        "glTexImage3D" => gl_tex_image_3d as *const (),
        "glTexSubImage3D" => gl_tex_sub_image_3d as *const (),
        "glTexStorage3D" => gl_tex_storage_3d as *const (),
        "glCompressedTexImage2D" => gl_compressed_tex_image_2d as *const (),
        "glCompressedTexSubImage3D" => gl_compressed_tex_sub_image_3d as *const (),
        "glTexParameteri" => gl_tex_parameter_i as *const (),
        "glTexParameterf" => gl_tex_parameter_f as *const (),
        "glGenerateMipmap" => gl_generate_mipmap as *const (),
        "glFramebufferTexture2D" => gl_framebuffer_texture_2d as *const (),
        "glFramebufferRenderbuffer" => gl_framebuffer_renderbuffer as *const (),
        "glRenderbufferStorage" => gl_renderbuffer_storage as *const (),
        "glRenderbufferStorageMultisample" => gl_renderbuffer_storage_multisample as *const (),
        "glDrawBuffers" => gl_draw_buffers as *const (),
        "glBlitFramebuffer" => gl_blit_framebuffer as *const (),
        "glClearBufferfv" => gl_clear_buffer_fv as *const (),
        "glClearBufferiv" => gl_clear_buffer_iv as *const (),
        "glClearBufferfi" => gl_clear_buffer_fi as *const (),
        "glReadBuffer" => gl_read_buffer as *const (),
        "glReadPixels" => gl_read_pixels as *const (),
        "glDrawElements" => gl_draw_elements as *const (),
        "glDrawArrays" => gl_draw_arrays as *const (),
        "glDrawArraysInstanced" => gl_draw_arrays_instanced as *const (),
        "glDrawElementsInstanced" => gl_draw_elements_instanced as *const (),
        "glBlendFunc" => gl_blend_func as *const (),
        "glBlendEquation" => gl_blend_equation as *const (),
        "glBlendFuncSeparate" => gl_blend_func_separate as *const (),
        "glBlendEquationSeparate" => gl_blend_equation_separate as *const (),
        "glUniform1i" => gl_uniform_1_i as *const (),
        "glUniform1f" => gl_uniform_1_f as *const (),
        "glUniform4f" => gl_uniform_4_f as *const (),
        "glUniform4fv" => gl_uniform_4_fv as *const (),
        "glUniformMatrix3fv" => gl_uniform_matrix_3_fv as *const (),
        "glEnableVertexAttribArray" => gl_enable_vertex_attrib_array as *const (),
        "glVertexAttribPointer" => gl_vertex_attrib_pointer as *const (),
        "glVertexAttribDivisor" => gl_vertex_attrib_divisor as *const (),
        "glDisableVertexAttribArray" => gl_disable_vertex_attrib_array as *const (),
        "glUniform2f" => gl_uniform_2_f as *const (),
        "glUniform3f" => gl_uniform_3_f as *const (),
        "glUniform1fv" => gl_uniform_1_fv as *const (),
        "glUniformMatrix4fv" => gl_uniform_matrix_4_fv as *const (),
        "glDeleteBuffers" => gl_delete_buffers as *const (),
        "glDeleteTextures" => gl_delete_textures as *const (),
        "glDeleteFramebuffers" => gl_delete_framebuffers as *const (),
        "glDeleteRenderbuffers" => gl_delete_renderbuffers as *const (),
        "glDeleteVertexArrays" => gl_delete_vertex_arrays as *const (),
        "glDeleteProgram" => gl_delete_program as *const (),
        "glDeleteShader" => gl_delete_shader as *const (),
        "glShaderSource" => gl_shader_source as *const (),
        "glCompileShader" => gl_compile_shader as *const (),
        "glLinkProgram" => gl_link_program as *const (),
        "glAttachShader" => gl_attach_shader as *const (),
        "glFlush" => gl_flush as *const (),
        "glClear" => gl_clear as *const (),
        "glCullFace" => gl_cull_face as *const (),
        "glFrontFace" => gl_front_face as *const (),
        "glDepthFunc" => gl_depth_func as *const (),
        "glStencilMask" => gl_stencil_mask as *const (),
        "glStencilFunc" => gl_stencil_func as *const (),
        "glStencilOp" => gl_stencil_op as *const (),
        "glStencilMaskSeparate" => gl_stencil_mask_separate as *const (),
        "glStencilFuncSeparate" => gl_stencil_func_separate as *const (),
        "glStencilOpSeparate" => gl_stencil_op_separate as *const (),
        "glPixelStorei" => gl_pixel_store_i as *const (),
        _ => std::ptr::null(),
    };
    return pointer.cast();
}

static VERSION: &[u8] = b"4.6 MockGL\0";

unsafe extern "system" fn gl_get_string(_name: u32) -> *const u8 {
    return VERSION.as_ptr();
}

unsafe extern "system" fn gl_get_string_i(_name: u32, _index: u32) -> *const u8 {
    return std::ptr::null();
}

unsafe extern "system" fn gl_get_integer_v(parameter: u32, output: *mut i32) {
    let values = MOCK.with(|state| {
        let state = state.borrow();
        match parameter {
            glow::NUM_EXTENSIONS => vec![0],
            glow::ACTIVE_TEXTURE => vec![state.active_texture as i32],
            glow::CURRENT_PROGRAM => vec![state.current_program],
            glow::FRAMEBUFFER_BINDING => vec![state.framebuffer],
            glow::READ_FRAMEBUFFER_BINDING => vec![state.read_framebuffer],
            glow::RENDERBUFFER_BINDING => vec![state.renderbuffer],
            glow::ARRAY_BUFFER_BINDING => vec![state.array_buffer],
            glow::ELEMENT_ARRAY_BUFFER_BINDING => vec![state.element_array_buffer],
            glow::VERTEX_ARRAY_BINDING => vec![state.vertex_array],
            glow::VIEWPORT => state.viewport.to_vec(),
            glow::SCISSOR_BOX => state.scissor.to_vec(),
            glow::TEXTURE_BINDING_2D => vec![*state
                .textures
                .get(&(state.active_texture, glow::TEXTURE_2D))
                .unwrap_or(&0)],
            glow::TEXTURE_BINDING_2D_ARRAY => vec![*state
                .textures
                .get(&(state.active_texture, glow::TEXTURE_2D_ARRAY))
                .unwrap_or(&0)],
            glow::TEXTURE_BINDING_3D => vec![*state
                .textures
                .get(&(state.active_texture, glow::TEXTURE_3D))
                .unwrap_or(&0)],
            glow::TEXTURE_BINDING_CUBE_MAP => vec![*state
                .textures
                .get(&(state.active_texture, glow::TEXTURE_CUBE_MAP))
                .unwrap_or(&0)],
            _ => vec![*state.integers.get(&parameter).unwrap_or(&0)],
        }
    });
    for (index, value) in values.into_iter().enumerate() {
        // SAFETY: glow supplies enough storage for the queried GL parameter.
        unsafe { output.add(index).write(value) };
    }
}

unsafe extern "system" fn gl_get_boolean_v(parameter: u32, output: *mut u8) {
    let values = MOCK.with(|state| {
        let state = state.borrow();
        match parameter {
            glow::DEPTH_WRITEMASK => vec![state.depth_mask],
            glow::COLOR_WRITEMASK => state.color_mask.to_vec(),
            _ => vec![0],
        }
    });
    for (index, value) in values.into_iter().enumerate() {
        // SAFETY: glow supplies enough storage for the queried GL parameter.
        unsafe { output.add(index).write(value) };
    }
}

unsafe extern "system" fn gl_get_float_v(parameter: u32, output: *mut f32) {
    let values = MOCK.with(|state| {
        let state = state.borrow();
        match parameter {
            glow::COLOR_CLEAR_VALUE => state.clear_color.to_vec(),
            _ => vec![state.integers.get(&parameter).copied().unwrap_or(1) as f32],
        }
    });
    for (index, value) in values.into_iter().enumerate() {
        // SAFETY: glow supplies enough storage for the queried GL parameter.
        unsafe { output.add(index).write(value) };
    }
}

unsafe extern "system" fn gl_get_error() -> u32 {
    return MOCK.with(|state| {
        let mut state = state.borrow_mut();
        let value = state.error;
        state.error = glow::NO_ERROR;
        value
    });
}

unsafe fn gen_names(count: i32, output: *mut u32, call: &str) {
    let mut names = Vec::new();
    for index in 0..count {
        let name = next_name();
        // SAFETY: GL callers provide `count` writable name slots.
        unsafe { output.add(index as usize).write(name) };
        names.push(i64::from(name));
    }
    record_call(call, &names, &[], Vec::new(), String::new());
}

unsafe extern "system" fn gl_gen_buffers(count: i32, output: *mut u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { gen_names(count, output, "gen_buffers") };
}

unsafe extern "system" fn gl_gen_framebuffers(count: i32, output: *mut u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { gen_names(count, output, "gen_framebuffers") };
}

unsafe extern "system" fn gl_gen_renderbuffers(count: i32, output: *mut u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { gen_names(count, output, "gen_renderbuffers") };
}

unsafe extern "system" fn gl_gen_textures(count: i32, output: *mut u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { gen_names(count, output, "gen_textures") };
}

unsafe extern "system" fn gl_gen_vertex_arrays(count: i32, output: *mut u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { gen_names(count, output, "gen_vertex_arrays") };
}

unsafe extern "system" fn gl_create_program() -> u32 {
    let name = next_name();
    record_call(
        "create_program",
        &[i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
    return name;
}

unsafe extern "system" fn gl_create_shader(kind: u32) -> u32 {
    let name = next_name();
    record_call(
        "create_shader",
        &[i64::from(kind), i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
    return name;
}

unsafe extern "system" fn gl_get_shader_iv(_shader: u32, parameter: u32, output: *mut i32) {
    let value = MOCK.with(|state| match parameter {
        glow::COMPILE_STATUS => i32::from(state.borrow().shader_compile),
        glow::INFO_LOG_LENGTH => state.borrow().info_log.len() as i32 + 1,
        _ => 0,
    });
    // SAFETY: glow supplies one writable integer.
    unsafe { output.write(value) };
}

unsafe extern "system" fn gl_get_program_iv(_program: u32, parameter: u32, output: *mut i32) {
    let value = MOCK.with(|state| match parameter {
        glow::LINK_STATUS => i32::from(state.borrow().program_link),
        glow::INFO_LOG_LENGTH => state.borrow().info_log.len() as i32 + 1,
        _ => 0,
    });
    // SAFETY: glow supplies one writable integer.
    unsafe { output.write(value) };
}

unsafe extern "system" fn gl_get_info_log(
    _name: u32,
    capacity: i32,
    length: *mut i32,
    output: *mut c_char,
) {
    let log = MOCK.with(|state| state.borrow().info_log.as_bytes().to_vec());
    let written = log.len().min(capacity.saturating_sub(1).max(0) as usize);
    if !output.is_null() {
        // SAFETY: glow allocates a buffer with `capacity` bytes for the info log.
        unsafe {
            std::ptr::copy_nonoverlapping(log.as_ptr().cast::<c_char>(), output, written);
            output.add(written).write(0);
        }
    }
    if !length.is_null() {
        // SAFETY: the optional length pointer is writable when non-null.
        unsafe { length.write(written as i32) };
    }
}

unsafe extern "system" fn gl_get_attrib_location(_program: u32, name: *const c_char) -> i32 {
    // SAFETY: GL names are nul-terminated for the duration of the call.
    let name = unsafe { std::ffi::CStr::from_ptr(name) }.to_bytes();
    return if name == b"a_texCoord" { 1 } else { 0 };
}

unsafe extern "system" fn gl_get_uniform_location(_program: u32, name: *const c_char) -> i32 {
    // SAFETY: GL names are nul-terminated for the duration of the call.
    let name = unsafe { std::ffi::CStr::from_ptr(name) }
        .to_string_lossy()
        .into_owned();
    return uniform_location_of(&name);
}

/// The stable mock location of a uniform name: each distinct name gets its own positive location.
pub fn uniform_location_of(name: &str) -> i32 {
    return MOCK.with(|state| {
        let mut state = state.borrow_mut();
        let next = state.uniform_names.len() as i32 + 1;
        *state.uniform_names.entry(name.to_string()).or_insert(next)
    });
}

/// The mock uniform location handle for `name`, as glow would return it.
pub fn uniform_location(name: &str) -> glow::NativeUniformLocation {
    return glow::NativeUniformLocation(uniform_location_of(name) as u32);
}

unsafe extern "system" fn gl_vertex_attrib_divisor(index: u32, divisor: u32) {
    record_call(
        "vertex_attrib_divisor",
        &[index.into(), divisor.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_disable_vertex_attrib_array(index: u32) {
    record_call(
        "disable_vertex_attrib_array",
        &[index.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_uniform_2_f(location: i32, x: f32, y: f32) {
    record_call("uniform_2_f32", &[location.into()], &[x, y], Vec::new(), String::new());
}

unsafe extern "system" fn gl_uniform_3_f(location: i32, x: f32, y: f32, z: f32) {
    record_call("uniform_3_f32", &[location.into()], &[x, y, z], Vec::new(), String::new());
}

unsafe extern "system" fn gl_uniform_1_fv(location: i32, count: i32, value: *const f32) {
    let values = if value.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: uniform1fv callers provide one float for each declared element.
        unsafe { std::slice::from_raw_parts(value, count as usize) }.to_vec()
    };
    record_call("uniform_1_f32_slice", &[location.into()], &values, Vec::new(), String::new());
}

unsafe extern "system" fn gl_uniform_matrix_4_fv(
    location: i32,
    count: i32,
    transpose: u8,
    value: *const f32,
) {
    let values = if value.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: uniformMatrix4fv callers provide sixteen floats for each declared matrix.
        unsafe { std::slice::from_raw_parts(value, count as usize * 16) }.to_vec()
    };
    record_call(
        "uniform_matrix_4_f32",
        &[location.into(), count.into(), transpose.into()],
        &values,
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_check_framebuffer_status(_target: u32) -> u32 {
    return MOCK.with(|state| state.borrow().framebuffer_status);
}

unsafe extern "system" fn gl_is_enabled(parameter: u32) -> u8 {
    return u8::from(MOCK.with(|state| state.borrow().enabled.contains(&parameter)));
}

unsafe extern "system" fn gl_bind_buffer(target: u32, name: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        if target == glow::ARRAY_BUFFER {
            state.array_buffer = name as i32;
        } else if target == glow::ELEMENT_ARRAY_BUFFER {
            state.element_array_buffer = name as i32;
        }
    });
    record_call(
        "bind_buffer",
        &[i64::from(target), i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_bind_framebuffer(target: u32, name: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        match target {
            glow::READ_FRAMEBUFFER => state.read_framebuffer = name as i32,
            glow::DRAW_FRAMEBUFFER => state.draw_framebuffer = name as i32,
            _ => {
                state.framebuffer = name as i32;
                state.read_framebuffer = name as i32;
                state.draw_framebuffer = name as i32;
            }
        }
    });
    record_call(
        "bind_framebuffer",
        &[i64::from(target), i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_bind_renderbuffer(target: u32, name: u32) {
    MOCK.with(|state| state.borrow_mut().renderbuffer = name as i32);
    record_call(
        "bind_renderbuffer",
        &[i64::from(target), i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_bind_texture(target: u32, name: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        let unit = state.active_texture;
        state.textures.insert((unit, target), name as i32);
    });
    record_call(
        "bind_texture",
        &[i64::from(target), i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_bind_vertex_array(name: u32) {
    MOCK.with(|state| state.borrow_mut().vertex_array = name as i32);
    record_call(
        "bind_vertex_array",
        &[i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_active_texture(unit: u32) {
    MOCK.with(|state| state.borrow_mut().active_texture = unit);
    record_call(
        "active_texture",
        &[i64::from(unit)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_use_program(name: u32) {
    MOCK.with(|state| state.borrow_mut().current_program = name as i32);
    record_call(
        "use_program",
        &[i64::from(name)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_enable(parameter: u32) {
    MOCK.with(|state| {
        state.borrow_mut().enabled.insert(parameter);
    });
    record_call(
        "enable",
        &[i64::from(parameter)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_disable(parameter: u32) {
    MOCK.with(|state| {
        state.borrow_mut().enabled.remove(&parameter);
    });
    record_call(
        "disable",
        &[i64::from(parameter)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_depth_mask(value: u8) {
    MOCK.with(|state| state.borrow_mut().depth_mask = value);
    record_call(
        "depth_mask",
        &[i64::from(value)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_color_mask(r: u8, g: u8, b: u8, a: u8) {
    MOCK.with(|state| state.borrow_mut().color_mask = [r, g, b, a]);
    record_call(
        "color_mask",
        &[i64::from(r), i64::from(g), i64::from(b), i64::from(a)],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_clear_color(r: f32, g: f32, b: f32, a: f32) {
    MOCK.with(|state| state.borrow_mut().clear_color = [r, g, b, a]);
    record_call("clear_color", &[], &[r, g, b, a], Vec::new(), String::new());
}

unsafe extern "system" fn gl_viewport(x: i32, y: i32, width: i32, height: i32) {
    MOCK.with(|state| state.borrow_mut().viewport = [x, y, width, height]);
    record_call(
        "viewport",
        &[
            i64::from(x),
            i64::from(y),
            i64::from(width),
            i64::from(height),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_scissor(x: i32, y: i32, width: i32, height: i32) {
    MOCK.with(|state| state.borrow_mut().scissor = [x, y, width, height]);
    record_call(
        "scissor",
        &[
            i64::from(x),
            i64::from(y),
            i64::from(width),
            i64::from(height),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_buffer_data(
    target: u32,
    size: isize,
    data: *const c_void,
    usage: u32,
) {
    record_call(
        "buffer_data",
        &[
            target.into(),
            size as i64,
            usage.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client buffer for the declared upload size.
        unsafe { copy_bytes(data, size.max(0) as usize) },
        String::new(),
    );
}
unsafe extern "system" fn gl_buffer_sub_data(
    target: u32,
    offset: isize,
    size: isize,
    data: *const c_void,
) {
    record_call(
        "buffer_sub_data",
        &[
            target.into(),
            offset as i64,
            size as i64,
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client buffer for the declared upload size.
        unsafe { copy_bytes(data, size.max(0) as usize) },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_image_2d(
    target: u32,
    level: i32,
    internal: i32,
    width: i32,
    height: i32,
    border: i32,
    format: u32,
    kind: u32,
    data: *const c_void,
) {
    record_call(
        "tex_image_2d",
        &[
            target.into(),
            level.into(),
            internal.into(),
            width.into(),
            height.into(),
            border.into(),
            format.into(),
            kind.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client pixel buffer for this upload extent.
        unsafe { copy_bytes(data, pixel_byte_len(width, height, format, kind)) },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_sub_image_2d(
    target: u32,
    level: i32,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    format: u32,
    kind: u32,
    data: *const c_void,
) {
    record_call(
        "tex_sub_image_2d",
        &[
            target.into(),
            level.into(),
            x.into(),
            y.into(),
            width.into(),
            height.into(),
            format.into(),
            kind.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client pixel buffer for this upload extent.
        unsafe { copy_bytes(data, pixel_byte_len(width, height, format, kind)) },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_image_3d(
    target: u32,
    level: i32,
    internal: i32,
    width: i32,
    height: i32,
    depth: i32,
    border: i32,
    format: u32,
    kind: u32,
    data: *const c_void,
) {
    record_call(
        "tex_image_3d",
        &[
            target.into(),
            level.into(),
            internal.into(),
            width.into(),
            height.into(),
            depth.into(),
            border.into(),
            format.into(),
            kind.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client pixel buffer for this upload extent.
        unsafe {
            copy_bytes(
                data,
                pixel_byte_len(width, height, format, kind) * depth.max(0) as usize,
            )
        },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_sub_image_3d(
    target: u32,
    level: i32,
    x: i32,
    y: i32,
    z: i32,
    width: i32,
    height: i32,
    depth: i32,
    format: u32,
    kind: u32,
    data: *const c_void,
) {
    record_call(
        "tex_sub_image_3d",
        &[
            target.into(),
            level.into(),
            x.into(),
            y.into(),
            z.into(),
            width.into(),
            height.into(),
            depth.into(),
            format.into(),
            kind.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client pixel buffer for this upload extent.
        unsafe {
            copy_bytes(
                data,
                pixel_byte_len(width, height, format, kind) * depth.max(0) as usize,
            )
        },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_storage_3d(
    target: u32,
    levels: i32,
    internal: u32,
    width: i32,
    height: i32,
    depth: i32,
) {
    record_call(
        "tex_storage_3d",
        &[
            target.into(),
            levels.into(),
            internal.into(),
            width.into(),
            height.into(),
            depth.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_compressed_tex_image_2d(
    target: u32,
    level: i32,
    internal: u32,
    width: i32,
    height: i32,
    border: i32,
    size: i32,
    data: *const c_void,
) {
    record_call(
        "compressed_tex_image_2d",
        &[
            target.into(),
            level.into(),
            internal.into(),
            width.into(),
            height.into(),
            border.into(),
            size.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client buffer for the declared compressed size.
        unsafe { copy_bytes(data, size.max(0) as usize) },
        String::new(),
    );
}
unsafe extern "system" fn gl_compressed_tex_sub_image_3d(
    target: u32,
    level: i32,
    x: i32,
    y: i32,
    z: i32,
    width: i32,
    height: i32,
    depth: i32,
    format: u32,
    size: i32,
    data: *const c_void,
) {
    record_call(
        "compressed_tex_sub_image_3d",
        &[
            target.into(),
            level.into(),
            x.into(),
            y.into(),
            z.into(),
            width.into(),
            height.into(),
            depth.into(),
            format.into(),
            size.into(),
            i64::from(data.is_null()),
        ],
        &[],
        // SAFETY: the mock observes the exact client buffer for the declared compressed size.
        unsafe { copy_bytes(data, size.max(0) as usize) },
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_parameter_i(target: u32, parameter: u32, value: i32) {
    record_call(
        "tex_parameter_i",
        &[target.into(), parameter.into(), value.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_tex_parameter_f(target: u32, parameter: u32, value: f32) {
    record_call(
        "tex_parameter_f",
        &[target.into(), parameter.into()],
        &[value],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_generate_mipmap(target: u32) {
    record_call(
        "generate_mipmap",
        &[target.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_framebuffer_texture_2d(
    target: u32,
    attachment: u32,
    texture_target: u32,
    texture: u32,
    level: i32,
) {
    record_call(
        "framebuffer_texture_2d",
        &[
            target.into(),
            attachment.into(),
            texture_target.into(),
            texture.into(),
            level.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_framebuffer_renderbuffer(
    target: u32,
    attachment: u32,
    renderbuffer_target: u32,
    renderbuffer: u32,
) {
    record_call(
        "framebuffer_renderbuffer",
        &[
            target.into(),
            attachment.into(),
            renderbuffer_target.into(),
            renderbuffer.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_renderbuffer_storage(
    target: u32,
    internal: u32,
    width: i32,
    height: i32,
) {
    record_call(
        "renderbuffer_storage",
        &[target.into(), internal.into(), width.into(), height.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_renderbuffer_storage_multisample(
    target: u32,
    samples: i32,
    internal: u32,
    width: i32,
    height: i32,
) {
    record_call(
        "renderbuffer_storage_multisample",
        &[
            target.into(),
            samples.into(),
            internal.into(),
            width.into(),
            height.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_draw_buffers(count: i32, buffers: *const u32) {
    let values = if buffers.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: GL callers provide `count` readable attachment enums.
        unsafe { std::slice::from_raw_parts(buffers, count as usize) }
            .iter()
            .map(|value| i64::from(*value))
            .collect()
    };
    record_call("draw_buffers", &values, &[], Vec::new(), String::new());
}
unsafe extern "system" fn gl_blit_framebuffer(
    sx0: i32,
    sy0: i32,
    sx1: i32,
    sy1: i32,
    dx0: i32,
    dy0: i32,
    dx1: i32,
    dy1: i32,
    mask: u32,
    filter: u32,
) {
    record_call(
        "blit_framebuffer",
        &[
            sx0.into(),
            sy0.into(),
            sx1.into(),
            sy1.into(),
            dx0.into(),
            dy0.into(),
            dx1.into(),
            dy1.into(),
            mask.into(),
            filter.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_clear_buffer_fv(buffer: u32, draw_buffer: i32, values: *const f32) {
    let length = if buffer == glow::COLOR { 4 } else { 1 };
    let values = if values.is_null() {
        Vec::new()
    } else {
        // SAFETY: clearBufferfv callers provide one or four floats according to the buffer enum.
        unsafe { std::slice::from_raw_parts(values, length) }.to_vec()
    };
    record_call(
        "clear_buffer_f32",
        &[buffer.into(), draw_buffer.into()],
        &values,
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_clear_buffer_iv(buffer: u32, draw_buffer: i32, values: *const i32) {
    let length = if buffer == glow::COLOR { 4 } else { 1 };
    let mut integers = vec![buffer.into(), draw_buffer.into()];
    if !values.is_null() {
        // SAFETY: clearBufferiv callers provide one or four integers according to the buffer enum.
        integers.extend(
            unsafe { std::slice::from_raw_parts(values, length) }
                .iter()
                .map(|value| i64::from(*value)),
        );
    }
    record_call(
        "clear_buffer_i32",
        &integers,
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_clear_buffer_fi(
    buffer: u32,
    draw_buffer: i32,
    depth: f32,
    stencil: i32,
) {
    record_call(
        "clear_buffer_depth_stencil",
        &[buffer.into(), draw_buffer.into(), stencil.into()],
        &[depth],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_read_buffer(source: u32) {
    record_call(
        "read_buffer",
        &[source.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_read_pixels(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    format: u32,
    kind: u32,
    output: *mut c_void,
) {
    if !output.is_null() {
        // SAFETY: the test renderer requests RGBA pixels and provides at least this many bytes.
        unsafe { std::ptr::write_bytes(output, 0, (width.max(0) * height.max(0) * 4) as usize) };
    }
    record_call(
        "read_pixels",
        &[
            x.into(),
            y.into(),
            width.into(),
            height.into(),
            format.into(),
            kind.into(),
            i64::from(output.is_null()),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_draw_elements(
    mode: u32,
    count: i32,
    kind: u32,
    indices: *const c_void,
) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        let draw = MockGlDrawState {
            blend: state.enabled.contains(&glow::BLEND),
            cull_face: state.enabled.contains(&glow::CULL_FACE),
            depth_test: state.enabled.contains(&glow::DEPTH_TEST),
            depth_write: state.depth_mask != 0,
            scissor_test: state.enabled.contains(&glow::SCISSOR_TEST),
            scissor: state.scissor,
        };
        state.draws.push(draw);
    });
    record_call(
        "draw_elements",
        &[
            mode.into(),
            count.into(),
            kind.into(),
            indices as usize as i64,
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_draw_arrays(mode: u32, first: i32, count: i32) {
    record_call(
        "draw_arrays",
        &[mode.into(), first.into(), count.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_draw_arrays_instanced(
    mode: u32,
    first: i32,
    count: i32,
    instances: i32,
) {
    record_call(
        "draw_arrays_instanced",
        &[mode.into(), first.into(), count.into(), instances.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_draw_elements_instanced(
    mode: u32,
    count: i32,
    kind: u32,
    indices: *const c_void,
    instances: i32,
) {
    record_call(
        "draw_elements_instanced",
        &[
            mode.into(),
            count.into(),
            kind.into(),
            indices as usize as i64,
            instances.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_blend_func(source: u32, destination: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state.integers.insert(glow::BLEND_SRC_RGB, source as i32);
        state
            .integers
            .insert(glow::BLEND_DST_RGB, destination as i32);
        state.integers.insert(glow::BLEND_SRC_ALPHA, source as i32);
        state
            .integers
            .insert(glow::BLEND_DST_ALPHA, destination as i32);
    });
    record_call(
        "blend_func",
        &[source.into(), destination.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_blend_equation(equation: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state
            .integers
            .insert(glow::BLEND_EQUATION_RGB, equation as i32);
        state
            .integers
            .insert(glow::BLEND_EQUATION_ALPHA, equation as i32);
    });
    record_call(
        "blend_equation",
        &[equation.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_blend_func_separate(
    source_rgb: u32,
    destination_rgb: u32,
    source_alpha: u32,
    destination_alpha: u32,
) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state
            .integers
            .insert(glow::BLEND_SRC_RGB, source_rgb as i32);
        state
            .integers
            .insert(glow::BLEND_DST_RGB, destination_rgb as i32);
        state
            .integers
            .insert(glow::BLEND_SRC_ALPHA, source_alpha as i32);
        state
            .integers
            .insert(glow::BLEND_DST_ALPHA, destination_alpha as i32);
    });
    record_call(
        "blend_func_separate",
        &[
            source_rgb.into(),
            destination_rgb.into(),
            source_alpha.into(),
            destination_alpha.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_blend_equation_separate(rgb: u32, alpha: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state.integers.insert(glow::BLEND_EQUATION_RGB, rgb as i32);
        state
            .integers
            .insert(glow::BLEND_EQUATION_ALPHA, alpha as i32);
    });
    record_call(
        "blend_equation_separate",
        &[rgb.into(), alpha.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_uniform_1_i(location: i32, value: i32) {
    record_call(
        "uniform_1_i32",
        &[location.into(), value.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_uniform_1_f(location: i32, value: f32) {
    record_call(
        "uniform_1_f32",
        &[location.into()],
        &[value],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_uniform_4_f(location: i32, x: f32, y: f32, z: f32, w: f32) {
    record_call(
        "uniform_4_f32",
        &[location.into()],
        &[x, y, z, w],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_uniform_4_fv(location: i32, count: i32, value: *const f32) {
    let values = if value.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: uniform4fv callers provide four floats for each declared vector.
        unsafe { std::slice::from_raw_parts(value, count as usize * 4) }.to_vec()
    };
    record_call(
        "uniform_4_f32",
        &[location.into(), count.into()],
        &values,
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_uniform_matrix_3_fv(
    location: i32,
    count: i32,
    transpose: u8,
    value: *const f32,
) {
    let values = if value.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: uniformMatrix3fv callers provide nine floats for each declared matrix.
        unsafe { std::slice::from_raw_parts(value, count as usize * 9) }.to_vec()
    };
    record_call(
        "uniform_matrix_3_f32",
        &[location.into(), count.into(), transpose.into()],
        &values,
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_enable_vertex_attrib_array(index: u32) {
    record_call(
        "enable_vertex_attrib_array",
        &[index.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_vertex_attrib_pointer(
    index: u32,
    size: i32,
    kind: u32,
    normalized: u8,
    stride: i32,
    pointer: *const c_void,
) {
    record_call(
        "vertex_attrib_pointer",
        &[
            index.into(),
            size.into(),
            kind.into(),
            normalized.into(),
            stride.into(),
            pointer as usize as i64,
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe fn delete_names(count: i32, names: *const u32, call: &str) {
    let names = if names.is_null() || count <= 0 {
        Vec::new()
    } else {
        // SAFETY: delete callers provide `count` readable object names.
        unsafe { std::slice::from_raw_parts(names, count as usize) }
            .iter()
            .map(|name| i64::from(*name))
            .collect()
    };
    record_call(call, &names, &[], Vec::new(), String::new());
}

unsafe extern "system" fn gl_delete_buffers(count: i32, names: *const u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { delete_names(count, names, "delete_buffers") };
}

unsafe extern "system" fn gl_delete_framebuffers(count: i32, names: *const u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { delete_names(count, names, "delete_framebuffers") };
}

unsafe extern "system" fn gl_delete_renderbuffers(count: i32, names: *const u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { delete_names(count, names, "delete_renderbuffers") };
}

unsafe extern "system" fn gl_delete_textures(count: i32, names: *const u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { delete_names(count, names, "delete_textures") };
}

unsafe extern "system" fn gl_delete_vertex_arrays(count: i32, names: *const u32) {
    // SAFETY: forwarded from the ABI-compatible mock entry point.
    unsafe { delete_names(count, names, "delete_vertex_arrays") };
}

unsafe extern "system" fn gl_delete_program(name: u32) {
    record_call(
        "delete_program",
        &[name.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}

unsafe extern "system" fn gl_delete_shader(name: u32) {
    record_call(
        "delete_shader",
        &[name.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_shader_source(
    shader: u32,
    count: i32,
    strings: *const *const c_char,
    lengths: *const i32,
) {
    let mut source = Vec::new();
    if !strings.is_null() && count > 0 {
        for index in 0..count as usize {
            // SAFETY: shaderSource callers provide `count` readable string pointers.
            let pointer = unsafe { *strings.add(index) };
            if pointer.is_null() {
                continue;
            }
            let length = if lengths.is_null() {
                // SAFETY: a null length array means each source is nul terminated.
                unsafe { std::ffi::CStr::from_ptr(pointer) }
                    .to_bytes()
                    .len()
            } else {
                // SAFETY: a non-null length array has one entry for each source string.
                unsafe { *lengths.add(index) }.max(0) as usize
            };
            // SAFETY: the source pointer is readable for its declared length.
            source.extend_from_slice(unsafe {
                std::slice::from_raw_parts(pointer.cast::<u8>(), length)
            });
        }
    }
    record_call(
        "shader_source",
        &[shader.into(), count.into()],
        &[],
        Vec::new(),
        String::from_utf8_lossy(&source).into_owned(),
    );
}
unsafe extern "system" fn gl_compile_shader(shader: u32) {
    record_call(
        "compile_shader",
        &[shader.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_link_program(program: u32) {
    record_call(
        "link_program",
        &[program.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_attach_shader(program: u32, shader: u32) {
    record_call(
        "attach_shader",
        &[program.into(), shader.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_flush() {
    record("flush");
}
unsafe extern "system" fn gl_clear(mask: u32) {
    record_call("clear", &[mask.into()], &[], Vec::new(), String::new());
}
unsafe extern "system" fn gl_cull_face(mode: u32) {
    MOCK.with(|state| {
        state
            .borrow_mut()
            .integers
            .insert(glow::CULL_FACE_MODE, mode as i32);
    });
    record_call("cull_face", &[mode.into()], &[], Vec::new(), String::new());
}
unsafe extern "system" fn gl_front_face(mode: u32) {
    MOCK.with(|state| {
        state
            .borrow_mut()
            .integers
            .insert(glow::FRONT_FACE, mode as i32);
    });
    record_call("front_face", &[mode.into()], &[], Vec::new(), String::new());
}
unsafe extern "system" fn gl_depth_func(function: u32) {
    MOCK.with(|state| {
        state
            .borrow_mut()
            .integers
            .insert(glow::DEPTH_FUNC, function as i32);
    });
    record_call(
        "depth_func",
        &[function.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_mask(mask: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        state.integers.insert(glow::STENCIL_WRITEMASK, mask as i32);
        state
            .integers
            .insert(glow::STENCIL_BACK_WRITEMASK, mask as i32);
    });
    record_call(
        "stencil_mask",
        &[mask.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_func(function: u32, reference: i32, mask: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        for parameter in [glow::STENCIL_FUNC, glow::STENCIL_BACK_FUNC] {
            state.integers.insert(parameter, function as i32);
        }
        for parameter in [glow::STENCIL_REF, glow::STENCIL_BACK_REF] {
            state.integers.insert(parameter, reference);
        }
        for parameter in [glow::STENCIL_VALUE_MASK, glow::STENCIL_BACK_VALUE_MASK] {
            state.integers.insert(parameter, mask as i32);
        }
    });
    record_call(
        "stencil_func",
        &[function.into(), reference.into(), mask.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_op(fail: u32, depth_fail: u32, depth_pass: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        for parameter in [glow::STENCIL_FAIL, glow::STENCIL_BACK_FAIL] {
            state.integers.insert(parameter, fail as i32);
        }
        for parameter in [
            glow::STENCIL_PASS_DEPTH_FAIL,
            glow::STENCIL_BACK_PASS_DEPTH_FAIL,
        ] {
            state.integers.insert(parameter, depth_fail as i32);
        }
        for parameter in [
            glow::STENCIL_PASS_DEPTH_PASS,
            glow::STENCIL_BACK_PASS_DEPTH_PASS,
        ] {
            state.integers.insert(parameter, depth_pass as i32);
        }
    });
    record_call(
        "stencil_op",
        &[fail.into(), depth_fail.into(), depth_pass.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_mask_separate(face: u32, mask: u32) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        if face != glow::BACK {
            state.integers.insert(glow::STENCIL_WRITEMASK, mask as i32);
        }
        if face != glow::FRONT {
            state
                .integers
                .insert(glow::STENCIL_BACK_WRITEMASK, mask as i32);
        }
    });
    record_call(
        "stencil_mask_separate",
        &[face.into(), mask.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_func_separate(
    face: u32,
    function: u32,
    reference: i32,
    mask: u32,
) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        if face != glow::BACK {
            state.integers.insert(glow::STENCIL_FUNC, function as i32);
            state.integers.insert(glow::STENCIL_REF, reference);
            state.integers.insert(glow::STENCIL_VALUE_MASK, mask as i32);
        }
        if face != glow::FRONT {
            state
                .integers
                .insert(glow::STENCIL_BACK_FUNC, function as i32);
            state.integers.insert(glow::STENCIL_BACK_REF, reference);
            state
                .integers
                .insert(glow::STENCIL_BACK_VALUE_MASK, mask as i32);
        }
    });
    record_call(
        "stencil_func_separate",
        &[face.into(), function.into(), reference.into(), mask.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_stencil_op_separate(
    face: u32,
    fail: u32,
    depth_fail: u32,
    depth_pass: u32,
) {
    MOCK.with(|state| {
        let mut state = state.borrow_mut();
        if face != glow::BACK {
            state.integers.insert(glow::STENCIL_FAIL, fail as i32);
            state
                .integers
                .insert(glow::STENCIL_PASS_DEPTH_FAIL, depth_fail as i32);
            state
                .integers
                .insert(glow::STENCIL_PASS_DEPTH_PASS, depth_pass as i32);
        }
        if face != glow::FRONT {
            state.integers.insert(glow::STENCIL_BACK_FAIL, fail as i32);
            state
                .integers
                .insert(glow::STENCIL_BACK_PASS_DEPTH_FAIL, depth_fail as i32);
            state
                .integers
                .insert(glow::STENCIL_BACK_PASS_DEPTH_PASS, depth_pass as i32);
        }
    });
    record_call(
        "stencil_op_separate",
        &[
            face.into(),
            fail.into(),
            depth_fail.into(),
            depth_pass.into(),
        ],
        &[],
        Vec::new(),
        String::new(),
    );
}
unsafe extern "system" fn gl_pixel_store_i(parameter: u32, value: i32) {
    MOCK.with(|state| {
        state.borrow_mut().integers.insert(parameter, value);
    });
    record_call(
        "pixel_store_i",
        &[parameter.into(), value.into()],
        &[],
        Vec::new(),
        String::new(),
    );
}

#[cfg(test)]
mod make_gl {
    use glow::HasContext;

    use super::*;

    #[test]
    fn records_and_consumes_a_draw_error() {
        let gl = make_gl();
        MOCK.with(|state| state.borrow_mut().error = glow::INVALID_OPERATION);
        // SAFETY: the call is backed by the local mock and consumes no client memory.
        unsafe { gl.draw_arrays(glow::TRIANGLES, 0, 3) };
        // SAFETY: get_error is supported by the same current mock context.
        assert_eq!(unsafe { gl.get_error() }, glow::INVALID_OPERATION);
        assert_eq!(unsafe { gl.get_error() }, glow::NO_ERROR);
        assert_eq!(calls_named("draw_arrays"), 1);
    }
}
