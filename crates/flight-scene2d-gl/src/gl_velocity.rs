// flight-lint: allow-file(contract-vocabulary) D17 velocity writers draw through thread-bound render-gl state

use std::sync::Arc;

use flight_entity::{Kind, get_entity_id, throw_error};
use flight_node::{
    NodeRef, get_node_child_at, get_node_child_count, get_node_world_bounds_rectangle,
    get_node_world_matrix,
};
use flight_particleemitter::ParticleEmitter2D;
use flight_quadbatch::{QuadBatch, QuadTransformType, get_quad_batch_runtime};
use flight_registry::with_kind_map_entry;
use flight_render::{RenderTargetDescriptor, RenderTargetFormat};
use flight_render_gl::{
    GlBoundShader, GlRenderState, GlTextureRenderTarget, GlVelocityContext, GlVelocityWriter,
    create_gl_program, create_gl_texture_render_target,
};
use flight_textureatlas::TextureAtlasRotation;
use flight_velocity::{Velocity2D, VelocityField, get_velocity};
use glow::HasContext;

use crate::gl_quad_batch_writer::gl_f32_bytes;
use crate::scene2d_gl_runtime::ensure_scene2d_gl_context_runtime;
use crate::types::GlVelocityProgram;

// u_clipRect = (clipX0, clipY0, clipWidth, clipHeight). a_corner is the unit-quad corner [0..1]; the
// covered rect is reconstructed per vertex so no per-node matrix upload is needed.
const VELOCITY_VERTEX_SRC: &str = "#version 300 es
in vec2 a_corner;
uniform vec4 u_clipRect;
void main() {
  vec2 clip = u_clipRect.xy + a_corner * u_clipRect.zw;
  gl_Position = vec4(clip, 0.0, 1.0);
}";

const VELOCITY_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
uniform vec2 u_velocity;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_velocity, 0.0, 1.0);
}";

// GL velocity-buffer production. Velocity is tied to the draw, so production is per-kind: the
// velocity pass walks the scene and dispatches a registered GlVelocityWriter for each node's kind,
// which draws that kind's velocity into the bound rgba16f target.
//
// ENCODING: velocity is written in device pixels per frame (node-unit velocity × pixel ratio), y-down,
// into R/G of an rgba16f target (signed, sub-pixel). B is reserved; A=1 marks a covered texel so
// consumers distinguish it from the cleared (0,0,0,0) zero-velocity background.

/// Allocates an rgba16f render target sized to hold a signed, sub-pixel screen-space velocity buffer.
pub fn create_gl_velocity_target(
    state: &GlRenderState,
    width: f32,
    height: f32,
) -> GlTextureRenderTarget {
    return create_gl_texture_render_target(
        state,
        &RenderTargetDescriptor {
            width,
            height,
            format: Some(RenderTargetFormat::Rgba16F),
            color_attachments: None,
            color_formats: None,
            sample_count: None,
            depth: None,
            color_space: None,
        },
        None,
    )
    .unwrap_or_else(|error| throw_error(&error))
    .unwrap_or_else(|| throw_error("createGlVelocityTarget: unsupported rgba16f target"));
}

/// Draws one velocity quad: a device-pixel rect filled with (velocity_x, velocity_y) in node units
/// (scaled by the pixel ratio here). The velocity program must be current — the velocity pass sets it
/// up before dispatching writers.
pub fn draw_gl_velocity_quad(
    ctx: &mut GlVelocityContext<'_>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    velocity_x: f32,
    velocity_y: f32,
) {
    let program = ensure_gl_velocity_program(ctx.state);
    let gl = &ctx.state.gl;
    let clip_x0 = (x / ctx.width) * 2.0 - 1.0;
    let clip_y0 = 1.0 - (y / ctx.height) * 2.0;
    let clip_width = (width / ctx.width) * 2.0;
    let clip_height = -((height / ctx.height) * 2.0);
    // SAFETY: the velocity program is current on this GL thread.
    unsafe {
        gl.uniform_4_f32(
            program.loc_clip_rect.as_ref(),
            clip_x0,
            clip_y0,
            clip_width,
            clip_height,
        );
        gl.uniform_2_f32(
            program.loc_velocity.as_ref(),
            velocity_x * ctx.pixel_ratio,
            velocity_y * ctx.pixel_ratio,
        );
        gl.draw_arrays(glow::TRIANGLES, 0, 6);
    }
}

