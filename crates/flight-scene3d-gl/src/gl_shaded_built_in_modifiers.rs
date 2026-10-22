// flight-lint: allow-file(contract-vocabulary) D17 modifier snippets are backend-typed GLSL registrations over thread-bound render-gl state; D16 snippets narrow the open Modifier family

use std::any::Any;

use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_render_gl::{
    GlModifierBindContext, GlModifierSnippet, GlRenderState, resolve_gl_texture,
};
use flight_shading::{
    ANIMATED_NORMAL_MODIFIER_KIND, AnimatedNormalModifier, DISSOLVE_MODIFIER_KIND,
    DissolveModifier, EMISSIVE_MODIFIER_KIND, ENV_REFLECT_MODIFIER_KIND, EmissiveModifier,
    EmissiveModifierFacing, EnvReflectModifier, FOG_MODIFIER_KIND, FogModifier, FogModifierMode,
    MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL, MODIFIER_SLOT_VERTEX,
    Modifier, RIM_MODIFIER_KIND, RimModifier, TOON_MODIFIER_KIND, ToonModifier,
    VERTEX_DISPLACE_MODIFIER_KIND, VertexDisplaceModifier, VertexDisplaceModifierSource,
};
use flight_texture::Texture;
use glow::{HasContext, NativeUniformLocation};

use crate::gl_shaded_modifier_snippet::register_gl_modifier_snippet;

// The built-in GL modifier snippets — the backend halves of flight_shading's eight built-in modifier
// descriptors, across all six slots: VertexDisplace (Vertex), AnimatedNormal (Normal), Emissive
// (Emissive), and Rim/EnvReflect/Fog/Dissolve/Toon (Effect). Each carries the substrate-agnostic
// definition (kind/slot/define signature owned by flight_shading) and adds GLSL (declarations + a
// slot-hook contribution, names suffixed by the modifier's stack index so repeated kinds never
// collide) plus a per-draw uniform upload. Reusing the framework definition — rather than re-deriving
// the signature here — guarantees the program keyed by a stack's define-key always matches the GLSL
// assembled for it: Emissive `m`/`g`, AnimatedNormal `0`/`1`/`2`, Fog `l`/`e`/`x`, Dissolve ``/`m`,
// VertexDisplace `s`/`h`(+`a`), Rim/EnvReflect/Toon none.

// A UV-panned normal map perturbing the shading normal, scrolled by u_time. Signature `0` (no map,
// no GLSL), `1` single-layer, `2` dual-layer.
pub static ANIMATED_NORMAL_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: ANIMATED_NORMAL_MODIFIER_KIND,
    slot: MODIFIER_SLOT_NORMAL,
    get_define_signature: Some(get_gl_modifier_define_signature),
    bind: Some(bind_animated_normal_gl_modifier),
    contribution: contribute_animated_normal_gl_modifier,
    declarations: Some(declare_animated_normal_gl_modifier),
};

// A self-illuminating contribution added to the shaded radiance, optionally masked and optionally
// gated by surface facing (the night-side city-lights case). Signature `m` (masked), `g` (facing
// gate), combined `mg`.
pub static EMISSIVE_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: EMISSIVE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EMISSIVE,
    get_define_signature: Some(get_gl_modifier_define_signature),
    bind: Some(bind_emissive_gl_modifier),
    contribution: contribute_emissive_gl_modifier,
    declarations: Some(declare_emissive_gl_modifier),
};

// A view-dependent Fresnel rim added to the shaded radiance at grazing angles. One program shape (no
// signature — power/intensity/bias are uniforms).
pub static RIM_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: RIM_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_rim_gl_modifier),
    contribution: contribute_rim_gl_modifier,
    declarations: Some(declare_rim_gl_modifier),
};

// A clip/burn dissolve of the shaded output, discarding fragments below a noise threshold and tinting
// the burn edge. Signature `` (procedural value noise over v_uv0) or `m` (sampled from a noise map).
pub static DISSOLVE_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: DISSOLVE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: Some(get_gl_modifier_define_signature),
    bind: Some(bind_dissolve_gl_modifier),
    contribution: contribute_dissolve_gl_modifier,
    declarations: Some(declare_dissolve_gl_modifier),
};

