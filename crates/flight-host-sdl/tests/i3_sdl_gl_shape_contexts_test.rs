use std::ffi::{CString, c_void};
use std::process::{Command, ExitCode};

use flight_node::{NodeRef, add_node_child};
use flight_render::{RenderProxies2D, RenderTargetClear, prepare_scene_2d_render};
use flight_render_gl::{
    begin_gl_render_pass, create_gl_context_state, create_gl_render_state,
    create_gl_screen_render_target, destroy_gl_render_state, end_gl_render_pass,
};
use flight_scene2d_gl::{gl_scene2d_render_preset, render_gl_scene2d};
use flight_shape::{
    append_shape_begin_fill, append_shape_end_fill, append_shape_rectangle, create_shape,
};
use glow::{HasContext, PixelPackData};
use sdl3::video::GLProfile;

const CHILD_PROFILE_ENVIRONMENT: &str = "FLIGHT_GL_SHAPE_CONTEXT_PROFILE";
const UNAVAILABLE_EXIT_CODE: u8 = 77;
const PROFILES: [&str; 5] = ["core33", "core41fc", "core45", "compat21", "gles30"];

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn main() -> ExitCode {
    if !display_available() {
        eprintln!("SKIP I3 SDL GL SHAPE CONTEXTS: no DISPLAY or WAYLAND_DISPLAY");
        return ExitCode::SUCCESS;
    }
    if let Ok(profile) = std::env::var(CHILD_PROFILE_ENVIRONMENT) {
        return run_child(&profile);
    }

    let executable = std::env::current_exe().expect("current test executable");
    let mut exercised = 0;
    for profile in PROFILES {
        let mut command = Command::new(&executable);
        command.env(CHILD_PROFILE_ENVIRONMENT, profile);
        if let Some(version) = mesa_core_version_override(profile) {
            // SDL's version is a minimum request, so Mesa otherwise returns its highest version for
            // all three core children. Its test-only override lets this gate exercise the actual
            // 3.3, 4.1-forward-compatible and 4.5 language environments independently.
            command.env("MESA_GL_VERSION_OVERRIDE", version);
        }
        let output = command
            .output()
            .unwrap_or_else(|failure| panic!("spawn {profile} child: {failure}"));
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        print!("{stdout}");
        eprint!("{stderr}");
        if output.status.code() == Some(i32::from(UNAVAILABLE_EXIT_CODE)) {
            eprintln!("SKIP I3 SDL GL SHAPE CONTEXT {profile}: unavailable on this host");
            continue;
        }
        assert!(
            output.status.success(),
            "shape mesh failed in {profile}; status={} stdout={stdout:?} stderr={stderr:?}",
            output.status
        );
        exercised += 1;
    }
    assert!(
        exercised > 0,
        "no requested SDL GL context profile was available"
    );
    return ExitCode::SUCCESS;
}

