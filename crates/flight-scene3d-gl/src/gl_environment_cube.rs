// flight-lint: allow-file(contract-vocabulary) D17 the source cube is a native glow texture handle owned by thread-bound render-gl state

use std::any::Any;

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_entity::{get_entity_id, throw_error};
use flight_image::{IMAGE_TEXTURE_SOURCE_KIND, ImageResource};
use flight_lighting::Environment;
use flight_render_gl::{GlRenderState, upload_gl_texture_data, upload_gl_texture_image_resource};
use flight_texture::{CubeTexture, Texture, TextureColorSpace, TextureSource, TextureSourceRef, TextureUvTransform};
use glow::{HasContext, NativeTexture};

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlScene3DRuntime;

// Frees the cached source radiance cubemap for `state` and clears its identity/version stamps, so the
// next ensure_gl_environment_source_cube uploads again. Automatic invalidation handles ordinary source
// changes; this explicit verb is for callers that know the GPU copy is stale independently of the
// modeled revisions. `destroy*` rather than `dispose*` because a GL texture is freed here and now. A
// no-op when nothing is cached, and safe to call twice.
pub fn destroy_gl_environment_source_cube(state: &GlRenderState) {
    let mut runtime = get_gl_scene3d_runtime(state);
    let Some(cube) = runtime.environment_source_cube else {
        return;
    };
    // SAFETY: the source cube belongs to this state's context, on its owning GL thread.
    unsafe { state.gl.delete_texture(cube) };
    runtime.environment_source_cube = None;
    // The colour space belongs to the cube that was just freed. update_gl_environment_cube_face reads it
    // to pick an internal format, so leaving it behind would carry one cube's decode decision onto the next.
    runtime.environment_source_cube_color_space = TextureColorSpace::Linear;
    runtime.environment_source_cube_face_versions = Vec::new();
    runtime.environment_source_cube_face_sources = Vec::new();
    runtime.environment_source_revision = runtime.environment_source_revision.wrapping_add(1);
    runtime.environment_source_texture = None;
    runtime.environment_source_texture_version = -1;
}

// Uploads an Environment's source radiance cubemap (six faces) to a GL cubemap texture, caching it on
// the scene runtime. Returns None when the environment has no complete cube — all six faces bound with
// pixels, either a decoded image source or raw bitmap data — which callers treat as "no environment
// this frame". Each face uploads through whichever representation it carries. The upload is keyed by
// the source Texture identity plus its revision and all six face payload revisions. Switching the
// Environment wrapper alone does not rebuild a shared cube, and changing only intensity is likewise
// free. A changed source advances environment_source_revision immediately, which disables a stale IBL
// bake until the caller explicitly invokes bake_gl_environment_ibl again. Texture color_space selects
// the cube's GPU internal format, so hardware sampling decodes sRGB only for an sRGB cube.
pub fn ensure_gl_environment_source_cube(
    state: &GlRenderState,
    environment: &Environment,
) -> Option<NativeTexture> {
    let texture_ref = environment.environment.clone();
    let texture_guard = texture_ref.as_ref().map(|texture| texture.read().unwrap());
    let cube = match texture_guard.as_deref() {
        Some(Texture::Cube(cube)) if has_gl_cube_face_pixels(cube) => cube,
        _ => {
            let cached = get_gl_scene3d_runtime(state).environment_source_cube.is_some();
            if cached {
                destroy_gl_environment_source_cube(state);
            }
            return None;
        }
    };
    {
        let runtime = get_gl_scene3d_runtime(state);
        if is_gl_environment_source_cube_current(&runtime, cube) {
            return runtime.environment_source_cube;
        }
    }
    let cached = get_gl_scene3d_runtime(state).environment_source_cube.is_some();
    if cached {
        destroy_gl_environment_source_cube(state);
    }
    let sources = &cube.sources;

    let gl = &state.gl;
    let color_space = cube.texture_fields().color_space;
    let internal_format = if color_space == TextureColorSpace::Srgb {
        glow::SRGB8_ALPHA8
    } else {
        glow::RGBA
    };
    // SAFETY: the cube is created and filled on the state's owning GL thread.
    let texture = unsafe { gl.create_texture() }.unwrap_or_else(|error| throw_error(&error));
    // SAFETY: binding a texture this context just created.
    unsafe { gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture)) };
    for (face, source) in sources.iter().enumerate() {
        let image = source.as_ref().expect("a complete cube has six faces");
        upload_gl_environment_image(
            gl,
            get_gl_cube_face_target(gl, face as u32),
            &*image.read().unwrap(),
            Some(internal_format),
        );
    }
    // SAFETY: parameters apply to the cube bound above.
    unsafe {
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_R, glow::CLAMP_TO_EDGE as i32);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, None);
    }

    let mut runtime = get_gl_scene3d_runtime(state);
    runtime.environment_source_cube = Some(texture);
    runtime.environment_source_cube_color_space = color_space;
    runtime.environment_source_cube_face_versions = get_gl_environment_source_cube_face_versions(cube);
    runtime.environment_source_cube_face_sources = sources
        .iter()
        .map(|source| source.as_ref().map_or(0, |image| get_entity_id(&*image.read().unwrap())))
        .collect();
    runtime.environment_source_revision = runtime.environment_source_revision.wrapping_add(1);
    runtime.environment_source_texture = Some(get_entity_id(cube));
    runtime.environment_source_texture_version = i64::from(cube.texture_fields().version);
    return Some(texture);
}

