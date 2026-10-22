use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use flight_color::{LinearColor, allocate_linear_color};
use flight_entity::Ref;
use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;
use flight_shading::{
    EmissiveModifier, FogModifierMode, MODIFIER_SLOT_DIFFUSE, MODIFIER_SLOT_EFFECT,
    MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL, MODIFIER_SLOT_SPECULAR, MODIFIER_SLOT_VERTEX,
    Modifier, ModifierFields, ShadedMaterial, VertexDisplaceModifierSource,
    create_animated_normal_modifier, create_dissolve_modifier, create_emissive_modifier,
    create_env_reflect_modifier, create_fog_modifier, create_rim_modifier, create_shaded_material,
    create_toon_modifier, create_vertex_displace_modifier,
};
use flight_texture::Texture;

use crate::support::*;

// A bare vendor modifier of an open kind (the source's `allocateEntity` with kind and slot).
#[derive(Clone, Debug)]
struct VendorModifier {
    fields: ModifierFields,
}

flight_shading::impl_modifier!(VendorModifier);

fn vendor_modifier(kind: &str, slot: &str) -> Ref<dyn Modifier> {
    let mut fields: ModifierFields = test_default();
    fields.kind = kind.to_string();
    fields.slot = slot.to_string();
    return Arc::new(RwLock::new(VendorModifier { fields }));
}

fn share<M: Modifier + 'static>(modifier: M) -> Ref<dyn Modifier> {
    return Arc::new(RwLock::new(modifier));
}

fn shaded_with(modifiers: Vec<Ref<dyn Modifier>>) -> ShadedMaterial {
    let mut material = create_shaded_material();
    material.modifiers = modifiers;
    return material;
}

fn white() -> LinearColor {
    let mut out = allocate_linear_color();
    out.r = 1.0;
    out.g = 1.0;
    out.b = 1.0;
    out.a = 1.0;
    return out;
}

fn rim(color: u32) -> Ref<dyn Modifier> {
    let mut modifier = create_rim_modifier();
    modifier.color = color;
    return share(modifier);
}

fn emissive(color: u32, mask: Option<Ref<Texture>>, strength: f32) -> EmissiveModifier {
    let mut modifier = create_emissive_modifier();
    modifier.color = color;
    modifier.mask = mask;
    modifier.strength = strength;
    return modifier;
}

fn texture_ref(texture: Texture) -> Ref<Texture> {
    return Arc::new(RwLock::new(texture));
}

fn contribution(source: &str, declarations: Option<&str>) -> WgpuModifierContribution {
    return WgpuModifierContribution {
        declarations: declarations.map(str::to_string),
        source: source.to_string(),
    };
}

fn vendor_snippet(
    kind: &'static str,
    slot: &'static str,
    contribution: fn(&dyn Modifier, usize, &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution,
) -> &'static WgpuModifierSnippet {
    return Box::leak(Box::new(WgpuModifierSnippet {
        kind,
        slot,
        get_define_signature: None,
        bind: None,
        contribution,
        textures: None,
    }));
}

fn record_nothing(_runtime: &mut WgpuRenderStateRuntime, _value: Option<&WgpuColorScaleBiasInput>, _index: u32) {}

fn resolve_nothing(_state: &mut WgpuRenderState, _count: u32) -> Option<WgpuColorAdjustmentFlush> {
    return None;
}

static COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }",
    matrix_fragment_shader_chunk: "fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }",
    draw_shape_meshes: None,
    record: record_nothing,
    resolve_flush: resolve_nothing,
};

fn snippet_table(state: &WgpuRenderState) -> Arc<flight_registry::KindMap<&'static WgpuModifierSnippet>> {
    return get_wgpu_render_state_runtime(state).registries.modifier_snippets.clone();
}

mod bind_wgpu_shaded_surface {
    use super::*;

    #[test]
    fn uploads_the_base_and_modifier_uniform_block_and_binds_group_resources() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_image_texture_resolver(&mut test.state);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let material = shaded_with(vec![rim(0xffffffff)]);
        let pipeline = ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > 0);
        let writes = test.buffer_writes();
        let uniform = bytes_to_f32(&writes.last().unwrap().data);
        // The base block (12 floats) plus one modifier's three vec4 record.
        assert_eq!(uniform.len(), 24);
        assert_eq!(&uniform[..4], &[1.0, 1.0, 1.0, 1.0]);
    }
}