fn run_child(profile: &str) -> ExitCode {
    let sdl = sdl3::init().expect("initialize SDL");
    let video = sdl.video().expect("initialize SDL video");
    let attributes = video.gl_attr();
    attributes.reset();
    match profile {
        "core33" => {
            attributes.set_context_profile(GLProfile::Core);
            attributes.set_context_version(3, 3);
        }
        "core41fc" => {
            attributes.set_context_profile(GLProfile::Core);
            attributes.set_context_version(4, 1);
            attributes.set_context_flags().forward_compatible().set();
        }
        "core45" => {
            attributes.set_context_profile(GLProfile::Core);
            attributes.set_context_version(4, 5);
        }
        "compat21" => {
            attributes.set_context_profile(GLProfile::Compatibility);
            attributes.set_context_version(2, 1);
        }
        "gles30" => {
            attributes.set_context_profile(GLProfile::GLES);
            attributes.set_context_version(3, 0);
        }
        other => panic!("unknown profile {other}"),
    }
    attributes.set_red_size(8);
    attributes.set_green_size(8);
    attributes.set_blue_size(8);
    attributes.set_alpha_size(8);

    let mut window_builder = video.window("Flight GL shape context regression", 64, 64);
    window_builder.hidden().opengl();
    let window = match window_builder.build() {
        Ok(window) => window,
        Err(failure) => {
            eprintln!("UNAVAILABLE profile={profile} window={failure}");
            return ExitCode::from(UNAVAILABLE_EXIT_CODE);
        }
    };
    let context = match window.gl_create_context() {
        Ok(context) => context,
        Err(failure) => {
            eprintln!("UNAVAILABLE profile={profile} context={failure}");
            return ExitCode::from(UNAVAILABLE_EXIT_CODE);
        }
    };
    window
        .gl_make_current(&context)
        .expect("make requested GL context current");

    let gl =
        std::rc::Rc::new(unsafe { glow::Context::from_loader_function(|name| proc_address(name)) });
    let version = unsafe { gl.get_parameter_string(glow::VERSION) };
    let shading_language_version =
        unsafe { gl.get_parameter_string(glow::SHADING_LANGUAGE_VERSION) };
    let es3_compatibility = gl
        .supported_extensions()
        .contains("GL_ARB_ES3_compatibility");
    let is_gles = version.contains("OpenGL ES");
    // `#version 300 es` is native on GLES 3 and legal in desktop GL only when
    // ARB_ES3_compatibility is present. macOS' ES3-less core profile is the genuine unsupported
    // case; it must not be reported as a shader-regression failure.
    if !is_gles && !es3_compatibility {
        eprintln!(
            "UNAVAILABLE profile={profile} version={version:?} reason=missing-ARB_ES3_compatibility"
        );
        return ExitCode::from(UNAVAILABLE_EXIT_CODE);
    }

    let vertex_array = unsafe { gl.create_vertex_array().expect("create vertex array") };
    unsafe { gl.bind_vertex_array(Some(vertex_array)) };
    let context_state =
        create_gl_context_state(gl.clone()).expect("create Flight GL context state");
    let options = gl_scene2d_render_preset();
    let mut state = create_gl_render_state(context_state, Some(&options));
    let screen = create_gl_screen_render_target(gl.clone(), 64, 64);

    let root: NodeRef = create_shape();
    let fill = create_shape();
    append_shape_begin_fill(&fill, 0x2878e8ff, Some(1.0));
    append_shape_rectangle(&fill, 8.0, 8.0, 48.0, 48.0);
    append_shape_end_fill(&fill);
    let fill: NodeRef = fill;
    add_node_child(&root, &fill);

    let clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
    let mut proxies = RenderProxies2D::default();
    prepare_scene_2d_render(&mut state, &mut proxies, &root);
    let pass = begin_gl_render_pass(&state, &screen, Some(&clear), None)
        .expect("begin GL shape render pass");
    render_gl_scene2d(&mut state, &mut proxies, &pass, &root, None);
    end_gl_render_pass(&state, &pass).expect("end GL shape render pass");

    let mut centre = [0_u8; 4];
    unsafe {
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, None);
        gl.read_pixels(
            32,
            32,
            1,
            1,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelPackData::Slice(Some(&mut centre)),
        );
    }
    let error = unsafe { gl.get_error() };
    assert_eq!(error, glow::NO_ERROR, "GL error after shape draw");
    assert_eq!(
        centre,
        [0x28, 0x78, 0xe8, 0xff],
        "shape centre pixel in {profile}"
    );
    println!(
        "PASS profile={profile} version={version:?} glsl={shading_language_version:?} es3compat={es3_compatibility} centre={centre:?}"
    );

    destroy_gl_render_state(&mut state, &mut proxies);
    drop(screen);
    unsafe { gl.delete_vertex_array(vertex_array) };
    return ExitCode::SUCCESS;
}

fn proc_address(name: &str) -> *const c_void {
    let name = CString::new(name).expect("GL function name");
    let pointer = unsafe { sdl3::sys::video::SDL_GL_GetProcAddress(name.as_ptr()) };
    return pointer.map_or(std::ptr::null(), |function| {
        function as *const () as *const c_void
    });
}

fn mesa_core_version_override(profile: &str) -> Option<&'static str> {
    return match profile {
        "core33" => Some("3.3"),
        "core41fc" => Some("4.1FC"),
        "core45" => Some("4.5"),
        _ => None,
    };
}
