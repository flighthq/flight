// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state; the bind/shader context records realize the TS object-literal contexts, not receiver sugar

use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::Arc;

use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::{Kind, Ref};
use flight_geometry::create_matrix3;
use flight_materials::{EXTENDED_PBR_MATERIAL_KIND, PbrExtension, PbrUvSet};
use flight_registry::with_kind_map_entry;
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState, resolve_gl_texture,
};
use flight_texture::{Texture, get_texture_uv_matrix};
use glow::{HasContext, NativeProgram};

use crate::gl_pbr_standard_block::is_gl_texture_ready;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlPbrExtensionIssue, GlPbrExtensionIssueCode};

// The read-only facts a registration sees while selecting its shader contribution. The texture
// readiness probe realizes the texture (render-gl's resolver needs the mutable state), hence the cell.
struct GlPbrExtensionShaderContextRecord<'a> {
    state: RefCell<&'a mut GlRenderState>,
}

// The backend-safe operations a registration's binder sees: each texture claims the next free
// extension texture unit; uniforms are looked up by the extension's own names on the active program.
struct GlPbrExtensionBindContextRecord<'a> {
    program: NativeProgram,
    state: &'a mut GlRenderState,
    texture_index: usize,
    texture_units: Vec<u32>,
}

fn create_gl_pbr_extension_bind_context(
    state: &mut GlRenderState,
    program: NativeProgram,
) -> GlPbrExtensionBindContextRecord<'_> {
    let texture_units = get_gl_pbr_extension_texture_units(&state.gl);
    return GlPbrExtensionBindContextRecord {
        program,
        state,
        texture_index: 0,
        texture_units,
    };
}

fn create_gl_pbr_extension_shader_context(
    state: &mut GlRenderState,
) -> GlPbrExtensionShaderContextRecord<'_> {
    return GlPbrExtensionShaderContextRecord {
        state: RefCell::new(state),
    };
}

// Binds every extension's uniforms and maps through its registration, in descriptor order, against
// the program the extended renderer just selected. False when an extension kind has no registration.
pub fn bind_gl_pbr_extensions(
    state: &mut GlRenderState,
    program: NativeProgram,
    extensions: &[Ref<PbrExtension>],
) -> bool {
    let entries = state.gl_registries.pbr_extensions.clone();
    let mut context = create_gl_pbr_extension_bind_context(state, program);
    for extension in extensions {
        let extension = extension.read().unwrap();
        let Some(entry) = entries.entries.get(get_gl_pbr_extension_kind(&extension)) else {
            return false;
        };
        (entry.bind)(&mut context, &extension);
    }
    return true;
}

// Explains, as plain data, every reason an Extended PBR material would silently skip its draw:
// duplicate kinds, missing or unsupported registrations, a transmission input aliasing the active
// draw attachment, and more extension maps than free texture units.
pub fn explain_gl_pbr_extensions(
    state: &mut GlRenderState,
    extensions: &[Ref<PbrExtension>],
) -> Vec<GlPbrExtensionIssue> {
    let mut issues: Vec<GlPbrExtensionIssue> = Vec::new();
    let mut kinds: HashSet<Kind> = HashSet::new();
    let entries = state.gl_registries.pbr_extensions.clone();
    let mut transmission_scene_color_kind: Option<Kind> = None;
    let mut texture_count: usize = 0;
    {
        let shader_context = create_gl_pbr_extension_shader_context(state);
        for extension in extensions {
            let extension = extension.read().unwrap();
            let kind = get_gl_pbr_extension_kind(&extension).clone();
            if kinds.contains(&kind) {
                issues.push(GlPbrExtensionIssue {
                    code: GlPbrExtensionIssueCode::DuplicateKind,
                    kind,
                });
                continue;
            }
            kinds.insert(kind.clone());
            let Some(registration) = entries.entries.get(&kind) else {
                issues.push(GlPbrExtensionIssue {
                    code: GlPbrExtensionIssueCode::MissingRegistration,
                    kind,
                });
                continue;
            };
            if !(registration.is_supported)(&extension) {
                issues.push(GlPbrExtensionIssue {
                    code: GlPbrExtensionIssueCode::UnsupportedExtension,
                    kind,
                });
                continue;
            }
            let contribution =
                (registration.create_shader_contribution)(&shader_context, &extension);
            if contribution.samples_transmission_scene_color == Some(true) {
                transmission_scene_color_kind = Some(kind);
            }
            texture_count += contribution.texture_count as usize;
        }
    }
    let scene_color = get_gl_scene3d_runtime(state).pbr_transmission_scene_color;
    // TS: `activeTarget.textures.includes(sceneColor.texture)`, over every color attachment.
    let active_target = state.gl_runtime.borrow().current_target.clone();
    if let (Some(kind), Some(scene_color), Some(active_target)) =
        (transmission_scene_color_kind, scene_color, active_target)
        && active_target.color_textures.contains(&scene_color.texture)
    {
        issues.push(GlPbrExtensionIssue {
            code: GlPbrExtensionIssueCode::FramebufferFeedback,
            kind,
        });
    }
    if texture_count > get_gl_pbr_extension_texture_units(&state.gl).len() {
        issues.push(GlPbrExtensionIssue {
            code: GlPbrExtensionIssueCode::TextureUnitExhaustion,
            kind: EXTENDED_PBR_MATERIAL_KIND.to_string(),
        });
    }
    return issues;
}