fn ensure_gl_velocity_program(state: &GlRenderState) -> GlVelocityProgram {
    if let Some(program) = &ensure_scene2d_gl_context_runtime(state).velocity_program {
        return program.clone();
    }

    let gl = &state.gl;
    let gl_program = create_gl_program(
        gl,
        VELOCITY_VERTEX_SRC,
        VELOCITY_FRAGMENT_SRC,
        Some("Velocity"),
    )
    .unwrap_or_else(|error| throw_error(&error));

    let quad: [f32; 12] = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
    // SAFETY: allocation, upload and location queries occur on the owning GL thread.
    let program = unsafe {
        let quad_buffer = gl
            .create_buffer()
            .unwrap_or_else(|error| throw_error(&format!("renderGlVelocity: {error}")));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(quad_buffer));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, gl_f32_bytes(&quad), glow::STATIC_DRAW);
        GlVelocityProgram {
            program: gl_program,
            quad_buffer,
            loc_corner: gl.get_attrib_location(gl_program, "a_corner").unwrap_or(0),
            loc_clip_rect: gl.get_uniform_location(gl_program, "u_clipRect"),
            loc_velocity: gl.get_uniform_location(gl_program, "u_velocity"),
        }
    };
    ensure_scene2d_gl_context_runtime(state).velocity_program = Some(program.clone());
    return program;
}

pub fn get_gl_velocity_writer(state: &GlRenderState, kind: &Kind) -> Option<GlVelocityWriter> {
    return state
        .gl_registries
        .velocity_writers
        .entries
        .get(kind)
        .copied();
}

// The default writer for plain display-object nodes: cover the node's world bounds with its velocity.
// Batched/instanced kinds register a writer that emits per-instance velocity.
pub fn gl_node2d_velocity_writer(ctx: &mut GlVelocityContext<'_>, node: &NodeRef) {
    let mut velocity = Velocity2D { x: 0.0, y: 0.0 };
    get_velocity(
        ctx.field,
        get_entity_id(&*node.read().unwrap()),
        &mut velocity,
    );
    if velocity.x == 0.0 && velocity.y == 0.0 {
        return;
    }
    let bounds = get_node_world_bounds_rectangle(node, &mut ctx.state.runtime.node_revisions);
    draw_gl_velocity_quad(
        ctx,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        velocity.x,
        velocity.y,
    );
}

// The ParticleEmitter2D writer emits PER-PARTICLE velocity: each particle moves on its own vector, so
// one emitter-wide vector would be wrong. The per-particle world rect is reconstructed exactly as the
// particle renderer composes its quad, then mapped by the emitter world transform (skipped when
// world_space puts particles in world space already). Skips particles with zero velocity and emitters
// without a populated velocities array.
pub fn gl_particle_emitter2d_velocity_writer(ctx: &mut GlVelocityContext<'_>, node: &NodeRef) {
    let world_space = {
        let guard = node.read().unwrap();
        let Some(emitter) = guard.as_any().downcast_ref::<ParticleEmitter2D>() else {
            return;
        };
        emitter.data.world_space
    };
    let (mut wa, mut wb, mut wc, mut wd, mut wtx, mut wty) = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    if !world_space {
        let transform = get_node_world_matrix(node, &mut ctx.state.runtime.node_revisions);
        wa = transform.a;
        wb = transform.b;
        wc = transform.c;
        wd = transform.d;
        wtx = transform.tx;
        wty = transform.ty;
    }

    let mut quads = Vec::new();
    {
        let guard = node.read().unwrap();
        let emitter = guard.as_any().downcast_ref::<ParticleEmitter2D>().unwrap();
        let data = &emitter.data;
        let particle_count = data.particle_count;
        let Some(atlas) = &data.atlas else {
            return;
        };
        if particle_count == 0 || data.velocities.len() < particle_count * 2 {
            return;
        }
        let atlas = atlas.read().unwrap();
        let regions = &atlas.regions;
        let num_regions = regions.len();

        for index in 0..particle_count {
            let velocity_x = data.velocities[index * 2];
            let velocity_y = data.velocities[index * 2 + 1];
            if velocity_x == 0.0 && velocity_y == 0.0 {
                continue;
            }
            let id = data.ids[index] as usize;
            if id >= num_regions {
                continue;
            }
            let region = regions[id].read().unwrap();
            let rotated = region.rotation != TextureAtlasRotation::None;
            let rw = if rotated { region.height } else { region.width };
            let rh = if rotated { region.width } else { region.height };
            if rw <= 0.0 || rh <= 0.0 {
                continue;
            }

            let tt = index * 4;
            let px = data.transforms[tt];
            let py = data.transforms[tt + 1];
            let rotation = data.transforms[tt + 2];
            let scale = data.transforms[tt + 3];
            let cos_scale = rotation.cos() * scale;
            let sin_scale = rotation.sin() * scale;

            let mut min_x = f32::INFINITY;
            let mut min_y = f32::INFINITY;
            let mut max_x = f32::NEG_INFINITY;
            let mut max_y = f32::NEG_INFINITY;
            for corner in 0..4 {
                let lx = (corner & 1) as f32 * rw;
                let ly = (corner >> 1) as f32 * rh;
                let rx = cos_scale * lx - sin_scale * ly + px;
                let ry = sin_scale * lx + cos_scale * ly + py;
                let wx = if world_space {
                    rx
                } else {
                    wa * rx + wc * ry + wtx
                };
                let wy = if world_space {
                    ry
                } else {
                    wb * rx + wd * ry + wty
                };
                min_x = min_x.min(wx);
                max_x = max_x.max(wx);
                min_y = min_y.min(wy);
                max_y = max_y.max(wy);
            }
            quads.push((
                min_x,
                min_y,
                max_x - min_x,
                max_y - min_y,
                velocity_x,
                velocity_y,
            ));
        }
    }
    for (x, y, width, height, velocity_x, velocity_y) in quads {
        draw_gl_velocity_quad(ctx, x, y, width, height, velocity_x, velocity_y);
    }
}