// A view-dependent reflection of the scene's baked environment cubemap, Fresnel-blended into the
// shaded radiance. One program shape (all params are uniforms). It samples the SAME prefiltered
// environment (u_iblPrefiltered on the IBL unit) the lit block already binds, so it declares those
// shared uniforms itself — a scene without a baked environment leaves u_iblEnabled at 0 and the term
// falls back to the reflection tint.
pub static ENV_REFLECT_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: ENV_REFLECT_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_env_reflect_gl_modifier),
    contribution: contribute_env_reflect_gl_modifier,
    declarations: Some(declare_env_reflect_gl_modifier),
};

// A per-material distance fog blending the shaded output toward a color. Signature `l` (linear
// near/far ramp), `e` (exponential), `x` (exponential-squared) — each emits a different factor.
pub static FOG_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: FOG_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: Some(get_gl_modifier_define_signature),
    bind: Some(bind_fog_gl_modifier),
    contribution: contribute_fog_gl_modifier,
    declarations: Some(declare_fog_gl_modifier),
};

// Quantizes the shaded radiance into flat cel bands. One program shape (steps/smoothness are
// uniforms).
pub static TOON_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: TOON_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_toon_gl_modifier),
    contribution: contribute_toon_gl_modifier,
    declarations: Some(declare_toon_gl_modifier),
};

// The one VERTEX-stage snippet: displaces the local vertex along its normal (or a fixed axis) before
// the model transform. Signature `s` (Sine procedural wave, animated by u_time) or `h` (HeightMap red
// channel), optionally `+a` when a fixed push axis replaces the surface normal.
pub static VERTEX_DISPLACE_GL_MODIFIER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: VERTEX_DISPLACE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_VERTEX,
    get_define_signature: Some(get_gl_modifier_define_signature),
    bind: Some(bind_vertex_displace_gl_modifier),
    contribution: contribute_vertex_displace_gl_modifier,
    declarations: Some(declare_vertex_displace_gl_modifier),
};

fn bind_animated_normal_gl_modifier(
    modifier: &dyn Modifier,
    context: &mut GlModifierBindContext<'_>,
) {
    let Some(animated) = (modifier as &dyn Any).downcast_ref::<AnimatedNormalModifier>() else {
        return;
    };
    let Some(map) = animated.map.as_ref() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    bind_gl_modifier_texture(
        context,
        &map.read().unwrap(),
        &format!("u_animNormalMap{suffix}"),
    );
    let scroll = &animated.scroll;
    let scroll_location =
        get_gl_modifier_uniform_location(context, &format!("u_animNormalScroll{suffix}"));
    let strength_location =
        get_gl_modifier_uniform_location(context, &format!("u_animNormalStrength{suffix}"));
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        context
            .state
            .gl
            .uniform_2_f32(scroll_location.as_ref(), scroll.x, scroll.y);
        context
            .state
            .gl
            .uniform_1_f32(strength_location.as_ref(), animated.strength);
    }
    if let Some(secondary_map) = animated.secondary_map.as_ref() {
        bind_gl_modifier_texture(
            context,
            &secondary_map.read().unwrap(),
            &format!("u_animNormalMap2{suffix}"),
        );
        let secondary = animated.secondary_scroll.as_ref().unwrap_or(scroll);
        let location =
            get_gl_modifier_uniform_location(context, &format!("u_animNormalScroll2{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context
                .state
                .gl
                .uniform_2_f32(location.as_ref(), secondary.x, secondary.y)
        };
    }
}

fn bind_dissolve_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(dissolve) = (modifier as &dyn Any).downcast_ref::<DissolveModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let threshold =
        get_gl_modifier_uniform_location(context, &format!("u_dissolveThreshold{suffix}"));
    let edge_width =
        get_gl_modifier_uniform_location(context, &format!("u_dissolveEdgeWidth{suffix}"));
    let edge_color =
        get_gl_modifier_uniform_location(context, &format!("u_dissolveEdgeColor{suffix}"));
    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, dissolve.edge_color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &context.state.gl;
        gl.uniform_1_f32(threshold.as_ref(), dissolve.threshold);
        gl.uniform_1_f32(edge_width.as_ref(), dissolve.edge_width);
        gl.uniform_3_f32(
            edge_color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
        );
    }
    if let Some(map) = dissolve.map.as_ref() {
        bind_gl_modifier_texture(
            context,
            &map.read().unwrap(),
            &format!("u_dissolveMap{suffix}"),
        );
    } else {
        let scale = get_gl_modifier_uniform_location(context, &format!("u_dissolveScale{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context
                .state
                .gl
                .uniform_1_f32(scale.as_ref(), dissolve.scale)
        };
    }
}

