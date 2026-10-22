// flight-lint: allow-file(contract-vocabulary) D17 shader compilation intentionally exposes glow Context, native program names, and Result diagnostics

use glow::{HasContext, NativeProgram, NativeShader};

pub fn create_gl_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
    label: Option<&str>,
) -> Result<NativeProgram, String> {
    let label = label.unwrap_or("GL");
    let vertex_shader = compile_gl_shader(gl, glow::VERTEX_SHADER, vertex_source, Some(label))?;
    let fragment_shader =
        match compile_gl_shader(gl, glow::FRAGMENT_SHADER, fragment_source, Some(label)) {
            Ok(shader) => shader,
            Err(error) => {
                // SAFETY: the vertex shader was created by this context and is not retained elsewhere.
                unsafe { gl.delete_shader(vertex_shader) };
                return Err(error);
            }
        };
    // SAFETY: program creation occurs on the owning GL thread.
    let program = match unsafe { gl.create_program() } {
        Ok(program) => program,
        Err(error) => {
            // SAFETY: both shaders were created by this context and have not been attached.
            unsafe {
                gl.delete_shader(vertex_shader);
                gl.delete_shader(fragment_shader);
            }
            return Err(format!("{label} program create error: {error}"));
        }
    };
    // SAFETY: the program and shaders belong to this current context.
    unsafe {
        gl.attach_shader(program, vertex_shader);
        gl.attach_shader(program, fragment_shader);
    }
    let linked = link_gl_program(gl, program, Some(label));
    // SAFETY: linked programs retain their shader binaries; both shaders are caller-invisible.
    unsafe {
        gl.delete_shader(vertex_shader);
        gl.delete_shader(fragment_shader);
    }
    if let Err(error) = linked {
        // SAFETY: the failed program belongs exclusively to this call.
        unsafe { gl.delete_program(program) };
        return Err(error);
    }
    return Ok(program);
}

// flight-lint: allow(conform-params) The source parameter name `type` is a Rust keyword; shader_type preserves its meaning
pub fn compile_gl_shader(
    gl: &glow::Context,
    shader_type: u32,
    source: &str,
    label: Option<&str>,
) -> Result<NativeShader, String> {
    let label = label.unwrap_or("GL");
    // SAFETY: shader compilation is performed on the owning GL thread.
    let shader = unsafe { gl.create_shader(shader_type) }
        .map_err(|error| format!("{label} shader create error: {error}"))?;
    // SAFETY: the shader belongs to this context and source remains valid through the call.
    unsafe {
        gl.shader_source(shader, source);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            let log = gl.get_shader_info_log(shader);
            gl.delete_shader(shader);
            return Err(format!("{label} shader compile error: {log}"));
        }
    }
    return Ok(shader);
}

pub fn link_gl_program(
    gl: &glow::Context,
    program: NativeProgram,
    label: Option<&str>,
) -> Result<(), String> {
    let label = label.unwrap_or("GL");
    // SAFETY: the program belongs to the current context.
    unsafe {
        gl.link_program(program);
        if !gl.get_program_link_status(program) {
            return Err(format!(
                "{label} program link error: {}",
                gl.get_program_info_log(program)
            ));
        }
    }
    return Ok(());
}