// The QuadBatch writer emits PER-INSTANCE velocity: a batch's quads move independently and are not
// nodes. When the batch carries a per-instance velocity array (the batch runtime's
// instance_velocities) one velocity quad is drawn per instance over that instance's own world-space
// region. Without one, the batch's world bounds are covered with one coarse field velocity, exactly
// like the Node2D writer.
pub fn gl_quad_batch_velocity_writer(ctx: &mut GlVelocityContext<'_>, node: &NodeRef) {
    let has_instances = {
        let guard = node.read().unwrap();
        let Some(batch) = guard.as_any().downcast_ref::<QuadBatch>() else {
            return;
        };
        let runtime = get_quad_batch_runtime(batch);
        let has_velocities = runtime.read().unwrap().instance_velocities.is_some();
        has_velocities && batch.data.atlas.is_some() && batch.data.instance_count > 0
    };

    // Precise per-instance path: requires the velocity array and a resolvable region per instance.
    if has_instances {
        let transform = get_node_world_matrix(node, &mut ctx.state.runtime.node_revisions);
        let (pa, pb, pc, pd, ptx, pty) = (
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.tx,
            transform.ty,
        );
        let mut quads = Vec::new();
        {
            let guard = node.read().unwrap();
            let batch = guard.as_any().downcast_ref::<QuadBatch>().unwrap();
            let data = &batch.data;
            let runtime = get_quad_batch_runtime(batch);
            let runtime = runtime.read().unwrap();
            let instance_velocities = runtime.instance_velocities.as_ref().unwrap();
            let atlas = data.atlas.as_ref().unwrap().read().unwrap();
            let regions = &atlas.regions;
            let num_regions = regions.len();
            let is_vector2 = data.transform_type == QuadTransformType::Vector2;
            let transforms = &data.transforms;
            for index in 0..data.instance_count {
                let velocity_x = instance_velocities.get(index * 2).copied().unwrap_or(0.0);
                let velocity_y = instance_velocities
                    .get(index * 2 + 1)
                    .copied()
                    .unwrap_or(0.0);
                if velocity_x == 0.0 && velocity_y == 0.0 {
                    continue;
                }
                let id = data.ids[index] as usize;
                if id >= num_regions {
                    continue;
                }
                let region = regions[id].read().unwrap();
                let rotated = region.rotation != TextureAtlasRotation::None;
                let w = if rotated { region.height } else { region.width };
                let h = if rotated { region.width } else { region.height };
                if w <= 0.0 || h <= 0.0 {
                    continue;
                }

                // World-space instance transform = batch world transform ∘ per-instance local.
                let (wa, wb, wc, wd, wtx, wty) = if is_vector2 {
                    let dx = transforms[index * 2];
                    let dy = transforms[index * 2 + 1];
                    (
                        pa,
                        pb,
                        pc,
                        pd,
                        pa * dx + pc * dy + ptx,
                        pb * dx + pd * dy + pty,
                    )
                } else {
                    let o = index * 6;
                    let (la, lb, lc, ld, ltx, lty) = (
                        transforms[o],
                        transforms[o + 1],
                        transforms[o + 2],
                        transforms[o + 3],
                        transforms[o + 4],
                        transforms[o + 5],
                    );
                    (
                        pa * la + pc * lb,
                        pb * la + pd * lb,
                        pa * lc + pc * ld,
                        pb * lc + pd * ld,
                        pa * ltx + pc * lty + ptx,
                        pb * ltx + pd * lty + pty,
                    )
                };

                // Axis-aligned world bounds of the transformed region (the four region corners).
                let x0 = wtx;
                let y0 = wty;
                let x1 = wa * w + wtx;
                let y1 = wb * w + wty;
                let x2 = wc * h + wtx;
                let y2 = wd * h + wty;
                let x3 = wa * w + wc * h + wtx;
                let y3 = wb * w + wd * h + wty;
                let min_x = x0.min(x1).min(x2).min(x3);
                let min_y = y0.min(y1).min(y2).min(y3);
                let max_x = x0.max(x1).max(x2).max(x3);
                let max_y = y0.max(y1).max(y2).max(y3);
                quads.push((
                    min_x,
                    min_y,
                    max_x - min_x,
                    max_y - min_y,
                    velocity_x,
                    velocity_y,
                ));
            }
        }
        for (x, y, width, height, velocity_x, velocity_y) in quads {
            draw_gl_velocity_quad(ctx, x, y, width, height, velocity_x, velocity_y);
        }
        return;
    }

    // Coarse fallback: one velocity over the whole batch's world bounds, matching the Node2D writer.
    gl_node2d_velocity_writer(ctx, node);
}