fn bind_emissive_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(emissive) = (modifier as &dyn Any).downcast_ref::<EmissiveModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let color = get_gl_modifier_uniform_location(context, &format!("u_emissiveColor{suffix}"));
    let strength =
        get_gl_modifier_uniform_location(context, &format!("u_emissiveStrength{suffix}"));
    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, emissive.color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &context.state.gl;
        gl.uniform_3_f32(
            color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
        );
        gl.uniform_1_f32(strength.as_ref(), emissive.strength);
    }
    if let Some(mask) = emissive.mask.as_ref() {
        bind_gl_modifier_texture(
            context,
            &mask.read().unwrap(),
            &format!("u_emissiveMask{suffix}"),
        );
    }
    if is_emissive_gated(emissive) {
        let sign = if emissive.facing == EmissiveModifierFacing::AwayFromLight {
            -1.0
        } else {
            1.0
        };
        let sign_location =
            get_gl_modifier_uniform_location(context, &format!("u_emissiveFacingSign{suffix}"));
        let softness_location =
            get_gl_modifier_uniform_location(context, &format!("u_emissiveFacingSoftness{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context.state.gl.uniform_1_f32(sign_location.as_ref(), sign);
            context
                .state
                .gl
                .uniform_1_f32(softness_location.as_ref(), emissive.facing_softness);
        }
    }
}

fn bind_env_reflect_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(reflect) = (modifier as &dyn Any).downcast_ref::<EnvReflectModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let tint = get_gl_modifier_uniform_location(context, &format!("u_envReflectTint{suffix}"));
    let intensity =
        get_gl_modifier_uniform_location(context, &format!("u_envReflectIntensity{suffix}"));
    let fresnel =
        get_gl_modifier_uniform_location(context, &format!("u_envReflectFresnel{suffix}"));
    let roughness =
        get_gl_modifier_uniform_location(context, &format!("u_envReflectRoughness{suffix}"));
    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, reflect.tint);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &context.state.gl;
        gl.uniform_3_f32(
            tint.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
        );
        gl.uniform_1_f32(intensity.as_ref(), reflect.intensity);
        gl.uniform_1_f32(fresnel.as_ref(), reflect.fresnel_bias);
        gl.uniform_1_f32(roughness.as_ref(), reflect.roughness);
    }
}

fn bind_fog_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(fog) = (modifier as &dyn Any).downcast_ref::<FogModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let color = get_gl_modifier_uniform_location(context, &format!("u_fogColor{suffix}"));
    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, fog.color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        context.state.gl.uniform_3_f32(
            color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
        )
    };
    if fog.mode == FogModifierMode::Linear {
        let near = get_gl_modifier_uniform_location(context, &format!("u_fogNear{suffix}"));
        let far = get_gl_modifier_uniform_location(context, &format!("u_fogFar{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context.state.gl.uniform_1_f32(near.as_ref(), fog.near);
            context.state.gl.uniform_1_f32(far.as_ref(), fog.far);
        }
    } else {
        let density = get_gl_modifier_uniform_location(context, &format!("u_fogDensity{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context
                .state
                .gl
                .uniform_1_f32(density.as_ref(), fog.density)
        };
    }
}

// Binds a modifier's texture on the next free modifier texture unit and points its sampler uniform at
// it. Mirrors the base material's texture bind (active_texture → resolve_gl_texture → uniform_1_i32).
// An unready backing leaves the sampler on that unit without an upload (the modifier renders as if
// unmapped) rather than clobbering a base or shadow unit. When the allocator is exhausted (returns
// -1), the sampler is left untouched — the excess modifier texture is dropped rather than binding
// onto the shadow/IBL units.
fn bind_gl_modifier_texture(
    context: &mut GlModifierBindContext<'_>,
    texture: &Texture,
    uniform_name: &str,
) {
    let unit = (context.acquire_modifier_texture_unit)();
    if unit < 0 {
        return;
    }
    // SAFETY: texture-unit selection runs on the owning GL thread.
    unsafe {
        context
            .state
            .gl
            .active_texture(glow::TEXTURE0 + unit as u32)
    };
    resolve_gl_texture(context.state, texture, None, None);
    let location = get_gl_modifier_uniform_location(context, uniform_name);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        context.state.gl.uniform_1_i32(location.as_ref(), unit);
        context.state.gl.active_texture(glow::TEXTURE0);
    }
}

