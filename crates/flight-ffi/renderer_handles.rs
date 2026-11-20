// Borrowed handles to the SDK's built-in renderers and render presets. Each one is a `pub static` of
// a GL or wgpu backend crate that C can never construct or free: a producer lends its address as a
// family's own opaque borrowed carrier, a C type distinct from any owned renderer copy, and every
// wrapper that consumes such a handle resolves it against the statics of its own family before use.
// A handle of another backend or family, a stale or forged pointer, or NULL resolves to nothing, so
// it is refused without ever being dereferenced. Owned renderer copies keep their own free, which
// consults the census of every built-in's address, so no built-in of any family is released even
// when C casts one to the owned type.

use std::collections::{BTreeMap, BTreeSet};

/// A family of built-in renderer statics: one backend, one dimension, one renderer type.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum RendererFamily {
    GlMeshMaterial,
    GlNode,
    GlQuadMaterial,
    WgpuMeshMaterial,
    WgpuNode,
    WgpuQuadMaterial,
    WgpuRenderPreset,
}

impl RendererFamily {
    /// Every family, in declaration order.
    pub const ALL: [RendererFamily; 7] = [
        RendererFamily::GlMeshMaterial,
        RendererFamily::GlNode,
        RendererFamily::GlQuadMaterial,
        RendererFamily::WgpuMeshMaterial,
        RendererFamily::WgpuNode,
        RendererFamily::WgpuQuadMaterial,
        RendererFamily::WgpuRenderPreset,
    ];

    /// The opaque Rust carrier a borrowed handle of this family is, never the renderer type itself:
    /// C sees it as its own struct type, so a borrowed handle cannot be passed where an owned renderer
    /// copy or another family is expected.
    pub fn borrowed(self) -> &'static str {
        return match self {
            RendererFamily::GlMeshMaterial => "FfiBuiltinGlMeshMaterialRenderer",
            RendererFamily::GlNode => "FfiBuiltinGlNodeRenderer",
            RendererFamily::GlQuadMaterial => "FfiBuiltinGlQuadMaterialRenderer",
            RendererFamily::WgpuMeshMaterial => "FfiBuiltinWgpuMeshMaterialRenderer",
            RendererFamily::WgpuNode => "FfiBuiltinWgpuNodeRenderer",
            RendererFamily::WgpuQuadMaterial => "FfiBuiltinWgpuQuadMaterialRenderer",
            RendererFamily::WgpuRenderPreset => "FfiBuiltinWgpuRenderPreset",
        };
    }

    /// The C name of the borrowed carrier.
    pub fn borrowed_c(self) -> String {
        return self.borrowed().replacen("Ffi", "Flight", 1);
    }

    /// The Rust type a handle of this family points to.
    pub fn carrier(self) -> &'static str {
        return match self {
            RendererFamily::GlMeshMaterial => "flight_sdk::GlMeshMaterialRenderer",
            RendererFamily::GlNode => "flight_sdk::NodeRenderer<flight_sdk::GlRenderState>",
            RendererFamily::GlQuadMaterial => "flight_sdk::StandardGlQuadMaterialRenderer",
            RendererFamily::WgpuMeshMaterial => "flight_sdk::WgpuMeshMaterialRenderer",
            RendererFamily::WgpuNode => "flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState>",
            RendererFamily::WgpuQuadMaterial => "flight_sdk::WgpuQuadMaterialRenderer",
            RendererFamily::WgpuRenderPreset => "flight_sdk::WgpuScene2DRenderPreset",
        };
    }

    /// Backend, dimension and family, as the header contract states them.
    pub fn identity(self) -> &'static str {
        return match self {
            RendererFamily::GlMeshMaterial => "GL 3D mesh material renderer",
            RendererFamily::GlNode => "GL 2D node renderer",
            RendererFamily::GlQuadMaterial => "GL 2D quad material renderer",
            RendererFamily::WgpuMeshMaterial => "wgpu 3D mesh material renderer",
            RendererFamily::WgpuNode => "wgpu 2D node renderer",
            RendererFamily::WgpuQuadMaterial => "wgpu 2D quad material renderer",
            RendererFamily::WgpuRenderPreset => "wgpu render preset",
        };
    }

    fn resolver(self) -> String {
        return format!("ffi_resolve_{}", self.snake());
    }

    /// The family's snake-case name, as its resolver and built-in check spell it.
    pub fn snake(self) -> &'static str {
        return match self {
            RendererFamily::GlMeshMaterial => "gl_mesh_material_renderer",
            RendererFamily::GlNode => "gl_node_renderer",
            RendererFamily::GlQuadMaterial => "gl_quad_material_renderer",
            RendererFamily::WgpuMeshMaterial => "wgpu_mesh_material_renderer",
            RendererFamily::WgpuNode => "wgpu_node_renderer",
            RendererFamily::WgpuQuadMaterial => "wgpu_quad_material_renderer",
            RendererFamily::WgpuRenderPreset => "wgpu_render_preset",
        };
    }
}