// The open kind of a closed PbrExtension variant (its authored `kind` field).
fn get_gl_pbr_extension_kind(extension: &PbrExtension) -> &Kind {
    return match extension {
        PbrExtension::Anisotropy(value) => &value.kind,
        PbrExtension::Clearcoat(value) => &value.kind,
        PbrExtension::Iridescence(value) => &value.kind,
        PbrExtension::Sheen(value) => &value.kind,
        PbrExtension::Specular(value) => &value.kind,
        PbrExtension::TransmissionVolume(value) => &value.kind,
        PbrExtension::WrappedDiffuse(value) => &value.kind,
    };
}

// Returns the GL realization registered for a PbrExtension kind on this state, or None.
pub fn get_gl_pbr_extension_registration(
    state: &GlRenderState,
    kind: &Kind,
) -> Option<&'static GlPbrExtensionRegistration> {
    return state
        .gl_registries
        .pbr_extensions
        .entries
        .get(kind)
        .copied();
}

// The fragment texture units free for extension maps: from 6 (past the six standard-block units) to
// the context's limit, skipping 8–12 (the shadow, IBL and skin-palette units).
fn get_gl_pbr_extension_texture_units(gl: &glow::Context) -> Vec<u32> {
    // SAFETY: the query runs on the owning GL thread.
    let count = unsafe { gl.get_parameter_i32(glow::MAX_TEXTURE_IMAGE_UNITS) }.max(0) as u32;
    let mut units: Vec<u32> = Vec::new();
    for unit in 6..count {
        if !(8..=12).contains(&unit) {
            units.push(unit);
        }
    }
    return units;
}

// Registers the GL realization of a PbrExtension kind on this state, replacing the persistent table
// (an explicitly copied state keeps its snapshot) and advancing the registry revision so the PBR
// program cache recompiles variants built against a replaced registration.
pub fn register_gl_pbr_extension(
    state: &mut GlRenderState,
    kind: Kind,
    registration: &'static GlPbrExtensionRegistration,
) {
    state.gl_registries.pbr_extensions = Arc::new(with_kind_map_entry(
        &state.gl_registries.pbr_extensions,
        kind,
        registration,
    ));
    state.gl_runtime.borrow_mut().pbr_extension_revision += 1;
}

// Resolves every extension's shader contribution in descriptor order, or None when any extension
// would be skipped (see explain_gl_pbr_extensions).
pub fn resolve_gl_pbr_extension_contributions(
    state: &mut GlRenderState,
    extensions: &[Ref<PbrExtension>],
) -> Option<Vec<GlPbrExtensionShaderContribution>> {
    if !explain_gl_pbr_extensions(state, extensions).is_empty() {
        return None;
    }
    let entries = state.gl_registries.pbr_extensions.clone();
    let context = create_gl_pbr_extension_shader_context(state);
    let mut contributions: Vec<GlPbrExtensionShaderContribution> = Vec::new();
    for extension in extensions {
        let extension = extension.read().unwrap();
        let entry = entries.entries.get(get_gl_pbr_extension_kind(&extension))?;
        contributions.push((entry.create_shader_contribution)(&context, &extension));
    }
    return Some(contributions);
}