fn bind_rim_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(rim) = (modifier as &dyn Any).downcast_ref::<RimModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let color = get_gl_modifier_uniform_location(context, &format!("u_rimColor{suffix}"));
    let power = get_gl_modifier_uniform_location(context, &format!("u_rimPower{suffix}"));
    let intensity = get_gl_modifier_uniform_location(context, &format!("u_rimIntensity{suffix}"));
    let bias = get_gl_modifier_uniform_location(context, &format!("u_rimBias{suffix}"));
    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, rim.color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &context.state.gl;
        gl.uniform_3_f32(
            color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
        );
        gl.uniform_1_f32(power.as_ref(), rim.power);
        gl.uniform_1_f32(intensity.as_ref(), rim.intensity);
        gl.uniform_1_f32(bias.as_ref(), rim.bias);
    }
}

fn bind_toon_gl_modifier(modifier: &dyn Modifier, context: &mut GlModifierBindContext<'_>) {
    let Some(toon) = (modifier as &dyn Any).downcast_ref::<ToonModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let steps = get_gl_modifier_uniform_location(context, &format!("u_toonSteps{suffix}"));
    let smoothness =
        get_gl_modifier_uniform_location(context, &format!("u_toonSmoothness{suffix}"));
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        context
            .state
            .gl
            .uniform_1_f32(steps.as_ref(), toon.steps.max(2.0));
        context
            .state
            .gl
            .uniform_1_f32(smoothness.as_ref(), toon.smoothness);
    }
}

fn bind_vertex_displace_gl_modifier(
    modifier: &dyn Modifier,
    context: &mut GlModifierBindContext<'_>,
) {
    let Some(displace) = (modifier as &dyn Any).downcast_ref::<VertexDisplaceModifier>() else {
        return;
    };
    let suffix = format!("_{}", context.index);
    let amplitude =
        get_gl_modifier_uniform_location(context, &format!("u_vDisplaceAmplitude{suffix}"));
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        context
            .state
            .gl
            .uniform_1_f32(amplitude.as_ref(), displace.amplitude)
    };
    if let Some(axis) = displace.axis.as_ref() {
        let location =
            get_gl_modifier_uniform_location(context, &format!("u_vDisplaceAxis{suffix}"));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            context
                .state
                .gl
                .uniform_3_f32(location.as_ref(), axis.x, axis.y, axis.z)
        };
    }
    if displace.source == VertexDisplaceModifierSource::HeightMap {
        if let Some(map) = displace.map.as_ref() {
            bind_gl_modifier_texture(
                context,
                &map.read().unwrap(),
                &format!("u_vDisplaceMap{suffix}"),
            );
        }
    } else {
        let frequency =
            get_gl_modifier_uniform_location(context, &format!("u_vDisplaceFrequency{suffix}"));
        let speed = get_gl_modifier_uniform_location(context, &format!("u_vDisplaceSpeed{suffix}"));
        let direction =
            get_gl_modifier_uniform_location(context, &format!("u_vDisplaceDir{suffix}"));
        let dir = &displace.direction;
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            let gl = &context.state.gl;
            gl.uniform_1_f32(frequency.as_ref(), displace.frequency);
            gl.uniform_1_f32(speed.as_ref(), displace.speed);
            gl.uniform_3_f32(direction.as_ref(), dir.x, dir.y, dir.z);
        }
    }
}

fn contribute_animated_normal_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(animated) = (modifier as &dyn Any).downcast_ref::<AnimatedNormalModifier>() else {
        return String::new();
    };
    if animated.map.is_none() {
        return String::new();
    }
    let suffix = format!("_{index}");
    let dual = if animated.secondary_map.is_some() {
        format!(
            "  animNormal += texture(u_animNormalMap2{suffix}, v_uv0 + u_animNormalScroll2{suffix} * u_time).xyz * 2.0 - 1.0;\n"
        )
    } else {
        String::new()
    };
    return "{\n".to_string()
        + &format!(
            "  vec3 animNormal = texture(u_animNormalMap{suffix}, v_uv0 + u_animNormalScroll{suffix} * u_time).xyz * 2.0 - 1.0;\n"
        )
        + &dual
        + &format!("  animNormal.xy *= u_animNormalStrength{suffix};\n")
        + "  normal = normalize(tbn * animNormal);\n"
        + "}";
}