mod build_wgpu_shaded_cache_key {
    use super::*;

    #[test]
    fn canonicalizes_cross_slot_order_and_captures_modifier_structural_variants() {
        let rim = rim(0xffffffff);
        let glow = share(emissive(0xffffffff, None, 1.0));
        let a = shaded_with(vec![rim.clone(), glow.clone()]);
        let b = shaded_with(vec![glow, rim]);
        assert_eq!(build_wgpu_shaded_cache_key(&a, None), build_wgpu_shaded_cache_key(&b, None));

        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let table = snippet_table(&test.state);
        let masked = shaded_with(vec![share(emissive(
            0xffffffff,
            Some(texture_ref(create_test_unbacked_texture())),
            1.0,
        ))]);
        let plain = shaded_with(vec![share(emissive(0xffffffff, None, 1.0))]);
        assert_ne!(
            build_wgpu_shaded_cache_key(&masked, Some(WgpuModifierSnippetSource::Snippets(&table))),
            build_wgpu_shaded_cache_key(&plain, Some(WgpuModifierSnippetSource::Snippets(&table)))
        );
        // The substrate-neutral registry carries the built-in definitions' signatures too.
        let mut registry = flight_shading::create_modifier_registry();
        flight_shading::register_built_in_modifiers(&mut registry);
        assert_ne!(
            build_wgpu_shaded_cache_key(&masked, Some(WgpuModifierSnippetSource::Registry(&registry))),
            build_wgpu_shaded_cache_key(&a, Some(WgpuModifierSnippetSource::Registry(&registry)))
        );
    }
}

mod ensure_wgpu_shaded_pipeline {
    use super::*;

    #[test]
    fn caches_shaded_opaque_and_blended_variants_separately() {
        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let material = shaded_with(vec![rim(0xffffffff)]);
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        get_wgpu_scene3d_runtime(&mut test.state).active_blended_run = true;
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        let keys: Vec<String> = get_wgpu_scene3d_runtime(&mut test.state)
            .pipeline_cache
            .keys()
            .cloned()
            .collect();
        assert!(keys.iter().any(|key| key.starts_with("shaded:") && key.ends_with("|opaque|rigid|direct")));
        assert!(keys.iter().any(|key| key.starts_with("shaded:") && key.ends_with("|blend:Normal|rigid|direct")));
    }

    #[test]
    fn reserves_alpha_map_binding_5_and_starts_modifier_textures_at_binding_6() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_image_texture_resolver(&mut test.state);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let mask = texture_ref(create_test_unbacked_texture());
        let material = shaded_with(vec![share(emissive(0xffffffff, Some(mask), 1.0))]);
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        let layout = test
            .bind_group_layouts()
            .into_iter()
            .find(|layout| layout.entries.iter().any(|entry| entry.binding == 6))
            .unwrap();
        let bindings: Vec<u32> = layout.entries.iter().map(|entry| entry.binding).collect();
        assert_eq!(bindings, vec![0, 1, 2, 3, 4, 5, 6]);
    }

    fn contribute_marker_a(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// compiler-marker-A", None);
    }

    fn contribute_marker_b(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// compiler-marker-B", None);
    }

    #[test]
    fn recompiles_after_a_last_write_wins_snippet_replacement_with_the_same_define_signature() {
        let mut test = make_wgpu_scene3d_state(None);
        let modifier = vendor_modifier("acme.Replace", MODIFIER_SLOT_EFFECT);
        register_wgpu_modifier_snippet(
            &mut test.state,
            vendor_snippet("acme.Replace", MODIFIER_SLOT_EFFECT, contribute_marker_a),
        );
        let material = shaded_with(vec![modifier]);
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        let before = test.count("createShaderModule");

        register_wgpu_modifier_snippet(
            &mut test.state,
            vendor_snippet("acme.Replace", MODIFIER_SLOT_EFFECT, contribute_marker_b),
        );
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        let modules = test.shader_sources();

        assert_eq!(modules.len(), before + 1);
        assert!(modules.last().unwrap().contains("compiler-marker-B"));
    }
}