// The cubemap face target in Texture sources order (+X, -X, +Y, -Y, +Z, -Z), which is exactly
// TEXTURE_CUBE_MAP_POSITIVE_X + face. Face loops call this rather than hardcoding the GL enum math.
// The enum is a glow constant, so the context is accepted for source parity but not read.
pub fn get_gl_cube_face_target(_gl: &glow::Context, face: u32) -> u32 {
    return glow::TEXTURE_CUBE_MAP_POSITIVE_X + face;
}

// The face payload versions of a cube (-1 for an absent face).
fn get_gl_environment_source_cube_face_versions(cube: &CubeTexture) -> Vec<i64> {
    return cube
        .sources
        .iter()
        .map(|source| {
            source.as_ref().map_or(-1, |image| {
                i64::from(image.read().unwrap().texture_source_fields().version)
            })
        })
        .collect();
}

// A face is uploadable when it carries pixels in either representation: a decoded image source or raw
// CPU data (a generated Bitmap). A cube is complete only when all six faces are uploadable.
fn has_gl_cube_face_pixels(cube: &CubeTexture) -> bool {
    for face in 0..6 {
        let Some(image) = &cube.sources[face] else {
            return false;
        };
        let guard = image.read().unwrap();
        let kind = &guard.texture_source_fields().kind;
        if kind != IMAGE_TEXTURE_SOURCE_KIND && kind != BITMAP_TEXTURE_SOURCE_KIND {
            return false;
        }
    }
    return true;
}

fn is_gl_environment_source_cube_current(runtime: &GlScene3DRuntime, cube: &CubeTexture) -> bool {
    if runtime.environment_source_cube.is_none()
        || runtime.environment_source_texture != Some(get_entity_id(cube))
        || runtime.environment_source_texture_version != i64::from(cube.texture_fields().version)
        || runtime.environment_source_cube_face_versions.len() != 6
    {
        return false;
    }
    for face in 0..6 {
        let version = cube.sources[face].as_ref().map(|image| {
            i64::from(image.read().unwrap().texture_source_fields().version)
        });
        if Some(runtime.environment_source_cube_face_versions[face]) != version {
            return false;
        }
    }
    return true;
}

// Restamps a single face of the already-built source cube in place, uploading whichever representation
// the image carries (element or generated data). This is the incremental counterpart of the all-six
// ensure_gl_environment_source_cube — for dynamic cube content (reflection probes, a live sky face, or a
// generated data face mixed into loaded ones) without dropping and rebuilding the whole cube. `face` is
// the cube face index (+X, -X, +Y, -Y, +Z, -Z). Returns false when no cube has been built yet — the
// caller must call ensure_gl_environment_source_cube first.
pub fn update_gl_environment_cube_face(
    state: &GlRenderState,
    face: u32,
    image: &TextureSourceRef,
) -> bool {
    let (texture, color_space) = {
        let runtime = get_gl_scene3d_runtime(state);
        let Some(texture) = runtime.environment_source_cube else {
            return false;
        };
        (texture, runtime.environment_source_cube_color_space)
    };
    let gl = &state.gl;
    let image_guard = image.read().unwrap();
    // SAFETY: the cached cube belongs to this state's context.
    unsafe { gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture)) };
    upload_gl_environment_image(
        gl,
        get_gl_cube_face_target(gl, face),
        &*image_guard,
        Some(if color_space == TextureColorSpace::Srgb {
            glow::SRGB8_ALPHA8
        } else {
            glow::RGBA
        }),
    );
    // SAFETY: unbinding on the same context.
    unsafe { gl.bind_texture(glow::TEXTURE_CUBE_MAP, None) };
    let image_id = get_entity_id(&*image_guard);
    let image_version = i64::from(image_guard.texture_source_fields().version);
    drop(image_guard);
    let mut runtime = get_gl_scene3d_runtime(state);
    let tracked = runtime.environment_source_texture.is_some()
        && runtime.environment_source_cube_face_sources.get(face as usize) == Some(&image_id);
    let mut face_versions = runtime.environment_source_cube_face_versions.clone();
    if face_versions.len() <= face as usize {
        face_versions.resize(face as usize + 1, -1);
    }
    face_versions[face as usize] = if tracked { image_version } else { -1 };
    runtime.environment_source_cube_face_versions = face_versions;
    runtime.environment_source_revision = runtime.environment_source_revision.wrapping_add(1);
    return true;
}

fn upload_gl_environment_image(
    gl: &glow::Context,
    target: u32,
    image: &dyn TextureSource,
    internal_format: Option<u32>,
) {
    let internal_format = Some(internal_format.unwrap_or(glow::RGBA));
    let any = image as &dyn Any;
    if image.texture_source_fields().kind == BITMAP_TEXTURE_SOURCE_KIND {
        if let Some(bitmap) = any.downcast_ref::<Bitmap>() {
            let fields = bitmap.texture_source_fields();
            upload_gl_texture_data(gl, target, fields.width, fields.height, &bitmap.data, internal_format);
        }
    } else if let Some(resource) = any.downcast_ref::<ImageResource>() {
        if let Err(error) = upload_gl_texture_image_resource(gl, target, resource, internal_format) {
            throw_error(&error);
        }
    }
}
