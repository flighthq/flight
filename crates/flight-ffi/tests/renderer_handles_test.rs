use std::fs;
use std::path::Path;
use std::process::Command;

#[allow(dead_code)]
#[path = "../renderer_handles.rs"]
mod renderer_handles;

use renderer_handles::{
    GL_STATE_CONTRACT, RendererFamily, StaticForm, classify_static, collect_builtin_renderers,
    guard_node_renderer_instantiation, validate_kind,
};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const HEADER: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_ffi.h"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));
const SHIM: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_hl.c"));

// Every built-in renderer and preset static of the GL and wgpu owning crates, with its crate and
// family. A static added, removed, renamed or retyped upstream fails the inventory below.
const INVENTORY: &[(&str, &str, RendererFamily)] = &[
    (
        "GL_BITMAP_TEXT_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_BLINN_PHONG_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_DEPTH_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_EMISSIVE_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_LAMBERT_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_MATCAP_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_MESH_SHAPE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_MORPH_SHAPE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_NORMAL_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_PARTICLE_EMITTER2D_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_PHONG_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_QUAD_BATCH_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_RASTER_SHAPE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_RENDER_CACHE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_RICH_TEXT_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_SCALE9_SHAPE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_SCALE9_SPRITE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_SCENE2D_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_SHADED_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_SHAPE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_SPRITE_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_STANDARD_PBR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_TEXT_LABEL_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_TILEMAP_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlNode,
    ),
    (
        "GL_TOON_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_UNLIT_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "GL_WIREFRAME_MESH_MATERIAL_RENDERER",
        "flight-scene3d-gl",
        RendererFamily::GlMeshMaterial,
    ),
    (
        "STANDARD_GL_QUAD_MATERIAL_RENDERER",
        "flight-scene2d-gl",
        RendererFamily::GlQuadMaterial,
    ),
    (
        "STANDARD_WGPU_QUAD_MATERIAL_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuQuadMaterial,
    ),
    (
        "WGPU_BITMAP_TEXT_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_BLINN_PHONG_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_DEPTH_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_EMISSIVE_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_LAMBERT_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_MATCAP_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_MESH_SHAPE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_MORPH_SHAPE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_NORMAL_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_PARTICLE_EMITTER2D_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_PHONG_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_QUAD_BATCH_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_RASTER_SHAPE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_RENDER_CACHE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_RICH_TEXT_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_SCALE9_SHAPE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_SCALE9_SPRITE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_SCENE2D_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_SCENE2D_RENDER_PRESET",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuRenderPreset,
    ),
    (
        "WGPU_SCENE3D_RENDER_PRESET",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuRenderPreset,
    ),
    (
        "WGPU_SHADED_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_SHAPE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_SPRITE_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_TEXT_LABEL_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_TILEMAP_RENDERER",
        "flight-scene2d-wgpu",
        RendererFamily::WgpuNode,
    ),
    (
        "WGPU_TOON_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_UNLIT_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
    (
        "WGPU_WIREFRAME_MESH_MATERIAL_RENDERER",
        "flight-scene3d-wgpu",
        RendererFamily::WgpuMeshMaterial,
    ),
];

mod classify_static {
    use super::*;

    #[test]
    fn places_each_renderer_type_in_its_family_and_form() {
        assert_eq!(
            classify_static("WGPU_SPRITE_RENDERER", "NodeRenderer < WgpuRenderState >"),
            Some((RendererFamily::WgpuNode, StaticForm::Value))
        );
        assert_eq!(
            classify_static(
                "GL_MORPH_SHAPE_RENDERER",
                "& NodeRenderer < GlRenderState >"
            ),
            Some((RendererFamily::GlNode, StaticForm::Alias))
        );
        assert_eq!(
            classify_static(
                "WGPU_SCENE2D_RENDER_PRESET",
                "LazyLock < WgpuScene2DRenderPreset >"
            ),
            Some((RendererFamily::WgpuRenderPreset, StaticForm::Lazy))
        );
        assert_eq!(classify_static("SCENE_WIDTH", "u32"), None);
    }

    #[test]
    #[should_panic(expected = "belongs to no renderer family")]
    fn refuses_a_renderer_static_no_family_covers() {
        let _ = classify_static("WGPU_HOLOGRAM_RENDERER", "HologramRenderer");
    }
}

mod collect_builtin_renderers {
    use super::*;

    #[test]
    fn inventories_exactly_the_built_in_renderers_and_presets_of_the_owning_crates() {
        let crates = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let mut sources = Vec::new();
        for crate_dir in renderer_handles::OWNING_CRATES {
            for entry in std::fs::read_dir(crates.join(crate_dir).join("src")).unwrap() {
                let path = entry.unwrap().path();
                let name = path.file_name().unwrap().to_string_lossy().to_string();
                if name.ends_with(".rs") && !name.contains("test") {
                    sources.push((
                        crate_dir.to_string(),
                        std::fs::read_to_string(path).unwrap(),
                    ));
                }
            }
        }
        let found: Vec<(String, String, RendererFamily)> = collect_builtin_renderers(&sources)
            .into_iter()
            .map(|builtin| (builtin.name, builtin.crate_dir, builtin.family))
            .collect();
        let expected: Vec<(String, String, RendererFamily)> = INVENTORY
            .iter()
            .map(|(name, crate_dir, family)| (name.to_string(), crate_dir.to_string(), *family))
            .collect();
        assert_eq!(found, expected);
    }
}

mod generate_renderer_handles {
    use super::*;

    // One borrowed producer per static, returning its family's own borrowed carrier, a C type of
    // its own that no free takes.
    #[test]
    fn lends_each_static_through_exactly_one_borrowed_producer() {
        assert!(STATS.contains(&format!(
            "FFI built-in renderer handles: {0} statics, {0} producers\n",
            INVENTORY.len()
        )));
        for (name, _, family) in INVENTORY {
            let producer = format!("flight_get_{}", name.to_lowercase());
            let signature = format!(
                "pub unsafe extern \"C\" fn {producer}() -> *const {} {{",
                family.borrowed()
            );
            assert_eq!(GENERATED.matches(&signature).count(), 1, "{producer}");
            let at = GENERATED.find(&signature).unwrap();
            let attributes = &GENERATED[..at];
            assert!(
                attributes.ends_with("#[doc = \"flight-ffi ownership|borrowed|the process remains alive\"]\n#[unsafe(no_mangle)]\n"),
                "{producer} must be a borrowed producer"
            );
            assert_eq!(
                HEADER
                    .matches(&format!(
                        "const {} * {producer}(void);",
                        family.borrowed_c()
                    ))
                    .count(),
                1,
                "{producer}"
            );
            assert!(!GENERATED.contains(&format!("fn flight_free_{}(", name.to_lowercase())));
        }
        for carrier in [
            "flight_sdk::NodeRenderer<",
            "flight_sdk::WgpuMeshMaterialRenderer)",
            "flight_sdk::GlMeshMaterialRenderer)",
            "flight_sdk::StandardGlQuadMaterialRenderer)",
            "flight_sdk::WgpuScene2DRenderPreset)",
        ] {
            assert!(
                !GENERATED
                    .lines()
                    .any(|line| line.contains("fn flight_free_") && line.contains(carrier)),
                "{carrier} has a free function"
            );
        }
        for family in RendererFamily::ALL {
            assert!(
                HEADER.contains(&format!("typedef struct {0} {0};\n", family.borrowed_c())),
                "{} has no opaque C type",
                family.identity()
            );
            assert!(
                !GENERATED.lines().any(
                    |line| line.contains("fn flight_free_") && line.contains(family.borrowed())
                ),
                "a free takes the borrowed {}",
                family.identity()
            );
            assert!(
                !HEADER.lines().any(
                    |line| line.contains("flight_free_") && line.contains(&family.borrowed_c())
                ),
                "a free takes the borrowed {}",
                family.identity()
            );
        }
    }

    // An owned renderer copy's free refuses every built-in's address before it releases anything,
    // so a borrowed handle forced through it with a cast is never freed.
    #[test]
    fn refuses_every_built_in_address_in_owned_renderer_frees() {
        let mut guarded = Vec::new();
        for family in RendererFamily::ALL {
            let parameter = format!("(ptr: *mut {}) {{\n", family.carrier());
            for (at, _) in GENERATED.match_indices(&parameter) {
                let line_start = GENERATED[..at].rfind('\n').unwrap() + 1;
                let name = GENERATED[line_start..at]
                    .strip_prefix("pub unsafe extern \"C\" fn ")
                    .unwrap();
                let body_start = at + parameter.len();
                let body = &GENERATED
                    [body_start..body_start + GENERATED[body_start..].find("\n}\n").unwrap()];
                let guard = body
                    .find("    if ffi_is_builtin_renderer(ptr.addr()) {\n        return;\n    }\n")
                    .unwrap_or_else(|| panic!("{name} frees without the built-in census guard"));
                assert!(guard < body.find("Box::from_raw(ptr)").unwrap(), "{name}");
                guarded.push(name);
            }
        }
        assert_eq!(guarded, ["flight_free_wgpu_quad_material_renderer"]);
        assert!(HEADER.contains("void flight_free_wgpu_quad_material_renderer(void * arg0);"));
    }

    // One census holds the address of every built-in of every backend and family, built from the
    // same inventory as the producers, and no family keeps a check of its own an owned free could
    // consult instead.
    #[test]
    fn counts_every_built_in_of_every_family_in_one_census() {
        let signature = format!(
            "fn ffi_builtin_renderer_addresses() -> [usize; {}] {{\n",
            INVENTORY.len()
        );
        assert_eq!(GENERATED.matches(&signature).count(), 1);
        let start = GENERATED.find(&signature).unwrap() + signature.len();
        let census = &GENERATED[start..start + GENERATED[start..].find("\n}\n").unwrap()];
        assert_eq!(census.matches(".addr()").count(), INVENTORY.len());
        for (name, _, family) in INVENTORY {
            assert!(
                census.lines().any(|entry| {
                    entry.contains(&format!("std::ptr::from_ref::<{}>(", family.carrier()))
                        && entry.contains(&format!("::contract::{name})"))
                }),
                "{name} is missing from the built-in census"
            );
        }
        assert!(GENERATED.contains(
            "fn ffi_is_builtin_renderer(address: usize) -> bool {\n    return ffi_builtin_renderer_addresses().contains(&address);\n}\n"
        ));
        assert!(!GENERATED.contains("fn ffi_is_builtin_gl_"));
        assert!(!GENERATED.contains("fn ffi_is_builtin_wgpu_"));
        assert!(STATS.contains(&format!(
            "built-in renderer census: {} addresses over 7 families, consulted by every owned renderer free",
            INVENTORY.len()
        )));
    }

    // Every borrowed wgpu mesh material return, the kind lookup and each per-material resolver,
    // lends the family's carrier, never an erased pointer an owned free would take.
    #[test]
    fn lends_borrowed_mesh_material_returns_as_their_carrier() {
        let typed: Vec<&str> = HEADER
            .lines()
            .filter(|line| {
                line.starts_with("const FlightBuiltinWgpuMeshMaterialRenderer * flight_")
                    && !line.ends_with("(void);")
            })
            .collect();
        assert_eq!(typed.len(), 6, "{typed:#?}");
        assert!(typed.contains(
            &"const FlightBuiltinWgpuMeshMaterialRenderer * flight_get_wgpu_mesh_material_renderer(void * arg0, const char * arg1);"
        ));
        assert!(
            typed
                .iter()
                .filter(|line| line.contains(" flight_resolve_wgpu_mesh_material_renderer__"))
                .count()
                == 5
        );
        assert!(!GENERATED.contains(") -> *const flight_sdk::WgpuMeshMaterialRenderer {"));
        assert!(!GENERATED.contains(") -> *mut flight_sdk::WgpuMeshMaterialRenderer {"));
    }

    // HashLink carries every built-in handle, produced, consumed or looked up, as its family's own
    // abstract type rather than erased bytes, so Haxe refuses another family's handle at compile
    // time just as C does.
    #[test]
    fn carries_built_in_handles_as_typed_hashlink_abstracts() {
        let mut checked = 0;
        for line in HEADER
            .lines()
            .filter(|line| line.contains("FlightBuiltin") && line.ends_with(");"))
        {
            if line.starts_with("typedef ") {
                continue;
            }
            let name = line[..line.find('(').unwrap()].rsplit(' ').next().unwrap();
            let expected: Vec<String> = line
                .match_indices("FlightBuiltin")
                .map(|(at, _)| {
                    let rest = &line[at..];
                    format!("_ABSTRACT({})", &rest[..rest.find(' ').unwrap()])
                })
                .collect();
            let prim = SHIM
                .lines()
                .find(|candidate| {
                    candidate.starts_with("DEFINE_PRIM(")
                        && candidate.contains(&format!(", {name}, "))
                })
                .unwrap_or_else(|| panic!("{name} has no HashLink primitive"));
            let abstracts: Vec<String> = prim
                .match_indices("_ABSTRACT(")
                .map(|(at, _)| prim[at..at + prim[at..].find(')').unwrap() + 1].to_string())
                .collect();
            assert_eq!(abstracts, expected, "{prim}");
            checked += 1;
        }
        assert_eq!(checked, INVENTORY.len() + 6 + 5);
        assert!(
            SHIM.contains("DEFINE_PRIM(_VOID, flight_free_wgpu_quad_material_renderer, _BYTES);")
        );
    }

    // Haxe, compiling against externs written from the shim's own primitive signatures, refuses every
    // family's handle, and the mesh lookup's, where another family's or an owned copy is expected,
    // and accepts a handle of the consumer's own family.
    #[test]
    fn hashlink_callers_cannot_pass_another_familys_handle() {
        if Command::new("haxe").arg("--version").output().is_err() {
            eprintln!("skipping the HashLink family matrix: no haxe compiler on PATH");
            return;
        }
        let work_dir = Path::new(env!("OUT_DIR")).join("flight-ffi-hashlink-family-matrix");
        fs::create_dir_all(&work_dir).unwrap();
        let mut sources: Vec<(String, (Vec<String>, String))> = Vec::new();
        let mut families = std::collections::BTreeSet::new();
        for (name, _, family) in INVENTORY {
            if families.insert(family.borrowed_c()) {
                let producer = format!("flight_get_{}", name.to_lowercase());
                sources.push((family.borrowed_c(), z_hashlink_primitive(&producer)));
            }
        }
        sources.push((
            "FlightBuiltinWgpuMeshMaterialRenderer".to_string(),
            z_hashlink_primitive("flight_get_wgpu_mesh_material_renderer"),
        ));
        let consumers = [
            "flight_register_wgpu_node_renderer",
            "flight_register_gl_node_renderer",
            "flight_register_wgpu_mesh_material_renderer",
            "flight_register_wgpu_quad_material_renderer",
            "flight_register_wgpu_render_preset",
            "flight_free_wgpu_quad_material_renderer",
        ];
        let mut accepted = 0;
        for (index, (family, (source_params, source_ret))) in sources.iter().enumerate() {
            assert_eq!(source_ret, &format!("_ABSTRACT({family})"), "{family}");
            for consumer in consumers {
                let (params, ret) = z_hashlink_primitive(consumer);
                assert_eq!(ret, "_VOID");
                let takes = params.last().unwrap().clone();
                let source_args = vec!["null"; source_params.len()].join(", ");
                let mut args = vec!["null".to_string(); params.len() - 1];
                args.push(format!("Native.produce({source_args})"));
                let program = format!(
                    "class Native {{\n  @:hlNative(\"flight\", \"produce\") public static function produce({}):{} {{ return null; }}\n  @:hlNative(\"flight\", \"consume\") public static function consume({}):Void {{}}\n}}\nclass Main {{\n  static function main() {{ Native.consume({}); }}\n}}\n",
                    z_haxe_parameters(source_params),
                    z_haxe_type(source_ret),
                    z_haxe_parameters(&params),
                    args.join(", ")
                );
                let dir = work_dir.join(format!("{index}-{consumer}"));
                fs::create_dir_all(&dir).unwrap();
                fs::write(dir.join("Main.hx"), program).unwrap();
                let compiled = Command::new("haxe")
                    .args(["-main", "Main", "--hl", "out.hl"])
                    .current_dir(&dir)
                    .output()
                    .unwrap();
                let diagnostics = String::from_utf8_lossy(&compiled.stderr);
                if takes == format!("_ABSTRACT({family})") {
                    assert!(
                        compiled.status.success(),
                        "Haxe refused {family} where its own family is taken by {consumer}:\n{diagnostics}"
                    );
                    accepted += 1;
                } else {
                    assert!(
                        !compiled.status.success(),
                        "Haxe accepted {family} where {consumer} takes {takes}"
                    );
                    assert!(
                        diagnostics.contains("should be") || diagnostics.contains("cast"),
                        "{family} into {consumer} failed for an unexpected reason:\n{diagnostics}"
                    );
                }
            }
        }
        assert_eq!(accepted, 6);
    }

    // Every wrapper that takes a built-in handle resolves it against its own family before use.
    #[test]
    fn resolves_every_consumed_handle_against_its_own_family() {
        for (wrapper, resolver) in [
            (
                "flight_register_gl_node_renderer",
                "ffi_resolve_gl_node_renderer",
            ),
            (
                "flight_register_wgpu_node_renderer",
                "ffi_resolve_wgpu_node_renderer",
            ),
            (
                "flight_register_wgpu_mesh_material_renderer",
                "ffi_resolve_wgpu_mesh_material_renderer",
            ),
            (
                "flight_register_wgpu_quad_material_renderer",
                "ffi_resolve_wgpu_quad_material_renderer",
            ),
            (
                "flight_register_wgpu_render_preset",
                "ffi_resolve_wgpu_render_preset",
            ),
        ] {
            let body = GENERATED
                .split_once(&format!("pub unsafe extern \"C\" fn {wrapper}("))
                .unwrap()
                .1
                .split_once("\n}\n")
                .unwrap()
                .0;
            assert!(body.contains(&format!("= {resolver}(")), "{wrapper}");
            assert!(!body.contains("unsafe { &*renderer"), "{wrapper}");
            assert!(!body.contains("Box::from_raw"), "{wrapper}");
        }
    }

    // Every built-in registrar and kind lookup checks, before it reads state: a NULL state (the
    // wgpu claim or the GL check), a NULL kind, a kind that is not UTF-8, then the handle. No invalid
    // kind is ever rewritten to the empty kind.
    #[test]
    fn validates_state_kind_and_handle_before_reading_state() {
        for (wrapper, state_check) in [
            (
                "flight_register_gl_node_renderer",
                "    if state.is_null() {\n        return;\n    }\n",
            ),
            (
                "flight_register_wgpu_node_renderer",
                "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state(state, true) else { return; };\n",
            ),
            (
                "flight_register_wgpu_mesh_material_renderer",
                "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state(state, true) else { return; };\n",
            ),
            (
                "flight_register_wgpu_quad_material_renderer",
                "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state(state, true) else { return; };\n",
            ),
            (
                "flight_get_wgpu_mesh_material_renderer",
                "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state(state, true) else { return std::ptr::null(); };\n",
            ),
        ] {
            let body = GENERATED
                .split_once(&format!("pub unsafe extern \"C\" fn {wrapper}("))
                .unwrap()
                .1
                .split_once("\n}\n")
                .unwrap()
                .0;
            let failure = if wrapper.starts_with("flight_get_") {
                "return std::ptr::null();"
            } else {
                "return;"
            };
            let state = body
                .find(state_check)
                .unwrap_or_else(|| panic!("{wrapper} reads a NULL state"));
            let kind = body
                .find(&validate_kind(failure))
                .unwrap_or_else(|| panic!("{wrapper} skips the kind checks"));
            let read = body
                .find("&mut *state")
                .or_else(|| body.find("&*state"))
                .unwrap();
            assert!(state < kind && kind < read, "{wrapper}: {body}");
            if let Some(handle) = body.find("let Some(renderer) = ffi_resolve_") {
                assert!(kind < handle && handle < read, "{wrapper}: {body}");
            }
            assert!(
                !body.contains("unwrap_or(\"\")"),
                "{wrapper} rewrites an invalid kind"
            );
        }
        assert!(HEADER.contains(GL_STATE_CONTRACT));
    }

    // GL presets are SDK functions returning owned render-state options; the GL scan lowers them
    // under their own names. No synthetic GL preset producer exists to collide with that.
    #[test]
    fn leaves_the_gl_preset_functions_to_the_gl_scan() {
        for name in [
            "flight_get_gl_scene2d_render_preset",
            "flight_get_gl_scene3d_render_preset",
            "flight_gl_scene2d_render_preset",
            "flight_gl_scene3d_render_preset",
        ] {
            assert!(!GENERATED.contains(&format!("fn {name}(")), "{name}");
        }
        let crates = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        for (crate_dir, file, function) in [
            (
                "flight-scene2d-gl",
                "scene2d_gl_pipeline.rs",
                "pub fn gl_scene2d_render_preset() -> GlRenderStateOptions",
            ),
            (
                "flight-scene3d-gl",
                "scene3d_gl_pipeline.rs",
                "pub fn gl_scene3d_render_preset() -> GlRenderStateOptions",
            ),
        ] {
            let source =
                std::fs::read_to_string(crates.join(crate_dir).join("src").join(file)).unwrap();
            assert!(source.contains(function), "{function}");
        }
    }
}

mod guard_node_renderer_instantiation {
    use super::*;

    #[test]
    #[should_panic(expected = "changed shape")]
    fn refuses_a_wrapper_whose_renderer_is_no_longer_erased() {
        let _ = guard_node_renderer_instantiation(
            "pub unsafe extern \"C\" fn f(state: *mut S, kind: *const std::ffi::c_char, renderer: *const R) {\n}",
            "WgpuRenderState",
        );
    }
}

// The parameter and return signature codes of a primitive the HashLink shim defines.
fn z_hashlink_primitive(name: &str) -> (Vec<String>, String) {
    let line = SHIM
        .lines()
        .find(|line| line.starts_with("DEFINE_PRIM(") && line.contains(&format!(", {name}, ")))
        .unwrap_or_else(|| panic!("{name} has no HashLink primitive"));
    let inner = line
        .strip_prefix("DEFINE_PRIM(")
        .and_then(|rest| rest.strip_suffix(");"))
        .unwrap();
    let (ret, rest) = inner.split_once(", ").unwrap();
    let (_, params) = rest.split_once(", ").unwrap();
    let params = if params == "_NO_ARG" {
        Vec::new()
    } else {
        params.split(' ').map(str::to_string).collect()
    };
    return (params, ret.to_string());
}

// A Haxe parameter list for HashLink signature codes.
fn z_haxe_parameters(codes: &[String]) -> String {
    return codes
        .iter()
        .enumerate()
        .map(|(index, code)| format!("a{index}:{}", z_haxe_type(code)))
        .collect::<Vec<_>>()
        .join(", ");
}

// The Haxe type a HashLink signature code carries.
fn z_haxe_type(code: &str) -> String {
    if let Some(name) = code
        .strip_prefix("_ABSTRACT(")
        .and_then(|rest| rest.strip_suffix(')'))
    {
        return format!("hl.Abstract<\"{name}\">");
    }
    return match code {
        "_BYTES" => "hl.Bytes".to_string(),
        "_VOID" => "Void".to_string(),
        _ => panic!("no Haxe type for {code}"),
    };
}