mod get_wgpu_shaded_module_source {
    use super::*;

    #[test]
    fn splices_the_registered_feature_after_the_shaded_result_only_for_an_opted_in_variant() {
        let material = create_shaded_material();
        let base = get_wgpu_shaded_module_source(&material, None, None, None, None, None);
        let adjusted =
            get_wgpu_shaded_module_source(&material, None, Some(false), None, Some(&COLOR_FEATURE), None);
        assert!(!base.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("draw.flightColorScale"));
    }

    #[test]
    fn splices_the_full_matrix_feature_after_the_shaded_result() {
        let matrix = get_wgpu_shaded_module_source(
            &create_shaded_material(),
            None,
            Some(false),
            None,
            Some(&COLOR_FEATURE),
            Some(true),
        );
        assert!(matrix.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(matrix.contains("draw.flightColorMatrix0"));
    }

    #[test]
    fn threads_the_has_skin_palette_variant_through_the_composed_classic_base() {
        let material = create_shaded_material();
        assert!(!get_wgpu_shaded_module_source(&material, None, None, None, None, None).contains("jointTexture"));
        assert!(get_wgpu_shaded_module_source(
            &material,
            None,
            Some(true),
            Some(make_wgpu_skinning_adapter()),
            None,
            None
        )
        .contains("textureLoad(jointTexture"));
    }

    #[test]
    fn composes_all_built_in_fragment_modifier_families_into_one_shader() {
        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let texture = texture_ref(create_test_unbacked_texture());
        let mut animated = create_animated_normal_modifier();
        animated.map = Some(texture.clone());
        animated.scroll.x = 0.1;
        animated.scroll.y = 0.2;
        let mut dissolve = create_dissolve_modifier();
        dissolve.threshold = 0.2;
        let mut fog = create_fog_modifier();
        fog.color = 0xffffffff;
        fog.mode = FogModifierMode::Exponential2;
        let mut toon = create_toon_modifier();
        toon.steps = 3.0;
        let material = shaded_with(vec![
            share(animated),
            share(emissive(0xff0000ff, Some(texture), 2.0)),
            rim(0x00ffffff),
            share(dissolve),
            share(create_env_reflect_modifier()),
            share(fog),
            share(toon),
        ]);
        let table = snippet_table(&test.state);
        let source = get_wgpu_shaded_module_source(
            &material,
            Some(WgpuModifierSnippetSource::Snippets(&table)),
            None,
            None,
            None,
            None,
        );
        assert!(source.contains("animatedNormal"));
        assert!(source.contains("emissiveTerm"));
        assert!(source.contains("rimFactor"));
        assert!(source.contains("shadedValueNoise"));
        assert!(source.contains("iblPrefiltered"));
        assert!(source.contains("exp(-pow("));
        assert!(source.contains("toonQuant"));
        assert!(source.contains("@group(2) @binding(6) var modifierTexture6"));
        // The composed module is valid WGSL against the composed layout.
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
    }

    #[test]
    fn injects_vertex_displacement_before_the_world_transform() {
        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let mut displace = create_vertex_displace_modifier();
        displace.amplitude = 0.25;
        displace.source = VertexDisplaceModifierSource::Sine;
        let material = shaded_with(vec![share(displace)]);
        let table = snippet_table(&test.state);
        let source = get_wgpu_shaded_module_source(
            &material,
            Some(WgpuModifierSnippetSource::Snippets(&table)),
            None,
            None,
            None,
            None,
        );
        assert!(
            source.find("localPosition = vec4f(localPosition.xyz").unwrap()
                < source.find("let world = draw.world * localPosition").unwrap()
        );
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
    }

    fn contribute_glow(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("radiance = radiance + vec3f(0.125);\\n", None);
    }

    #[test]
    fn composes_a_registered_vendor_kind_and_treats_an_unregistered_kind_as_an_explicit_miss() {
        let mut test = make_wgpu_scene3d_state(None);
        let vendor = vendor_snippet("acme.Glow", MODIFIER_SLOT_EFFECT, contribute_glow);
        register_wgpu_modifier_snippet(&mut test.state, vendor);
        let material = shaded_with(vec![
            vendor_modifier("acme.Glow", MODIFIER_SLOT_EFFECT),
            vendor_modifier("acme.Missing", MODIFIER_SLOT_EFFECT),
        ]);
        let table = snippet_table(&test.state);
        let source = get_wgpu_shaded_module_source(
            &material,
            Some(WgpuModifierSnippetSource::Snippets(&table)),
            None,
            None,
            None,
            None,
        );
        assert!(source.contains("radiance = radiance + vec3f(0.125)"));
        assert!(build_wgpu_shaded_cache_key(&material, Some(WgpuModifierSnippetSource::Snippets(&table)))
            .contains("acme.Missing"));
        assert!(resolve_wgpu_modifier_snippet(&test.state, "acme.Glow")
            .is_some_and(|snippet| std::ptr::eq(snippet, vendor)));
        assert!(resolve_wgpu_modifier_snippet(&test.state, "acme.Missing").is_none());
    }

    fn contribute_slot_0(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_0\nnormal = normal;", None);
    }
    fn contribute_slot_1(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_1\ndiffuse = diffuse;", None);
    }
    fn contribute_slot_2(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_2\nspecularColor = specularColor;", None);
    }
    fn contribute_slot_3(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_3\nemissive = emissive;", None);
    }
    fn contribute_slot_4(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_4\nradiance = radiance;", None);
    }
    fn contribute_slot_5(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("// slot_marker_5\nlocalPosition = localPosition;", None);
    }

    #[test]
    fn routes_every_open_modifier_slot_and_delimits_vendor_contributions() {
        let mut test = make_wgpu_scene3d_state(None);
        let slots: [(&'static str, &'static str, fn(&dyn Modifier, usize, &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution); 6] = [
            ("acme.Slot0", MODIFIER_SLOT_NORMAL, contribute_slot_0),
            ("acme.Slot1", MODIFIER_SLOT_DIFFUSE, contribute_slot_1),
            ("acme.Slot2", MODIFIER_SLOT_SPECULAR, contribute_slot_2),
            ("acme.Slot3", MODIFIER_SLOT_EMISSIVE, contribute_slot_3),
            ("acme.Slot4", MODIFIER_SLOT_EFFECT, contribute_slot_4),
            ("acme.Slot5", MODIFIER_SLOT_VERTEX, contribute_slot_5),
        ];
        let mut modifiers = Vec::new();
        for (kind, slot, contribute) in slots {
            register_wgpu_modifier_snippet(&mut test.state, vendor_snippet(kind, slot, contribute));
            modifiers.push(vendor_modifier(kind, slot));
        }
        let table = snippet_table(&test.state);
        let material = shaded_with(modifiers);
        let source = get_wgpu_shaded_module_source(
            &material,
            Some(WgpuModifierSnippetSource::Snippets(&table)),
            None,
            None,
            None,
            None,
        );
        for index in 0..6 {
            assert!(source.contains(&format!("slot_marker_{}", index)));
        }
        let marker = source.find("// slot_marker_1").unwrap();
        let after: String = source[marker + "// slot_marker_1".len()..]
            .split_whitespace()
            .take(5)
            .collect::<Vec<&str>>()
            .join(" ");
        assert_eq!(after, "diffuse = diffuse; if (ALPHA_MASK");
        assert!(source.find("slot_marker_2").unwrap() < source.find("var radiance").unwrap());
        ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
    }

    fn contribute_declaration_a(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("", Some("fn vendorA() {}"));
    }
    fn contribute_declaration_b(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        return contribution("", Some("fn vendorB() {}"));
    }

    #[test]
    fn deduplicates_repeated_helper_declarations_and_separates_arbitrary_declaration_blocks() {
        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        register_wgpu_modifier_snippet(
            &mut test.state,
            vendor_snippet("acme.DeclarationA", MODIFIER_SLOT_EFFECT, contribute_declaration_a),
        );
        register_wgpu_modifier_snippet(
            &mut test.state,
            vendor_snippet("acme.DeclarationB", MODIFIER_SLOT_EFFECT, contribute_declaration_b),
        );
        let mut first = create_dissolve_modifier();
        first.threshold = 0.1;
        let mut second = create_dissolve_modifier();
        second.threshold = 0.2;
        let material = shaded_with(vec![
            share(first),
            share(second),
            vendor_modifier("acme.DeclarationA", MODIFIER_SLOT_EFFECT),
            vendor_modifier("acme.DeclarationB", MODIFIER_SLOT_EFFECT),
        ]);
        let table = snippet_table(&test.state);
        let source = get_wgpu_shaded_module_source(
            &material,
            Some(WgpuModifierSnippetSource::Snippets(&table)),
            None,
            None,
            None,
            None,
        );
        assert_eq!(source.matches("fn shadedValueNoise").count(), 1);
        assert!(source.contains("fn vendorA() {}\nfn vendorB() {}"));
    }
}

mod register_built_in_wgpu_modifier_snippets {
    use super::*;

    #[test]
    fn installs_the_built_in_compiler_records_explicitly() {
        let mut test = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        assert!(resolve_wgpu_modifier_snippet(&test.state, "RimModifier").is_some());
        assert_eq!(
            [
                ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET.kind,
                DISSOLVE_WGPU_MODIFIER_SNIPPET.kind,
                EMISSIVE_WGPU_MODIFIER_SNIPPET.kind,
                ENV_REFLECT_WGPU_MODIFIER_SNIPPET.kind,
                FOG_WGPU_MODIFIER_SNIPPET.kind,
                RIM_WGPU_MODIFIER_SNIPPET.kind,
                TOON_WGPU_MODIFIER_SNIPPET.kind,
                VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET.kind,
            ],
            [
                "AnimatedNormalModifier",
                "DissolveModifier",
                "EmissiveModifier",
                "EnvReflectModifier",
                "FogModifier",
                "RimModifier",
                "ToonModifier",
                "VertexDisplaceModifier",
            ]
        );
    }
}

mod shaded_binding_cache {
    use super::*;

    fn ready_texture() -> Ref<Texture> {
        return texture_ref(create_test_bitmap_texture(1, 1));
    }

    fn set_texture_source(texture: &Ref<Texture>, source: &Ref<Texture>) {
        let source = match &*source.read().unwrap() {
            Texture::Texture2D(source) => source.source.clone(),
            _ => None,
        };
        if let Texture::Texture2D(texture) = &mut *texture.write().unwrap() {
            texture.source = source;
        }
    }

    #[test]
    fn owns_gpu_bindings_per_render_state_when_a_material_is_shared_across_devices() {
        let mut first = make_wgpu_scene3d_state(None);
        let mut second = make_wgpu_scene3d_state(None);
        register_built_in_wgpu_modifier_snippets(&mut first.state);
        register_built_in_wgpu_modifier_snippets(&mut second.state);
        let material = create_shaded_material();
        let format = wgpu::TextureFormat::Bgra8Unorm;
        let first_pipeline = ensure_wgpu_shaded_pipeline(&mut first.state, &material, format);
        let second_pipeline = ensure_wgpu_shaded_pipeline(&mut second.state, &material, format);

        let first_group = bind_wgpu_shaded_surface(&mut first.state, &first_pipeline, &material, &white(), &white());
        let first_buffers = first.count("createBuffer");
        let first_groups = first.count("createBindGroup");
        let second_before = second.count("createBindGroup");
        bind_wgpu_shaded_surface(&mut second.state, &second_pipeline, &material, &white(), &white());
        let first_again = bind_wgpu_shaded_surface(&mut first.state, &first_pipeline, &material, &white(), &white());

        // Handles on two devices compare by per-device id, so the second state's own binding is
        // observed as the group it built on its own device.
        assert_eq!(second.count("createBindGroup"), second_before + 1);
        assert_eq!(second.count("createBuffer"), 1);
        assert_eq!(first_again, first_group);
        assert_eq!(first.count("createBuffer"), first_buffers);
        assert_eq!(first.count("createBindGroup"), first_groups);
    }

    #[test]
    fn reuses_its_uniform_allocation_while_rebuilding_for_texture_identity_and_readiness_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_bitmap_texture_resolver(&mut test.state);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let format = wgpu::TextureFormat::Bgra8Unorm;
        let mut material = create_shaded_material();
        material.diffuse_map = Some(ready_texture());
        let pipeline = ensure_wgpu_shaded_pipeline(&mut test.state, &material, format);
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        let buffers = test.count("createBuffer");
        let groups = test.count("createBindGroup");

        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert_eq!(test.count("createBuffer"), buffers);
        assert_eq!(test.count("createBindGroup"), groups);

        material.diffuse_map = Some(ready_texture());
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > groups);
        assert_eq!(test.count("createBuffer"), buffers);

        let glow = Arc::new(RwLock::new(emissive(0xffffffff, Some(ready_texture()), 1.0)));
        material.modifiers = vec![glow.clone()];
        let modifier_pipeline = ensure_wgpu_shaded_pipeline(&mut test.state, &material, format);
        bind_wgpu_shaded_surface(&mut test.state, &modifier_pipeline, &material, &white(), &white());
        let before_modifier_swap = test.count("createBindGroup");
        glow.write().unwrap().mask = Some(ready_texture());
        bind_wgpu_shaded_surface(&mut test.state, &modifier_pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > before_modifier_swap);

        let readying = texture_ref(create_test_unbacked_texture());
        glow.write().unwrap().mask = Some(readying.clone());
        bind_wgpu_shaded_surface(&mut test.state, &modifier_pipeline, &material, &white(), &white());
        let before_ready = test.count("createBindGroup");
        set_texture_source(&readying, &ready_texture());
        bind_wgpu_shaded_surface(&mut test.state, &modifier_pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > before_ready);
    }