fn contribute_dissolve_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(dissolve) = (modifier as &dyn Any).downcast_ref::<DissolveModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let noise = if dissolve.map.is_some() {
        format!("  float dissolveNoise = texture(u_dissolveMap{suffix}, v_uv0).r;\n")
    } else {
        format!("  float dissolveNoise = shadedValueNoise(v_uv0 * u_dissolveScale{suffix});\n")
    };
    return "{\n".to_string()
        + &noise
        + &format!("  if (dissolveNoise < u_dissolveThreshold{suffix}) discard;\n")
        + &format!(
            "  float dissolveEdge = 1.0 - smoothstep(u_dissolveThreshold{suffix}, u_dissolveThreshold{suffix} + max(u_dissolveEdgeWidth{suffix}, 1e-4), dissolveNoise);\n"
        )
        + &format!("  radiance = mix(radiance, u_dissolveEdgeColor{suffix}, dissolveEdge);\n")
        + "}";
}

fn contribute_emissive_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(emissive) = (modifier as &dyn Any).downcast_ref::<EmissiveModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let mut body = "{\n".to_string()
        + &format!("  vec3 emissiveTerm = u_emissiveColor{suffix} * u_emissiveStrength{suffix};\n");
    if emissive.mask.is_some() {
        body += &format!("  emissiveTerm *= texture(u_emissiveMask{suffix}, v_uv0).rgb;\n");
    }
    if is_emissive_gated(emissive) {
        body += "  vec3 emissiveLightDir = u_directionalCount > 0.5 ? normalize(-u_directional.xyz) : vec3(0.0, 0.0, 1.0);\n";
        body += &format!(
            "  float emissiveFacing = dot(normal, emissiveLightDir) * u_emissiveFacingSign{suffix};\n"
        );
        body += &format!("  float emissiveSoft = max(u_emissiveFacingSoftness{suffix}, 1e-4);\n");
        body += "  emissiveTerm *= smoothstep(-emissiveSoft, emissiveSoft, emissiveFacing);\n";
    }
    body += "  emissive += emissiveTerm;\n}";
    return body;
}

fn contribute_env_reflect_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return "{\n".to_string()
        + "  vec3 envReflectDir = reflect(-viewDir, normal);\n"
        + &format!(
            "  float envReflectMip = clamp(u_envReflectRoughness{suffix}, 0.0, 1.0) * max(u_iblMaxMip, 0.0);\n"
        )
        + &format!(
            "  vec3 envReflectSample = u_iblEnabled > 0.5 ? textureLod(u_iblPrefiltered, envReflectDir, envReflectMip).rgb : u_envReflectTint{suffix};\n"
        )
        + &format!(
            "  float envReflectFresnel = u_envReflectFresnel{suffix} + (1.0 - u_envReflectFresnel{suffix}) * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);\n"
        )
        + &format!(
            "  radiance += envReflectSample * u_envReflectTint{suffix} * (u_envReflectIntensity{suffix} * envReflectFresnel);\n"
        )
        + "}";
}

fn contribute_fog_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(fog) = (modifier as &dyn Any).downcast_ref::<FogModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let factor = if fog.mode == FogModifierMode::Exponential {
        format!("  float fogFactor = 1.0 - exp(-u_fogDensity{suffix} * fogDist);\n")
    } else if fog.mode == FogModifierMode::Exponential2 {
        format!(
            "  float fogTerm = u_fogDensity{suffix} * fogDist;\n  float fogFactor = 1.0 - exp(-fogTerm * fogTerm);\n"
        )
    } else {
        format!(
            "  float fogFactor = clamp((fogDist - u_fogNear{suffix}) / max(u_fogFar{suffix} - u_fogNear{suffix}, 1e-4), 0.0, 1.0);\n"
        )
    };
    return "{\n".to_string()
        + "  float fogDist = length(u_cameraPosition - v_worldPosition);\n"
        + &factor
        + &format!(
            "  radiance = mix(radiance, u_fogColor{suffix}, clamp(fogFactor, 0.0, 1.0));\n"
        )
        + "}";
}