pub fn register_gl_velocity_writer(
    state: &mut GlRenderState,
    kind: Kind,
    writer: GlVelocityWriter,
) {
    state.gl_registries.velocity_writers = Arc::new(with_kind_map_entry(
        &state.gl_registries.velocity_writers,
        kind,
        writer,
    ));
}

/// Walks `root`'s subtree and writes every moving renderable's velocity into `target`, dispatching
/// the registered GlVelocityWriter for each node's kind. Nodes whose kind has no writer are skipped;
/// the cleared (0,0,0,0) background means zero velocity. Restores the previously bound framebuffer.
pub fn render_gl_velocity(
    state: &mut GlRenderState,
    root: &NodeRef,
    field: &VelocityField,
    target: &GlTextureRenderTarget,
) {
    let program = ensure_gl_velocity_program(state);
    let gl = std::rc::Rc::clone(&state.gl);

    // Saved alongside the framebuffer because all four are context-wide and this pass is called
    // mid-frame, between a caller's own draws.
    let mut prev_viewport = [0; 4];
    let mut prev_clear_color = [0.0; 4];
    // SAFETY: state queries and the pass setup occur on the owning GL thread.
    let prev_blend = unsafe {
        let prev_blend = gl.is_enabled(glow::BLEND);
        gl.get_parameter_i32_slice(glow::VIEWPORT, &mut prev_viewport);
        gl.get_parameter_f32_slice(glow::COLOR_CLEAR_VALUE, &mut prev_clear_color);

        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        gl.viewport(0, 0, target.axes.width as i32, target.axes.height as i32);
        gl.disable(glow::BLEND);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(glow::COLOR_BUFFER_BIT);

        gl.use_program(Some(program.program));
        prev_blend
    };
    state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
        locations: None,
        program: program.program,
    });
    // SAFETY: the quad buffer belongs to this context; attribute setup occurs on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(program.quad_buffer));
        gl.enable_vertex_attrib_array(program.loc_corner);
        gl.vertex_attrib_pointer_f32(program.loc_corner, 2, glow::FLOAT, false, 0, 0);
    }

    let pixel_ratio = state.render.pixel_ratio;
    let mut ctx = GlVelocityContext {
        state,
        field,
        width: target.axes.width as f32,
        height: target.axes.height as f32,
        pixel_ratio,
    };
    visit_gl_velocity(&mut ctx, root);

    let current_framebuffer = ctx.state.gl_runtime.borrow().current_framebuffer;
    // SAFETY: restoring the saved context state occurs on the owning GL thread.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, current_framebuffer);
        gl.disable_vertex_attrib_array(program.loc_corner);
        if prev_blend {
            gl.enable(glow::BLEND);
        }
        gl.viewport(
            prev_viewport[0],
            prev_viewport[1],
            prev_viewport[2],
            prev_viewport[3],
        );
        gl.clear_color(
            prev_clear_color[0],
            prev_clear_color[1],
            prev_clear_color[2],
            prev_clear_color[3],
        );
    }
}

fn visit_gl_velocity(ctx: &mut GlVelocityContext<'_>, node: &NodeRef) {
    let kind = node.read().unwrap().node_fields().kind.clone();
    if let Some(writer) = get_gl_velocity_writer(ctx.state, &kind) {
        writer(ctx, node);
    }

    let count = get_node_child_count(node);
    for index in 0..count {
        if let Some(child) = get_node_child_at(node, index as i32) {
            visit_gl_velocity(ctx, &child);
        }
    }
}