    #[test]
    fn rebinds_when_a_ready_image_swaps_or_its_version_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_bitmap_texture_resolver(&mut test.state);
        register_built_in_wgpu_modifier_snippets(&mut test.state);
        let texture = ready_texture();
        let mut material = create_shaded_material();
        material.diffuse_map = Some(texture.clone());
        let pipeline = ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());

        let before_swap = test.count("createBindGroup");
        set_texture_source(&texture, &ready_texture());
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > before_swap);

        let before_version = test.count("createBindGroup");
        if let Texture::Texture2D(texture) = &*texture.read().unwrap() {
            let source = texture.source.clone().unwrap();
            source.write().unwrap().texture_source_fields_mut().version += 1;
        }
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert!(test.count("createBindGroup") > before_version);
    }

    static CONTRIBUTIONS: AtomicU32 = AtomicU32::new(0);

    fn contribute_stable(_: &dyn Modifier, _: usize, _: &mut WgpuModifierCompileContext<'_>) -> WgpuModifierContribution {
        CONTRIBUTIONS.fetch_add(1, Ordering::SeqCst);
        return contribution("radiance = radiance;", None);
    }

    #[test]
    fn reuses_the_compiled_plan_and_gpu_resource_arrays_on_an_unchanged_draw() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_modifier_snippet(
            &mut test.state,
            vendor_snippet("acme.Stable", MODIFIER_SLOT_EFFECT, contribute_stable),
        );
        let material = shaded_with(vec![vendor_modifier("acme.Stable", MODIFIER_SLOT_EFFECT)]);
        let pipeline = ensure_wgpu_shaded_pipeline(&mut test.state, &material, wgpu::TextureFormat::Bgra8Unorm);
        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        let buffers = test.count("createBuffer");
        let groups = test.count("createBindGroup");
        let compiled = CONTRIBUTIONS.load(Ordering::SeqCst);

        bind_wgpu_shaded_surface(&mut test.state, &pipeline, &material, &white(), &white());
        assert_eq!(CONTRIBUTIONS.load(Ordering::SeqCst), compiled);
        assert_eq!(test.count("createBuffer"), buffers);
        assert_eq!(test.count("createBindGroup"), groups);
    }
}