fn contribute_rim_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return "{\n".to_string()
        + &format!(
            "  float rim = clamp(u_rimBias{suffix} + u_rimIntensity{suffix} * pow(1.0 - max(dot(normal, viewDir), 0.0), max(u_rimPower{suffix}, 0.0001)), 0.0, 1.0);\n"
        )
        + &format!("  radiance += u_rimColor{suffix} * rim;\n")
        + "}";
}

fn contribute_toon_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return "{\n".to_string()
        + "  float toonLum = dot(radiance, vec3(0.2126, 0.7152, 0.0722));\n"
        + &format!("  float toonSteps = max(u_toonSteps{suffix}, 2.0);\n")
        + "  float toonScaled = toonLum * toonSteps;\n"
        + "  float toonBand = floor(toonScaled);\n"
        + "  float toonFrac = toonScaled - toonBand;\n"
        + &format!("  float toonSoft = max(u_toonSmoothness{suffix}, 1e-4);\n")
        + "  float toonQuant = (toonBand + smoothstep(0.5 - toonSoft, 0.5 + toonSoft, toonFrac)) / toonSteps;\n"
        + "  radiance *= toonLum > 1e-4 ? toonQuant / toonLum : 1.0;\n"
        + "}";
}

fn contribute_vertex_displace_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(displace) = (modifier as &dyn Any).downcast_ref::<VertexDisplaceModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let axis = if displace.axis.is_some() {
        format!("  vec3 vDisplaceAxis = normalize(u_vDisplaceAxis{suffix});\n")
    } else {
        "  vec3 vDisplaceAxis = normalize(localNormal);\n".to_string()
    };
    let amount = if displace.source == VertexDisplaceModifierSource::HeightMap {
        format!(
            "  float vDisplaceAmount = texture(u_vDisplaceMap{suffix}, vertexUv).r * u_vDisplaceAmplitude{suffix};\n"
        )
    } else {
        format!(
            "  float vDisplacePhase = dot(localPosition.xyz, normalize(u_vDisplaceDir{suffix})) * u_vDisplaceFrequency{suffix} + u_time * u_vDisplaceSpeed{suffix};\n  float vDisplaceAmount = sin(vDisplacePhase) * u_vDisplaceAmplitude{suffix};\n"
        )
    };
    return "{\n".to_string()
        + &axis
        + &amount
        + "  localPosition.xyz += vDisplaceAxis * vDisplaceAmount;\n"
        + "}";
}

fn declare_animated_normal_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(animated) = (modifier as &dyn Any).downcast_ref::<AnimatedNormalModifier>() else {
        return String::new();
    };
    if animated.map.is_none() {
        return String::new();
    }
    let suffix = format!("_{index}");
    let mut source = format!("uniform sampler2D u_animNormalMap{suffix};\n")
        + &format!("uniform vec2 u_animNormalScroll{suffix};\n")
        + &format!("uniform float u_animNormalStrength{suffix};\n");
    if animated.secondary_map.is_some() {
        source += &format!(
            "uniform sampler2D u_animNormalMap2{suffix};\nuniform vec2 u_animNormalScroll2{suffix};\n"
        );
    }
    return source;
}

fn declare_dissolve_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(dissolve) = (modifier as &dyn Any).downcast_ref::<DissolveModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let mut source = format!("uniform float u_dissolveThreshold{suffix};\n")
        + &format!("uniform float u_dissolveEdgeWidth{suffix};\n")
        + &format!("uniform vec3 u_dissolveEdgeColor{suffix};\n");
    source += &if dissolve.map.is_some() {
        format!("uniform sampler2D u_dissolveMap{suffix};\n")
    } else {
        format!("uniform float u_dissolveScale{suffix};\n")
    };
    return source;
}