/// How a static holds its value: in place, as a reference to another static (an alias), or behind a
/// lazy initializer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StaticForm {
    Alias,
    Lazy,
    Value,
}

/// One built-in renderer or preset static.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BuiltinRenderer {
    pub name: String,
    pub crate_dir: String,
    pub family: RendererFamily,
    pub form: StaticForm,
}

impl BuiltinRenderer {
    /// The C producer that lends this static.
    pub fn producer(&self) -> String {
        return format!("flight_get_{}", self.name.to_lowercase());
    }

    // The static's path through the SDK's contract lane for its owning crate.
    fn path(&self) -> String {
        let module = self
            .crate_dir
            .trim_start_matches("flight-")
            .replace('-', "_");
        return format!("flight_sdk::{module}::contract::{}", self.name);
    }

    // An expression with the static's address as a `&'static` of its family's carrier.
    fn reference(&self) -> String {
        return match self.form {
            StaticForm::Alias => self.path(),
            StaticForm::Lazy => format!("&*{}", self.path()),
            StaticForm::Value => format!("&{}", self.path()),
        };
    }
}

/// The crates whose built-in renderer statics C can borrow.
pub const OWNING_CRATES: &[&str] = &[
    "flight-scene2d-gl",
    "flight-scene2d-wgpu",
    "flight-scene3d-gl",
    "flight-scene3d-wgpu",
];

/// Classifies one `pub static` by its declared type. `None` for a static that is not a renderer or a
/// preset; a static whose name says renderer or preset but whose type no family covers is an error,
/// so the inventory can never silently miss one.
pub fn classify_static(name: &str, ty: &str) -> Option<(RendererFamily, StaticForm)> {
    let compact: String = ty.chars().filter(|c| !c.is_whitespace()).collect();
    let (form, inner) = if let Some(inner) = compact.strip_prefix('&') {
        (StaticForm::Alias, inner.to_string())
    } else if let Some(inner) = compact
        .strip_prefix("LazyLock<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        (StaticForm::Lazy, inner.to_string())
    } else {
        (StaticForm::Value, compact.clone())
    };
    let family = match inner.as_str() {
        "GlMeshMaterialRenderer" => RendererFamily::GlMeshMaterial,
        "NodeRenderer<GlRenderState>" => RendererFamily::GlNode,
        "StandardGlQuadMaterialRenderer" => RendererFamily::GlQuadMaterial,
        "WgpuMeshMaterialRenderer" => RendererFamily::WgpuMeshMaterial,
        "NodeRenderer<WgpuRenderState>" => RendererFamily::WgpuNode,
        "WgpuQuadMaterialRenderer" => RendererFamily::WgpuQuadMaterial,
        "WgpuScene2DRenderPreset" => RendererFamily::WgpuRenderPreset,
        _ => {
            assert!(
                !name.ends_with("_RENDERER") && !name.ends_with("_RENDER_PRESET"),
                "built-in renderer static {name}: {ty} belongs to no renderer family"
            );
            return None;
        }
    };
    return Some((family, form));
}