impl GlPbrExtensionShaderContext for GlPbrExtensionShaderContextRecord<'_> {
    fn has_transmission_scene_color(&self) -> bool {
        return get_gl_scene3d_runtime(&self.state.borrow())
            .pbr_transmission_scene_color
            .is_some();
    }

    fn is_texture_ready(&self, texture: Option<&Ref<Texture>>) -> bool {
        return is_gl_texture_ready(&mut self.state.borrow_mut(), texture);
    }
}

impl GlPbrExtensionBindContext for GlPbrExtensionBindContextRecord<'_> {
    fn bind_texture(
        &mut self,
        sampler_uniform: &str,
        uv_set_uniform: &str,
        uv_transform_uniform: &str,
        texture: Option<&Ref<Texture>>,
        uv_set: PbrUvSet,
    ) -> bool {
        if !is_gl_texture_ready(self.state, texture) {
            return false;
        }
        let unit = self.texture_units.get(self.texture_index).copied();
        self.texture_index += 1;
        let (Some(unit), Some(texture)) = (unit, texture) else {
            return false;
        };
        let gl = self.state.gl.clone();
        // SAFETY: unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + unit) };
        let texture = texture.read().unwrap();
        if resolve_gl_texture(self.state, &*texture, None, None).is_none() {
            return false;
        }
        let mut uv_matrix = create_matrix3();
        get_texture_uv_matrix(&mut uv_matrix, &*texture);
        // SAFETY: uniform uploads run on the owning GL thread against the active program.
        unsafe {
            gl.uniform_1_i32(
                gl.get_uniform_location(self.program, sampler_uniform)
                    .as_ref(),
                unit as i32,
            );
            gl.uniform_1_i32(
                gl.get_uniform_location(self.program, uv_set_uniform)
                    .as_ref(),
                uv_set as i32,
            );
            gl.uniform_matrix_3_f32_slice(
                gl.get_uniform_location(self.program, uv_transform_uniform)
                    .as_ref(),
                false,
                &uv_matrix.m,
            );
        }
        return true;
    }

    fn bind_transmission_scene_color(
        &mut self,
        sampler_uniform: &str,
        max_lod_uniform: &str,
    ) -> bool {
        let Some(scene_color) = get_gl_scene3d_runtime(self.state).pbr_transmission_scene_color
        else {
            return false;
        };
        let unit = self.texture_units.get(self.texture_index).copied();
        self.texture_index += 1;
        let Some(unit) = unit else {
            return false;
        };
        let gl = &self.state.gl;
        // SAFETY: binds and uniform uploads run on the owning GL thread against the active program.
        unsafe {
            gl.active_texture(glow::TEXTURE0 + unit);
            gl.bind_texture(glow::TEXTURE_2D, Some(scene_color.texture));
            gl.uniform_1_i32(
                gl.get_uniform_location(self.program, sampler_uniform)
                    .as_ref(),
                unit as i32,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(self.program, max_lod_uniform)
                    .as_ref(),
                scene_color.mip_level_count.saturating_sub(1) as f32,
            );
        }
        return true;
    }

    fn set_float(&mut self, uniform: &str, value: f32) {
        let gl = &self.state.gl;
        // SAFETY: the uniform upload runs on the owning GL thread against the active program.
        unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(self.program, uniform).as_ref(),
                value,
            )
        };
    }

    fn set_linear_color(&mut self, uniform: &str, color: u32) {
        let mut rgba = allocate_linear_color();
        unpack_color_to_linear(&mut rgba, color);
        let gl = &self.state.gl;
        // SAFETY: the uniform upload runs on the owning GL thread against the active program.
        unsafe {
            gl.uniform_3_f32(
                gl.get_uniform_location(self.program, uniform).as_ref(),
                rgba.r,
                rgba.g,
                rgba.b,
            );
        }
    }
}