fn declare_emissive_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(emissive) = (modifier as &dyn Any).downcast_ref::<EmissiveModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let mut source = format!(
        "uniform vec3 u_emissiveColor{suffix};\nuniform float u_emissiveStrength{suffix};\n"
    );
    if emissive.mask.is_some() {
        source += &format!("uniform sampler2D u_emissiveMask{suffix};\n");
    }
    if is_emissive_gated(emissive) {
        source += &format!(
            "uniform float u_emissiveFacingSign{suffix};\nuniform float u_emissiveFacingSoftness{suffix};\n"
        );
    }
    return source;
}

fn declare_env_reflect_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return "uniform samplerCube u_iblPrefiltered;\n".to_string()
        + "uniform float u_iblEnabled;\n"
        + "uniform float u_iblMaxMip;\n"
        + &format!("uniform vec3 u_envReflectTint{suffix};\n")
        + &format!("uniform float u_envReflectIntensity{suffix};\n")
        + &format!("uniform float u_envReflectFresnel{suffix};\n")
        + &format!("uniform float u_envReflectRoughness{suffix};\n");
}

fn declare_fog_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(fog) = (modifier as &dyn Any).downcast_ref::<FogModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let mut source = format!("uniform vec3 u_fogColor{suffix};\n");
    source += &if fog.mode == FogModifierMode::Linear {
        format!("uniform float u_fogNear{suffix};\nuniform float u_fogFar{suffix};\n")
    } else {
        format!("uniform float u_fogDensity{suffix};\n")
    };
    return source;
}

fn declare_rim_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return format!("uniform vec3 u_rimColor{suffix};\n")
        + &format!("uniform float u_rimPower{suffix};\n")
        + &format!("uniform float u_rimIntensity{suffix};\n")
        + &format!("uniform float u_rimBias{suffix};\n");
}

fn declare_toon_gl_modifier(_modifier: &dyn Modifier, index: usize) -> String {
    let suffix = format!("_{index}");
    return format!(
        "uniform float u_toonSteps{suffix};\nuniform float u_toonSmoothness{suffix};\n"
    );
}

fn declare_vertex_displace_gl_modifier(modifier: &dyn Modifier, index: usize) -> String {
    let Some(displace) = (modifier as &dyn Any).downcast_ref::<VertexDisplaceModifier>() else {
        return String::new();
    };
    let suffix = format!("_{index}");
    let mut source = format!("uniform float u_vDisplaceAmplitude{suffix};\n");
    if displace.axis.is_some() {
        source += &format!("uniform vec3 u_vDisplaceAxis{suffix};\n");
    }
    source += &if displace.source == VertexDisplaceModifierSource::HeightMap {
        format!("uniform sampler2D u_vDisplaceMap{suffix};\n")
    } else {
        format!(
            "uniform float u_vDisplaceFrequency{suffix};\nuniform float u_vDisplaceSpeed{suffix};\nuniform vec3 u_vDisplaceDir{suffix};\n"
        )
    };
    return source;
}

// The shading definition's define signature (TS: the spread `getDefineSignature` of the built-in
// modifier definition), read from the modifier kind itself.
fn get_gl_modifier_define_signature(modifier: &dyn Modifier) -> String {
    return modifier.modifier_define_signature();
}

// Looks a modifier uniform up on the bind context's linked program (TS inline
// `gl.getUniformLocation(context.program, name)`).
fn get_gl_modifier_uniform_location(
    context: &GlModifierBindContext<'_>,
    name: &str,
) -> Option<NativeUniformLocation> {
    // SAFETY: the lookup runs on the owning GL thread.
    return unsafe { context.state.gl.get_uniform_location(context.program, name) };
}

fn is_emissive_gated(modifier: &EmissiveModifier) -> bool {
    return modifier.facing != EmissiveModifierFacing::Ignore;
}

// Registers the built-in GL modifier snippets on this state. Opt-in (no top-level side effect) and
// separate from register_gl_shaded_material so a plain ShadedMaterial pays nothing for modifier
// snippets it does not use — a caller registers this once alongside any vendor-prefixed snippets
// before drawing a ShadedMaterial that carries modifiers.
pub fn register_built_in_gl_modifier_snippets(state: &mut GlRenderState) {
    register_gl_modifier_snippet(state, &ANIMATED_NORMAL_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &DISSOLVE_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &EMISSIVE_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &ENV_REFLECT_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &FOG_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &RIM_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &TOON_GL_MODIFIER_SNIPPET);
    register_gl_modifier_snippet(state, &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET);
}