/// Every built-in renderer and preset static declared in `sources` (owning crate, file contents),
/// in name order.
pub fn collect_builtin_renderers(sources: &[(String, String)]) -> Vec<BuiltinRenderer> {
    let mut out = Vec::new();
    for (crate_dir, content) in sources {
        let file = syn::parse_file(content).expect("an owning crate source file parses");
        for item in file.items {
            let syn::Item::Static(item) = item else {
                continue;
            };
            if !matches!(item.vis, syn::Visibility::Public(_)) {
                continue;
            }
            let name = item.ident.to_string();
            let ty = quote::ToTokens::to_token_stream(&*item.ty).to_string();
            if let Some((family, form)) = classify_static(&name, &ty) {
                out.push(BuiltinRenderer {
                    name,
                    crate_dir: crate_dir.clone(),
                    family,
                    form,
                });
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    return out;
}

/// The producers, the resolvers of the families wrappers consume, and the borrowed-handle registrar
/// of the wgpu presets, with every producer's name for the reachability surface.
pub struct RendererHandleOutput {
    pub output: String,
    pub surface: Vec<String>,
    pub report: Vec<String>,
}

pub fn generate_renderer_handles(builtins: &[BuiltinRenderer]) -> RendererHandleOutput {
    let mut output = String::new();
    let mut surface = Vec::new();
    let mut report = Vec::new();
    let mut by_family: BTreeMap<RendererFamily, Vec<&BuiltinRenderer>> = BTreeMap::new();
    let mut producers = BTreeSet::new();
    for builtin in builtins {
        by_family.entry(builtin.family).or_default().push(builtin);
        let producer = builtin.producer();
        assert!(
            producers.insert(producer.clone()),
            "{producer} is produced twice"
        );
        output.push_str(&format!(
            "#[doc = \"flight-ffi contract|Borrows the built-in {identity} {name}, a static that lives as long as the process. C never constructs, copies or frees it; it is accepted only where a {identity} is, and anywhere else is refused without being read.\"]\n#[doc = \"flight-ffi ownership|borrowed|the process remains alive\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {producer}() -> *const {borrowed} {{\n    let builtin: &'static {carrier} = {reference};\n    return std::ptr::from_ref(builtin).cast();\n}}\n",
            identity = builtin.family.identity(),
            name = builtin.name,
            borrowed = builtin.family.borrowed(),
            carrier = builtin.family.carrier(),
            reference = builtin.reference(),
        ));
        surface.push(producer.clone());
        report.push(format!(
            "{producer} -> {} ({}, {})",
            builtin.name,
            builtin.crate_dir,
            builtin.family.identity()
        ));
    }
    for family in RendererFamily::ALL {
        let members = by_family
            .get(&family)
            .unwrap_or_else(|| panic!("no built-in {} to lend", family.identity()));
        let candidates: Vec<String> = members.iter().map(|builtin| builtin.reference()).collect();
        output.push_str(&format!(
            "// The borrowed carrier of a {identity}: an opaque type C can hold but never read, build or\n// free, distinct from the owned renderer type.\npub struct {borrowed} {{\n    _borrowed_only: [u8; 0],\n}}\n// Resolves a {identity} handle to the built-in static it names, comparing its address with\n// each of the family's statics and never reading through it; anything else is None.\n#[allow(dead_code)]\nfn {resolver}(handle: *const {borrowed}) -> Option<&'static {carrier}> {{\n    let candidates: [&'static {carrier}; {count}] = [\n        {list},\n    ];\n    return candidates.into_iter().find(|candidate| std::ptr::from_ref(*candidate).addr() == handle.addr());\n}}\n",
            identity = family.identity(),
            borrowed = family.borrowed(),
            resolver = family.resolver(),
            carrier = family.carrier(),
            count = candidates.len(),
            list = candidates.join(",\n        "),
        ));
    }
    output.push_str(&generate_builtin_renderer_census(builtins));
    output.push_str(&generate_producer_inventory(builtins));
    report.push(format!(
        "built-in renderer census: {} addresses over {} families, consulted by every owned renderer free",
        builtins.len(),
        by_family.len()
    ));
    output.push_str(PRESET_REGISTRAR);
    surface.push("flight_register_wgpu_render_preset".to_string());
    report.push(
        "flight_register_wgpu_render_preset -> scene2d_wgpu::register_wgpu_render_preset (borrowed preset handle)"
            .to_string(),
    );
    return RendererHandleOutput {
        output,
        surface,
        report,
    };
}

/// The census of every built-in renderer and preset address, of every backend and family, built from
/// the same inventory as the producers so a new built-in can never be lent without being counted.
/// Every owned renderer free consults it before recovering ownership, so no producer's result, cast
/// to any owned type, is ever released.
pub fn generate_builtin_renderer_census(builtins: &[BuiltinRenderer]) -> String {
    let addresses: Vec<String> = builtins
        .iter()
        .map(|builtin| {
            format!(
                "std::ptr::from_ref::<{}>({}).addr()",
                builtin.family.carrier(),
                builtin.reference()
            )
        })
        .collect();
    return format!(
        "// The address of every built-in renderer and preset C can borrow, of every backend and family.\nfn {CENSUS_ADDRESSES}() -> [usize; {count}] {{\n    return [\n        {list},\n    ];\n}}\n// Whether `address` is any built-in renderer's or preset's, which no owned free may release,\n// whatever owned type C cast it to.\nfn {CENSUS_CHECK}(address: usize) -> bool {{\n    return {CENSUS_ADDRESSES}().contains(&address);\n}}\n",
        count = addresses.len(),
        list = addresses.join(",\n        "),
    );
}

/// Every producer with its family's name and the address it lends, called through the producer itself
/// rather than read from the census, so the crate's tests can check the census against what C is
/// actually lent.
pub fn generate_producer_inventory(builtins: &[BuiltinRenderer]) -> String {
    let entries: Vec<String> = builtins
        .iter()
        .map(|builtin| {
            format!(
                "(\"{producer}\", \"{family}\", unsafe {{ {producer}() }}.addr())",
                producer = builtin.producer(),
                family = builtin.family.snake()
            )
        })
        .collect();
    return format!(
        "// Every producer, its family and the address it lends, for the crate's own tests.\n#[cfg(test)]\npub(crate) fn ffi_builtin_renderer_producers() -> [(&'static str, &'static str, usize); {count}] {{\n    return [\n        {list},\n    ];\n}}\n",
        count = entries.len(),
        list = entries.join(",\n        "),
    );
}

// The preset counterpart of the declared node-renderer registrar: the SDK's own
// `register_wgpu_render_preset`, taking a borrowed preset handle that must resolve to one of the
// built-in wgpu presets.
const PRESET_REGISTRAR: &str = "#[doc = \"flight-ffi contract|Registers a built-in wgpu render preset's node renderers and registry tables on state, overlaying the tables the state already holds. A preset handle that is NULL, of another family or backend, stale or forged is refused without being read, and state is left unchanged.\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn flight_register_wgpu_render_preset(state: *mut flight_sdk::WgpuRenderState, preset: *const FfiBuiltinWgpuRenderPreset) {\n    if state.is_null() {\n        return;\n    }\n    let Some(preset) = ffi_resolve_wgpu_render_preset(preset) else {\n        return;\n    };\n    flight_sdk::scene2d_wgpu::contract::register_wgpu_render_preset(unsafe { &mut *state }, preset);\n}\n";

/// The header contract of the declared node-renderer registrars.
pub const NODE_REGISTRAR_CONTRACT: &str = "Binds a built-in node renderer to kind on state, so nodes of that kind, a standard one or the caller's own, draw with it; registering the renderer a kind already holds changes nothing. A renderer handle that is NULL, of another backend or family, stale or forged, a NULL kind, or a kind that is not valid UTF-8, is refused without being read, and state is left unchanged. The empty kind is a valid kind of its own.";

/// The header contract of the GL node-renderer registrar's state: GL render states are owned raw
/// pointers until a GL host supplies opaque state handles.
pub const GL_STATE_CONTRACT: &str = "A NULL state is refused before anything is read. Any other state must be a live GlRenderState the caller owns; GL states are owned pointers, not registry handles, so a forged or freed state pointer cannot be detected.";

/// The kind checks every built-in registrar and lookup runs before reading state: a NULL kind and a
/// kind that is not valid UTF-8 return `failure`, so no invalid bytes are ever rewritten to the
/// empty kind. Binds `kind` to the validated `&str`.
pub fn validate_kind(failure: &str) -> String {
    return format!(
        "    if kind.is_null() {{\n        {failure}\n    }}\n    let Ok(kind) = unsafe {{ std::ffi::CStr::from_ptr(kind) }}.to_str() else {{\n        {failure}\n    }};\n"
    );
}

// The generic lowering refuses a NULL or non-UTF-8 kind in its own first line and binds the text
// as `ffi_text_kind`. Every built-in registrar and lookup removes that line, so `validate_kind`
// runs in the order its contract states, and reads the kind it bound instead.
fn take_generated_kind(wrapper: &str, name: &str) -> String {
    let opening = "    let Some(ffi_text_kind) = (unsafe { ffi_c_str(kind) }) else { ";
    assert_eq!(wrapper.matches(opening).count(), 1, "{name}: its kind check changed shape");
    let start = wrapper.find(opening).unwrap();
    let end = start + wrapper[start..].find(" };\n").unwrap() + " };\n".len();
    let stripped = format!("{}{}", &wrapper[..start], &wrapper[end..]);
    assert!(stripped.contains("ffi_text_kind"), "{name}: its kind is no longer read");
    return stripped.replace("ffi_text_kind", "kind");
}

/// Rewrites a declared `register_node_renderer` instantiation for `state_type` so its renderer is a
/// typed borrowed handle resolved against the backend's built-in node renderers, and a NULL kind is
/// refused before it is read.
pub fn guard_node_renderer_instantiation(wrapper: &str, state_type: &str) -> String {
    let family = match state_type {
        "GlRenderState" => RendererFamily::GlNode,
        "WgpuRenderState" => RendererFamily::WgpuNode,
        _ => panic!("register_node_renderer has no built-in handle family for {state_type}"),
    };
    let carrier = family.carrier();
    let erased = "renderer: *const std::ffi::c_void)";
    let typed = format!("renderer: *const {})", family.borrowed());
    let borrow = format!("unsafe {{ &*(renderer as *const {carrier}) }}");
    let entry = ") {\n";
    let wrapper = &take_generated_kind(wrapper, state_type);
    let kind_text = "kind.to_string()";
    for (needle, what) in [
        (erased, "the erased renderer parameter"),
        (borrow.as_str(), "the unchecked renderer borrow"),
        (entry, "the wrapper body"),
        (kind_text, "the kind conversion"),
    ] {
        assert_eq!(
            wrapper.matches(needle).count(),
            1,
            "register_node_renderer for {state_type}: {what} changed shape"
        );
    }
    // A wgpu state is claimed, NULL included, by the render-pass bracket's state guard ahead of
    // this body; a GL state has no such guard, so its NULL check comes first here.
    let state_check = if family == RendererFamily::GlNode {
        "    if state.is_null() {\n        return;\n    }\n"
    } else {
        ""
    };
    let guard = format!(
        ") {{\n{state_check}{}    let Some(renderer) = {}(renderer) else {{\n        return;\n    }};\n",
        validate_kind("return;"),
        family.resolver()
    );
    let mut contract = format!("#[doc = \"flight-ffi contract|{NODE_REGISTRAR_CONTRACT}\"]\n");
    if family == RendererFamily::GlNode {
        contract.push_str(&format!(
            "#[doc = \"flight-ffi contract|{GL_STATE_CONTRACT}\"]\n"
        ));
    }
    return contract
        + &wrapper
            .replace(erased, &typed)
            .replace(&borrow, "renderer")
            .replacen(entry, &guard, 1);
}

/// Rewrites the generated wgpu material registrars so their renderer is a borrowed built-in handle
/// resolved against its own family, and a NULL kind is refused before it is read. The quad material
/// registrar took an owned, freeable copy; a built-in is borrowed, so it now takes the handle and
/// registers a copy of the static. Returns the rewritten source and the guarded wrapper names.
pub fn guard_builtin_material_registrars(generated: &str) -> (String, Vec<String>) {
    let mut out = generated.to_string();
    let mut names = Vec::new();
    for (name, family, before_param, after_param, before_arg, after_arg) in [
        (
            "flight_register_wgpu_mesh_material_renderer",
            RendererFamily::WgpuMeshMaterial,
            "renderer: *const flight_sdk::WgpuMeshMaterialRenderer)",
            "renderer: *const FfiBuiltinWgpuMeshMaterialRenderer)",
            "unsafe { &*renderer })",
            "renderer)",
        ),
        (
            "flight_register_wgpu_quad_material_renderer",
            RendererFamily::WgpuQuadMaterial,
            "renderer: *mut flight_sdk::WgpuQuadMaterialRenderer)",
            "renderer: *const FfiBuiltinWgpuQuadMaterialRenderer)",
            "*unsafe { Box::from_raw(renderer) })",
            "renderer.clone())",
        ),
    ] {
        let signature = format!("pub unsafe extern \"C\" fn {name}(");
        let start = out
            .find(&signature)
            .unwrap_or_else(|| panic!("{name} is no longer generated"));
        let end = start
            + out[start..]
                .find("\n}\n")
                .unwrap_or_else(|| panic!("{name} has no body end"));
        let mut wrapper = take_generated_kind(&out[start..end], name);
        let kind_text = "kind.to_string()";
        for (needle, what) in [
            (before_param, "renderer parameter"),
            (before_arg, "renderer argument"),
            (") {\n", "body"),
            (kind_text, "kind conversion"),
        ] {
            assert_eq!(
                wrapper.matches(needle).count(),
                1,
                "{name}: its {what} changed shape"
            );
        }
        wrapper = wrapper
            .replace(before_param, after_param)
            .replace(before_arg, after_arg)
            .replace(
                "    assert!(!renderer.is_null(), \"renderer must be an owned WgpuQuadMaterialRenderer handle\");\n",
                "",
            )
            .replacen(
                ") {\n",
                &format!(
                    ") {{\n{}    let Some(renderer) = {}(renderer) else {{\n        return;\n    }};\n",
                    validate_kind("return;"),
                    family.resolver()
                ),
                1,
            );
        let doc = format!(
            "#[doc = \"flight-ffi contract|Binds a built-in {identity} to kind on state. A renderer handle that is NULL, of another backend or family, stale or forged, a NULL kind, or a kind that is not valid UTF-8, is refused without being read, and state is left unchanged. The empty kind is a valid kind of its own.\"]\n",
            identity = family.identity()
        );
        // The attributes above the wrapper may describe the owned renderer it took before; a
        // borrowed handle is neither consumed nor freed, so that note no longer holds.
        let attributes_start = out[..start]
            .rfind("\n}\n")
            .map_or(0, |position| position + 3);
        let attributes = out[attributes_start..start].replace(
            "#[doc = \"ffi-param renderer: ownership transferred; do not use or free after call\"]\n",
            "",
        );
        out = format!(
            "{}{attributes}{doc}{wrapper}{}",
            &out[..attributes_start],
            &out[end..]
        );
        names.push(name.to_string());
    }
    return (out, names);
}

/// The header contract of a kind lookup over built-in material renderers.
pub const MATERIAL_LOOKUP_CONTRACT: &str = "Returns the material renderer bound to kind on state, borrowed from state, or NULL when none is. A NULL kind or a kind that is not valid UTF-8 returns NULL without reading state; it never looks up the empty kind in its place.";

/// Rewrites the generated wgpu mesh material lookup so a NULL or invalid UTF-8 kind returns NULL
/// instead of being read or rewritten to the empty kind, and every borrowed wgpu mesh material
/// return, the lookup and the per-material resolvers, so it lends the family's borrowed carrier
/// rather than an erased pointer an owned free would take. Returns the rewritten source and the
/// guarded wrapper names.
pub fn guard_builtin_material_lookups(generated: &str) -> (String, Vec<String>) {
    let mut out = generated.to_string();
    let mut names = Vec::new();
    for name in ["flight_get_wgpu_mesh_material_renderer"] {
        let signature = format!("pub unsafe extern \"C\" fn {name}(");
        let start = out
            .find(&signature)
            .unwrap_or_else(|| panic!("{name} is no longer generated"));
        let end = start
            + out[start..]
                .find("\n}\n")
                .unwrap_or_else(|| panic!("{name} has no body end"));
        let wrapper = take_generated_kind(&out[start..end], name);
        for (needle, what) in [
            (
                ") -> *const flight_sdk::WgpuMeshMaterialRenderer {\n",
                "body",
            ),
        ] {
            assert_eq!(
                wrapper.matches(needle).count(),
                1,
                "{name}: its {what} changed shape"
            );
        }
        let wrapper = wrapper.replacen(
            ") -> *const flight_sdk::WgpuMeshMaterialRenderer {\n",
            &format!(
                ") -> *const flight_sdk::WgpuMeshMaterialRenderer {{\n{}",
                validate_kind("return std::ptr::null();")
            ),
            1,
        );
        let doc = format!("#[doc = \"flight-ffi contract|{MATERIAL_LOOKUP_CONTRACT}\"]\n");
        out = format!("{}{doc}{wrapper}{}", &out[..start], &out[end..]);
        names.push(name.to_string());
    }
    let family = RendererFamily::WgpuMeshMaterial;
    let erased = format!(") -> *const {} {{\n", family.carrier());
    let typed = format!(") -> *const {} {{\n", family.borrowed());
    let mut retyped = 0;
    while let Some(at) = out.find(&erased) {
        let line_start = out[..at].rfind('\n').map_or(0, |position| position + 1);
        let end = at
            + out[at..].find("\n}\n").unwrap_or_else(|| {
                panic!("a borrowed {} return has no body end", family.identity())
            });
        let body = &out[at + erased.len()..end];
        let lend = "        Some(v) => v as *const _,\n";
        assert_eq!(
            body.matches(lend).count(),
            1,
            "a borrowed {} return changed shape:\n{}",
            family.identity(),
            &out[line_start..end]
        );
        let body = body.replace(lend, "        Some(v) => std::ptr::from_ref(v).cast(),\n");
        out = format!("{}{typed}{body}{}", &out[..at], &out[end..]);
        retyped += 1;
    }
    assert!(
        retyped > 1,
        "no borrowed {} return to type",
        family.identity()
    );
    return (out, names);
}

/// The header contract an owned renderer free carries.
pub const OWNED_FREE_CONTRACT: &str = "Releases an owned renderer copy. NULL is a no-op, and so is the address of any built-in renderer or preset, of any backend or family, even cast from its borrowed handle: built-ins are never freed.";

/// Guards every generated free of an owned renderer copy whose type is also a built-in family's
/// renderer: the address of any built-in renderer or preset, of any backend or family, returns before
/// `Box::from_raw`, so no borrowed handle cast to the owned type is ever freed. Returns the
/// rewritten source and the guarded free names.
pub fn guard_owned_renderer_frees(generated: &str) -> (String, Vec<String>) {
    let mut out = generated.to_string();
    let mut names = Vec::new();
    for family in RendererFamily::ALL {
        let parameter = format!("(ptr: *mut {}) {{\n", family.carrier());
        let Some(at) = out.find(&parameter) else {
            continue;
        };
        let line_start = out[..at].rfind('\n').map_or(0, |position| position + 1);
        let name = out[line_start..at]
            .strip_prefix("pub unsafe extern \"C\" fn ")
            .unwrap_or_else(|| {
                panic!(
                    "an owned {} free has an unexpected shape",
                    family.identity()
                )
            })
            .to_string();
        assert!(
            out[at + parameter.len()..].starts_with(
                "    if !ptr.is_null() {\n        unsafe { drop(Box::from_raw(ptr)); }\n"
            ),
            "{name}: its body changed shape"
        );
        assert_eq!(
            out.matches(&parameter).count(),
            1,
            "{name} is generated twice"
        );
        let attribute = "#[unsafe(no_mangle)]\n";
        assert!(
            out[..line_start].ends_with(attribute),
            "{name}: its attributes changed shape"
        );
        let guard = format!("    if {CENSUS_CHECK}(ptr.addr()) {{\n        return;\n    }}\n");
        out.insert_str(at + parameter.len(), &guard);
        out.insert_str(
            line_start - attribute.len(),
            &format!("#[doc = \"flight-ffi contract|{OWNED_FREE_CONTRACT}\"]\n"),
        );
        names.push(name);
    }
    return (out, names);
}

// The generated census of built-in addresses and the check every owned renderer free runs.
const CENSUS_ADDRESSES: &str = "ffi_builtin_renderer_addresses";
const CENSUS_CHECK: &str = "ffi_is_builtin_renderer";
