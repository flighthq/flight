use std::collections::{BTreeMap, BTreeSet, HashSet};

use quote::ToTokens;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{BinOp, Expr, FnArg, GenericArgument, ItemFn, ItemStruct, Lit, Pat, PathArguments, ReturnType, Stmt, Token, Type, UnOp};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{
    canonical_type_path_root, current_source, entity_runtime_state_store,
    insert_program_type_path_context, lexical_fact, marker_suffixes, named_type,
    option_inner_type, peel_reference_and_paren, resolve_path_owner, rust_default_expression,
    rust_type_description, snake_to_lower_camel, BindingFact, ARRAY_LIKE_ARGUMENT_MARKER,
    FUNCTION_OWNER_MARKER, PROVENANCE_SEPARATOR, TYPE_EXTERN_CRATE_MARKER, TYPE_LOCAL_MARKER,
    TYPE_NO_STD_MARKER, TYPE_USE_GLOB_MARKER, TYPE_USE_MARKER, TYPE_USE_TARGET_MARKER,
};

// A source path with `.` and `..` segments resolved and `/` separators, so paths given in different
// spellings compare equal.
fn normalize_source_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split(['/', '\\']) {
        match segment {
            "" | "." if !segments.is_empty() => {}
            ".." if segments
                .last()
                .is_some_and(|last| !last.is_empty() && *last != "..") =>
            {
                segments.pop();
            }
            segment => segments.push(segment),
        }
    }
    return segments.join("/");
}
// Whether `op` is binary arithmetic (`+ - * / %`), which Rust dispatches through `Add` and its kin.
fn is_eager_arithmetic(op: &BinOp) -> bool {
    return matches!(
        op,
        BinOp::Add(_) | BinOp::Div(_) | BinOp::Mul(_) | BinOp::Rem(_) | BinOp::Sub(_)
    );
}

// Whether `op` is a comparison, which Rust dispatches through `PartialEq` / `PartialOrd`.
fn is_eager_comparison(op: &BinOp) -> bool {
    return matches!(
        op,
        BinOp::Eq(_) | BinOp::Ge(_) | BinOp::Gt(_) | BinOp::Le(_) | BinOp::Lt(_) | BinOp::Ne(_)
    );
}

// Whether a resolved call owner is a construction intrinsic the compiler lowers to a plain
// TypeScript value: a standard `Vec`/`String`/`Box`/`Arc`/`RwLock` constructor or `Some`, or
// `flight_entity`'s `Ref::new` (an `Arc<RwLock<T>>`) and `allocate_entity`.
fn is_eager_construction_intrinsic(owner: &[String]) -> bool {
    let owner = owner.iter().map(String::as_str).collect::<Vec<_>>();
    return matches!(
        owner.as_slice(),
        ["std" | "alloc", "vec", "Vec", "new"]
            | ["std" | "alloc", "string", "String", "new"]
            | ["std" | "alloc", "boxed", "Box", "new"]
            | ["std" | "alloc", "sync", "Arc", "new"]
            | ["std", "sync", "RwLock", "new"]
            | ["std" | "core", "option", "Option", "Some"]
            | ["flight_entity", "Ref", "new"]
            | ["flight_entity", "ir", "Ref", "new"]
            | ["flight_entity", "allocate_entity"]
            | ["flight_entity", "entity", "allocate_entity"]
    );
}


// Rejects a Rust identifier in `program` that lowers to the name of a visible entity runtime state
// store, so a store reference in emitted code is always the store itself.
// flight-lint: allow(hashmap-iteration) every collection visited here is a source-ordered Vec
pub(super) fn reject_entity_runtime_state_store_collisions(
    program: &Program,
    programs: &[&Program],
) -> Result<(), CompileError> {
    struct IdentifierVisitor<'a> {
        collision: Option<String>,
        stores: &'a BTreeSet<String>,
    }
    impl<'ast> Visit<'ast> for IdentifierVisitor<'_> {
        fn visit_ident(&mut self, identifier: &'ast syn::Ident) {
            let lowered = snake_to_lower_camel(&identifier.to_string());
            if self.collision.is_none() && self.stores.contains(&lowered) {
                self.collision = Some(lowered);
            }
        }
    }
    let stores = programs
        .iter()
        .flat_map(|program| &program.entity_runtime_states)
        .map(|(owner, field)| entity_runtime_state_store(owner, field))
        .collect::<BTreeSet<_>>();
    if stores.is_empty() {
        return Ok(());
    }
    let mut visitor = IdentifierVisitor {
        collision: None,
        stores: &stores,
    };
    for function in &program.functions {
        visitor.visit_item_fn(function);
    }
    for constant in &program.constants {
        visitor.visit_item_const(constant);
    }
    for rust_static in &program.statics {
        visitor.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        visitor.visit_item_struct(structure);
    }
    return match visitor.collision {
        Some(name) => Err(compile_error(format!(
            "Rust identifier lowering to `{name}` collides with a generated entity runtime state store"
        ))),
        None => Ok(()),
    };
}

// A value block or a `match` used as a value lowers to an immediately invoked arrow, where `return`
// and `?` would leave only the arrow, not the enclosing function as in Rust, and the caller would carry
// on with `undefined`. Such exits fail closed; closures inside keep their own `return`.
pub(super) fn reject_function_exits_in_value_position<'ast>(
    visit: impl FnOnce(&mut dyn Visit<'ast>),
    construct: &str,
) -> Result<(), CompileError> {
    struct FunctionExitFinder {
        found: Option<&'static str>,
    }
    impl<'ast> Visit<'ast> for FunctionExitFinder {
        fn visit_expr_closure(&mut self, _closure: &'ast syn::ExprClosure) {}

        fn visit_expr_return(&mut self, expression: &'ast syn::ExprReturn) {
            self.found.get_or_insert("return");
            syn::visit::visit_expr_return(self, expression);
        }

        fn visit_expr_try(&mut self, expression: &'ast syn::ExprTry) {
            self.found.get_or_insert("?");
            syn::visit::visit_expr_try(self, expression);
        }

        fn visit_item(&mut self, _item: &'ast syn::Item) {}
    }
    let mut finder = FunctionExitFinder { found: None };
    visit(&mut finder);
    return match finder.found {
        Some(exit) => Err(compile_error(format!(
            "{construct} cannot use `{exit}` to leave the enclosing function; bind the value first and exit with a statement"
        ))),
        None => Ok(()),
    };
}

pub(super) fn reject_unresolved_pattern_field(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    // Production modules retain their source-wide Option directive when an external return owner is
    // intentionally unavailable. Vitest has no current source and must never guess a selected
    // contract owner's field semantics.
    if current_source(entities).is_some() {
        return Ok(());
    }
    let expression = peel_reference_and_paren(expression);
    let Expr::Path(path) = expression else {
        return Ok(());
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return Ok(());
    }
    let local = path.path.segments[0].ident.to_string();
    if lexical_fact(entities, &local) == Some(BindingFact::UnresolvedPattern) {
        return Err(compile_error(format!(
            "portable pattern binding `{local}` has no source-qualified type provenance; add a typed iterable or matched payload before accessing its fields"
        )));
    }
    return Ok(());
}

// A `LazyLock` static lowers to an eagerly initialized constant, so its initializer must be provably
// unobservable to run at module load instead of at first access. Through the same-crate functions it
// calls, it may only build values, read and assign fields, and read statics this module declares
// before it that are `LazyLock`s or immutable primitives. Each call path is resolved, through the
// calling module's imports (named, renamed, grouped, glob), local items and modules, `extern crate`
// bindings and absolute roots, to its owner: it must be a free function of this crate, which is walked
// in turn, or one of the construction intrinsics the compiler lowers (`Vec`/`String`/`Box`/`Arc`/
// `RwLock::new` and `Some` of the standard library, and `flight_entity`'s `Ref::new` and
// `allocate_entity`); an owner that cannot be decided fails closed. Rust operators dispatch through
// traits, so an operator is accepted only where the operand types are proven, from literals and from
// declared parameter, binding, field, static and return types, to select the built-in primitive
// operation whose result TypeScript shares: arithmetic and negation on `f64` (IEEE, never panics),
// comparisons between two values of one exactly representable scalar type (`bool`, `f64`, or an
// integer of at most 32 bits), `!` on `bool`, and `*` on a reference or a standard `LazyLock`, `Box`
// or `Arc`. Method calls (whose receiver type is not proven here, so a name says nothing about the
// operation), macros, casts, bitwise operators, reads of other statics, indexing, `?` and `unsafe`
// all fail closed. The initializer must also name an emitted free function: an associated path such
// as `Kernel::default` has no TypeScript value.
//
// Rust also runs trait code no call site spells: `Default` (behind `allocate_entity`, which is
// `T::default()`), `Drop` at scope exit, and `Deref` in auto-dereference and coercion. So the proof
// reads the whole crate (the emitted sources and `visibility_programs`, the crate's other sources),
// and fails closed when it cannot see every such implementation: any `Drop`, `Deref` or `DerefMut`
// impl, an `impl` whose trait does not resolve, a derive other than the standard ones, an attribute
// other than the built-in and tool ones, a macro other than the standard library's and
// `flight_entity::impl_entity`, or an `impl` or attribute hidden in macro arguments.
// `allocate_entity::<T>` needs a declared `T` (a turbofish or an annotated `let`) and proves
// `T::default()`: a standard `derive(Default)` defaults each field by its type, which must resolve to
// the standard type the generated allocation defaults by spelling (`0`, `false`, `""`, `undefined`,
// `[]`); a manual `impl Default` must return one struct literal, each such field set to exactly that
// default value, and its other values are walked like the factory. Every other field type's own
// `Default` is proven the same way, for purity.
// flight-lint: allow(hashmap-iteration) it iterates `names`, a BTreeSet, and `constants`, a Vec, both in a defined order
// flight-lint: allow(f64) it parses a float literal only to compare its value with zero
pub(super) fn reject_unsafe_lazy_lock_initializers(
    program: &Program,
    programs: &[&Program],
    visibility_programs: &[Program],
    identities: &[Option<String>],
    paths: &[Option<String>],
) -> Result<(), CompileError> {
    #[derive(Clone, Debug, PartialEq)]
    enum EagerType {
        Bool,
        F32,
        F64,
        // An unsuffixed float literal, whose width the surrounding operation decides.
        FloatLiteral,
        Integer(String),
        // An unsuffixed integer literal, `i32` unless the surrounding operation decides.
        IntegerLiteral,
        // `&T`, `&mut T`, or a standard `LazyLock<T>` / `Box<T>` / `Arc<T>`: dereferences to `T`.
        Pointer(Box<EagerType>),
        // A struct this crate declares, by the index of its source in `programs` and its name.
        Struct(usize, String),
    }
    // Whether a comparison's proven operand types select a built-in primitive comparison whose result
    // TypeScript shares: `bool` equality, `f64` (an unsuffixed literal takes the other operand's type), or
    // an integer type of at most 32 bits, which a TypeScript number represents exactly. Two unsuffixed
    // literals take Rust's defaults (`f64`, `i32`).
    fn is_eager_comparable(op: &BinOp, left: &EagerType, right: &EagerType) -> bool {
        let exact_integer = |name: &str| {
            return matches!(name, "i8" | "i16" | "i32" | "u8" | "u16" | "u32");
        };
        return match (left, right) {
            (EagerType::Bool, EagerType::Bool) => matches!(op, BinOp::Eq(_) | BinOp::Ne(_)),
            (
                EagerType::F64 | EagerType::FloatLiteral,
                EagerType::F64 | EagerType::FloatLiteral,
            )
            | (EagerType::IntegerLiteral, EagerType::IntegerLiteral) => true,
            (EagerType::Integer(left), EagerType::Integer(right)) => {
                left == right && exact_integer(left)
            }
            (EagerType::Integer(name), EagerType::IntegerLiteral)
            | (EagerType::IntegerLiteral, EagerType::Integer(name)) => exact_integer(name),
            _ => false,
        };
    }
    // A path as written, for messages.
    fn path_text(path: &syn::Path) -> String {
        return path
            .segments
            .iter()
            .map(|segment| segment.ident.to_string())
            .collect::<Vec<_>>()
            .join("::");
    }
    // The scalar type a primitive type name denotes.
    fn primitive_eager_type(name: &str) -> Option<EagerType> {
        return match name {
            "bool" => Some(EagerType::Bool),
            "f32" => Some(EagerType::F32),
            "f64" => Some(EagerType::F64),
            "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16" | "u32" | "u64"
            | "u128" | "usize" => Some(EagerType::Integer(name.to_string())),
            _ => None,
        };
    }
    enum BindingSite<'a> {
        Annotated(&'a Type),
        Initialized(&'a Expr),
        Unknown,
    }
    // How Rust reached a source file. The crate root and every file selected by `#[path]` own their
    // containing directory, while an ordinary `name.rs` module owns a `name/` directory (including
    // ordinary nested files named `lib.rs` or `main.rs`). A source can have multiple reaches under
    // different `cfg_attr` configurations.
    #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
    enum ModuleReach {
        CrateRoot,
        Ordinary,
        PathLoaded,
    }
    // Every alternative group Rust may load for an external module. The paths within one group are
    // the `name.rs` / `name/mod.rs` alternatives; separate groups (including every `cfg_attr` path)
    // must each be represented in the proof inventory.
    fn external_module_candidates(
        source: &str,
        reach: ModuleReach,
        module: &crate::model::ExternalModule,
    ) -> Option<BTreeSet<(ModuleReach, Vec<String>)>> {
        let file = std::path::Path::new(source);
        let directory = file.parent().unwrap_or_else(|| std::path::Path::new(""));
        let stem = file
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default();
        let ordinary = match reach {
            ModuleReach::CrateRoot | ModuleReach::PathLoaded => directory.to_path_buf(),
            ModuleReach::Ordinary if stem == "mod" => directory.to_path_buf(),
            ModuleReach::Ordinary => directory.join(stem),
        };
        // A top-level `#[path]` is relative to the source file's directory even when the source is
        // an ordinary non-mod-rs file. Once inside an inline module, both kinds of child path start
        // from the inline module's selected directory.
        let mut bases = BTreeSet::from([(ordinary, directory.to_path_buf())]);
        for parent in &module.inline_parents {
            let mut next = BTreeSet::new();
            for (ordinary, explicit) in &bases {
                if parent.path.is_none() {
                    let base = ordinary.join(&parent.component);
                    next.insert((base.clone(), base));
                }
                for path in parent.path.iter().chain(&parent.conditional_paths) {
                    if path.is_empty() {
                        return None;
                    }
                    let base = explicit.join(path);
                    next.insert((base.clone(), base));
                }
            }
            bases = next;
        }
        let mut candidates = BTreeSet::new();
        for (ordinary, explicit) in bases {
            if module.path.is_none() {
                candidates.insert((
                    ModuleReach::Ordinary,
                    vec![
                        normalize_source_path(
                            &ordinary
                                .join(format!("{}.rs", module.component))
                                .to_string_lossy(),
                        ),
                        normalize_source_path(
                            &ordinary
                                .join(&module.component)
                                .join("mod.rs")
                                .to_string_lossy(),
                        ),
                    ],
                ));
            }
            for path in module.path.iter().chain(&module.conditional_paths) {
                if path.is_empty() {
                    return None;
                }
                candidates.insert((
                    ModuleReach::PathLoaded,
                    vec![normalize_source_path(
                        &explicit.join(path).to_string_lossy(),
                    )],
                ));
            }
        }
        return Some(candidates);
    }
    // Every name a function or closure body binds, and how each binding is typed: an annotated or
    // initialized `let` of a plain identifier, or anything else (patterns, closure parameters, loop
    // and match bindings), whose type is left unproven.
    struct BindingSites<'a> {
        sites: Vec<(String, BindingSite<'a>)>,
    }
    impl<'ast> Visit<'ast> for BindingSites<'ast> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            let plain = |pattern: &'ast Pat| match pattern {
                Pat::Ident(ident) if ident.by_ref.is_none() && ident.subpat.is_none() => {
                    Some(ident.ident.to_string())
                }
                _ => None,
            };
            let site = match &local.pat {
                Pat::Type(typed) => {
                    plain(&typed.pat).map(|name| (name, BindingSite::Annotated(typed.ty.as_ref())))
                }
                pattern => plain(pattern).map(|name| {
                    let site = local.init.as_ref().map_or(BindingSite::Unknown, |init| {
                        return BindingSite::Initialized(init.expr.as_ref());
                    });
                    return (name, site);
                }),
            };
            match site {
                Some(site) => self.sites.push(site),
                None => self.visit_pat(&local.pat),
            }
            if let Some(init) = &local.init {
                self.visit_expr(&init.expr);
                if let Some((_, diverge)) = &init.diverge {
                    self.visit_expr(diverge);
                }
            }
        }

        fn visit_pat_ident(&mut self, ident: &'ast syn::PatIdent) {
            self.sites
                .push((ident.ident.to_string(), BindingSite::Unknown));
            syn::visit::visit_pat_ident(self, ident);
        }
    }
    // A source's resolution context: its type-namespace provenance and the value items it declares.
    // `module` is the source's module path below the crate root (from its module identity, or a
    // synthetic segment no path can name when the identity is unknown), so a callable resolves to
    // `crate::<module>::<name>` and only the source declaring exactly that owner supplies its body.
    struct EagerScope<'a> {
        context: HashSet<String>,
        module: Vec<String>,
        // Every way this source can be reached under the crate's module declarations.
        reaches: BTreeSet<ModuleReach>,
        // The source's file path, normalized, when known.
        path: Option<String>,
        program: &'a Program,
        values: BTreeSet<String>,
    }
    // Manual `impl Default` blocks by the struct they implement, each with its source's scope.
    type ManualDefaults = BTreeMap<String, Vec<(usize, syn::ItemImpl)>>;
    struct EagerSafety<'a> {
        // An annotated `let` whose initializer is this call, with the declared type and its scope.
        allocation_site: Option<(*const syn::ExprCall, usize, Type)>,
        env: BTreeMap<String, EagerType>,
        error: Option<String>,
        functions: &'a [(usize, &'a ItemFn)],
        manual_defaults: &'a ManualDefaults,
        other_statics: &'a BTreeSet<String>,
        pending: Vec<String>,
        // Structs whose `Default` is proven (or being proven), and whether value equivalence was.
        proven_defaults: BTreeSet<(String, bool)>,
        readable_statics: &'a BTreeSet<String>,
        scope: usize,
        scopes: &'a [EagerScope<'a>],
        // The struct a manual `impl Default` body is walked for, which `Self` names there.
        self_type: Option<String>,
        static_name: &'a str,
        type_items: &'a BTreeSet<String>,
        // Every source file the proof sees, normalized.
        inventory: &'a BTreeSet<String>,
    }
    impl EagerSafety<'_> {
        // Types every local the body binds whose bindings all prove one type, to a least fixed point.
        // A name that a value item or import of the source also binds is left unproven, since a use
        // before its `let` names that item instead.
        fn bind(&mut self, scope: usize, sites: Vec<(String, BindingSite<'_>)>) {
            self.scope = scope;
            self.env = BTreeMap::new();
            if self.has_foreign_glob(scope) {
                return;
            }
            let names = sites
                .iter()
                .map(|(name, _)| name.clone())
                .filter(|name| {
                    return !self.scopes[scope].values.contains(name)
                        && !self.scopes[scope]
                            .context
                            .contains(&format!("{TYPE_USE_MARKER}{name}"));
                })
                .collect::<BTreeSet<_>>();
            loop {
                let mut proven = Vec::new();
                for name in names.iter().filter(|name| !self.env.contains_key(*name)) {
                    let mut found = None;
                    let mut consistent = true;
                    for (_, site) in sites.iter().filter(|(site_name, _)| site_name == name) {
                        let binding = match site {
                            BindingSite::Annotated(ty) => self.convert(scope, ty, 0),
                            BindingSite::Initialized(expression) => self.infer(expression),
                            BindingSite::Unknown => None,
                        };
                        match (binding, &found) {
                            (Some(binding), None) => found = Some(binding),
                            (Some(binding), Some(existing)) if &binding == existing => {}
                            _ => {
                                consistent = false;
                                break;
                            }
                        }
                    }
                    if let (true, Some(binding)) = (consistent, found) {
                        proven.push((name.clone(), binding));
                    }
                }
                if proven.is_empty() {
                    break;
                }
                self.env.extend(proven);
            }
        }

        fn bind_function(&mut self, scope: usize, function: &ItemFn) {
            let mut sites = BindingSites { sites: Vec::new() };
            for input in &function.sig.inputs {
                let FnArg::Typed(typed) = input else {
                    continue;
                };
                match typed.pat.as_ref() {
                    Pat::Ident(ident) if ident.by_ref.is_none() && ident.subpat.is_none() => {
                        sites.sites.push((
                            ident.ident.to_string(),
                            BindingSite::Annotated(typed.ty.as_ref()),
                        ));
                    }
                    pattern => sites.visit_pat(pattern),
                }
            }
            sites.visit_block(&function.block);
            self.bind(scope, sites.sites);
        }

        fn convert(&self, scope: usize, ty: &Type, depth: usize) -> Option<EagerType> {
            if depth > 16 {
                return None;
            }
            return match ty {
                Type::Group(group) => self.convert(scope, &group.elem, depth + 1),
                Type::Paren(paren) => self.convert(scope, &paren.elem, depth + 1),
                Type::Reference(reference) => Some(EagerType::Pointer(Box::new(self.convert(
                    scope,
                    &reference.elem,
                    depth + 1,
                )?))),
                Type::Path(path) if path.qself.is_none() => {
                    let segment = path.path.segments.last()?;
                    if path.path.leading_colon.is_none()
                        && path.path.segments.len() == 1
                        && segment.arguments.is_none()
                    {
                        let name = segment.ident.to_string();
                        if let Some(primitive) = primitive_eager_type(&name) {
                            let context = &self.scopes[scope].context;
                            let shadowed = context.contains(&format!("{TYPE_USE_MARKER}{name}"))
                                || context.contains(&format!("{TYPE_LOCAL_MARKER}{name}"))
                                || self.has_foreign_glob(scope);
                            return (!shadowed).then_some(primitive);
                        }
                    }
                    let resolved = self.resolve(scope, &path.path)?;
                    let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
                    match resolved.as_slice() {
                        ["std", "sync", "LazyLock"]
                        | ["std" | "alloc", "boxed", "Box"]
                        | ["std" | "alloc", "sync", "Arc"] => {
                            let PathArguments::AngleBracketed(arguments) = &segment.arguments
                            else {
                                return None;
                            };
                            let Some(GenericArgument::Type(inner)) = arguments.args.first() else {
                                return None;
                            };
                            Some(EagerType::Pointer(Box::new(self.convert(
                                scope,
                                inner,
                                depth + 1,
                            )?)))
                        }
                        ["crate", .., name] if segment.arguments.is_none() => {
                            self.crate_type(name, depth)
                        }
                        _ => None,
                    }
                }
                _ => None,
            };
        }

        // The free function of this crate a call path resolves to, through the calling source's
        // imports and local items.
        // The canonical `crate::<module>::<name>` of the emitted free function a call path resolves to
        // from the calling source. Only a function declared by the source whose module is exactly
        // that owner qualifies; a visibility-only source supplies no verified body.
        fn crate_function(&self, path: &syn::ExprPath) -> Option<String> {
            if path.qself.is_some() {
                return None;
            }
            let resolved = self.resolve(self.scope, &path.path)?;
            let (_, modules) = resolved.split_last()?;
            if modules.first().map(String::as_str) != Some("crate")
                || modules[1..]
                    .iter()
                    .any(|module| self.type_items.contains(module))
            {
                return None;
            }
            let canonical = resolved.join("::");
            return self
                .functions
                .iter()
                .any(|(index, function)| self.function_path(*index, function) == canonical)
                .then_some(canonical);
        }

        // The canonical path of a function declared by `scope`.
        fn function_path(&self, scope: usize, function: &ItemFn) -> String {
            return std::iter::once("crate".to_string())
                .chain(self.scopes[scope].module.iter().cloned())
                .chain(std::iter::once(function.sig.ident.to_string()))
                .collect::<Vec<_>>()
                .join("::");
        }

        // `segments` as an absolute `crate::` path when it names this crate: through `crate::`,
        // `self::` or `super::` relative to the source's module, or an item or module the source
        // declares. `None` for a `super::` above the crate root; other paths are returned unchanged.
        fn absolute(&self, scope: usize, segments: Vec<String>) -> Option<Vec<String>> {
            let EagerScope {
                context,
                module,
                values,
                ..
            } = &self.scopes[scope];
            let first = segments.first()?.clone();
            return match first.as_str() {
                "crate" => Some(segments),
                "self" => Some(
                    std::iter::once("crate".to_string())
                        .chain(module.iter().cloned())
                        .chain(segments.into_iter().skip(1))
                        .collect(),
                ),
                "super" => {
                    let supers = segments
                        .iter()
                        .take_while(|segment| *segment == "super")
                        .count();
                    let parent = module.len().checked_sub(supers)?;
                    Some(
                        std::iter::once("crate".to_string())
                            .chain(module[..parent].iter().cloned())
                            .chain(segments.into_iter().skip(supers))
                            .collect(),
                    )
                }
                "Self" => None,
                _ if context.contains(&format!("{TYPE_LOCAL_MARKER}{first}"))
                    || values.contains(&first) =>
                {
                    Some(
                        std::iter::once("crate".to_string())
                            .chain(module.iter().cloned())
                            .chain(segments)
                            .collect(),
                    )
                }
                _ => Some(segments),
            };
        }

        // The struct, or the alias's target, this crate declares as `name`, if its declaration is
        // unambiguous (a source passed twice declares the same item twice).
        fn crate_type(&self, name: &str, depth: usize) -> Option<EagerType> {
            let structs = self
                .scopes
                .iter()
                .enumerate()
                .flat_map(|(index, scope)| {
                    return scope
                        .program
                        .structs
                        .iter()
                        .filter(|structure| structure.ident == name)
                        .map(move |structure| (index, structure.to_token_stream().to_string()));
                })
                .collect::<Vec<_>>();
            let aliases = self
                .scopes
                .iter()
                .enumerate()
                .flat_map(|(index, scope)| {
                    return scope
                        .program
                        .type_aliases
                        .iter()
                        .filter(|alias| alias.ident == name)
                        .map(move |alias| (index, alias));
                })
                .collect::<Vec<_>>();
            if let Some((index, declaration)) = structs.first() {
                return (aliases.is_empty()
                    && structs.iter().all(|(_, other)| other == declaration))
                .then(|| EagerType::Struct(*index, name.to_string()));
            }
            let (index, alias) = aliases.first()?;
            let declaration = alias.to_token_stream().to_string();
            if !alias.generics.params.is_empty()
                || aliases
                    .iter()
                    .any(|(_, other)| other.to_token_stream().to_string() != declaration)
            {
                return None;
            }
            return self.convert(*index, &alias.ty, depth + 1);
        }

        // Whether the source has a glob import from outside the standard library, which could
        // supply any name and so leaves every unqualified name's owner undecided.
        fn has_foreign_glob(&self, scope: usize) -> bool {
            let context = &self.scopes[scope].context;
            return marker_suffixes(context, TYPE_USE_GLOB_MARKER)
                .iter()
                .any(|glob| {
                    let root = canonical_type_path_root(
                        glob.split("::").map(str::to_string).collect(),
                        context,
                    );
                    return !root.is_some_and(|root| {
                        return matches!(
                            root.first().map(String::as_str),
                            Some("std" | "core" | "alloc")
                        );
                    });
                });
        }

        fn infer(&self, expression: &Expr) -> Option<EagerType> {
            return match expression {
                Expr::Group(group) => self.infer(&group.expr),
                Expr::Paren(paren) => self.infer(&paren.expr),
                Expr::Lit(literal) => match &literal.lit {
                    Lit::Bool(_) => Some(EagerType::Bool),
                    Lit::Float(float) => match float.suffix() {
                        "" => Some(EagerType::FloatLiteral),
                        "f32" => Some(EagerType::F32),
                        "f64" => Some(EagerType::F64),
                        _ => None,
                    },
                    Lit::Int(integer) => match integer.suffix() {
                        "" => Some(EagerType::IntegerLiteral),
                        "f32" => Some(EagerType::F32),
                        "f64" => Some(EagerType::F64),
                        suffix => primitive_eager_type(suffix),
                    },
                    _ => None,
                },
                Expr::Unary(unary) => match (unary.op, self.infer(&unary.expr)?) {
                    (UnOp::Deref(_), EagerType::Pointer(inner)) => Some(*inner),
                    (UnOp::Neg(_), EagerType::F64) => Some(EagerType::F64),
                    (UnOp::Neg(_), EagerType::FloatLiteral) => Some(EagerType::FloatLiteral),
                    (UnOp::Not(_), EagerType::Bool) => Some(EagerType::Bool),
                    _ => None,
                },
                Expr::Binary(binary) => self.infer_binary(binary),
                Expr::Reference(reference) => {
                    Some(EagerType::Pointer(Box::new(self.infer(&reference.expr)?)))
                }
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    let name = path.path.segments[0].ident.to_string();
                    if let Some(binding) = self.env.get(&name) {
                        return Some(binding.clone());
                    }
                    let program = self.scopes[self.scope].program;
                    if self.readable_statics.contains(&name)
                        && let Some(rust_static) = program
                            .statics
                            .iter()
                            .find(|rust_static| rust_static.ident == name)
                    {
                        return self.convert(self.scope, &rust_static.ty, 0);
                    }
                    let constant = program
                        .constants
                        .iter()
                        .find(|constant| constant.ident == name)?;
                    self.convert(self.scope, &constant.ty, 0)
                }
                Expr::Field(field) => {
                    let syn::Member::Named(member) = &field.member else {
                        return None;
                    };
                    let mut base = self.infer(&field.base)?;
                    while let EagerType::Pointer(inner) = base {
                        base = *inner;
                    }
                    let EagerType::Struct(index, name) = base else {
                        return None;
                    };
                    let structure = self.scopes[index]
                        .program
                        .structs
                        .iter()
                        .find(|structure| structure.ident == name)?;
                    let field = structure
                        .fields
                        .iter()
                        .find(|field| field.ident.as_ref() == Some(member))?;
                    self.convert(index, &field.ty, 0)
                }
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return None;
                    };
                    let name = self.crate_function(path)?;
                    let signatures = self
                        .functions
                        .iter()
                        .filter(|(index, function)| self.function_path(*index, function) == name)
                        .collect::<Vec<_>>();
                    let (index, function) = signatures.first()?;
                    let signature = function.sig.to_token_stream().to_string();
                    if signatures.iter().any(|(_, other)| {
                        return other.sig.to_token_stream().to_string() != signature;
                    }) {
                        return None;
                    }
                    let ReturnType::Type(_, ty) = &function.sig.output else {
                        return None;
                    };
                    self.convert(*index, ty, 0)
                }
                Expr::Struct(literal) if literal.qself.is_none() => {
                    match self.resolve(self.scope, &literal.path)?.as_slice() {
                        [root, .., name] if root == "crate" => self.crate_type(name, 0),
                        _ => None,
                    }
                }
                _ => None,
            };
        }

        // The type a binary operator's built-in primitive operation produces, if its operands are
        // proven to select one: `f64` arithmetic, or a comparison or logical operator over proven
        // scalars. Two unsuffixed float literals keep the literal type, which the enclosing operation
        // must still fix to `f64`.
        fn infer_binary(&self, binary: &syn::ExprBinary) -> Option<EagerType> {
            let left = self.infer(&binary.left)?;
            let right = self.infer(&binary.right)?;
            if is_eager_arithmetic(&binary.op) {
                return match (left, right) {
                    (EagerType::F64, EagerType::F64 | EagerType::FloatLiteral)
                    | (EagerType::FloatLiteral, EagerType::F64) => Some(EagerType::F64),
                    (EagerType::FloatLiteral, EagerType::FloatLiteral) => {
                        Some(EagerType::FloatLiteral)
                    }
                    _ => None,
                };
            }
            if is_eager_comparison(&binary.op) {
                return is_eager_comparable(&binary.op, &left, &right).then_some(EagerType::Bool);
            }
            if matches!(binary.op, BinOp::And(_) | BinOp::Or(_))
                && left == EagerType::Bool
                && right == EagerType::Bool
            {
                return Some(EagerType::Bool);
            }
            return None;
        }

        fn reject(&mut self, reason: String) {
            if self.error.is_none() {
                self.error = Some(format!(
                    "`LazyLock` static `{}` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}",
                    self.static_name
                ));
            }
        }

        // The owner a value or type path names from `scope`, following Rust's precedence: an
        // explicit import, a local item or module, an absolute or `extern crate` root, a glob import,
        // an extern-prelude crate, then the standard prelude. `None` when it cannot be decided: a
        // glob import from outside the standard library, or an unqualified name no rule binds.
        fn resolve(&self, scope: usize, path: &syn::Path) -> Option<Vec<String>> {
            let EagerScope {
                context, values, ..
            } = &self.scopes[scope];
            let segments = path
                .segments
                .iter()
                .map(|segment| segment.ident.to_string())
                .collect::<Vec<_>>();
            let (first, rest) = segments.split_first()?;
            if first == "Self"
                && let Some(self_type) = &self.self_type
            {
                return Some(
                    ["crate".to_string(), self_type.clone()]
                        .into_iter()
                        .chain(rest.iter().cloned())
                        .collect(),
                );
            }
            let nested = &self.scopes[scope].program.facts.nested_use_names;
            if nested.contains(first) || nested.contains("*") {
                return None;
            }
            let resolved = if path.leading_colon.is_some() {
                canonical_type_path_root(segments.clone(), context)?
            } else if context.contains(&format!("{TYPE_USE_MARKER}{first}")) {
                let mut imported = marker_suffixes(context, TYPE_USE_TARGET_MARKER)
                    .iter()
                    .find_map(|binding| {
                        let (local, target) = binding.split_once(PROVENANCE_SEPARATOR)?;
                        return (local == first).then(|| target.to_string());
                    })?
                    .split("::")
                    .map(str::to_string)
                    .collect::<Vec<_>>();
                imported.extend(rest.iter().cloned());
                let imported_root = imported.first().cloned().unwrap_or_default();
                if matches!(imported_root.as_str(), "crate" | "self" | "super")
                    || context.contains(&format!("{TYPE_LOCAL_MARKER}{imported_root}"))
                    || values.contains(&imported_root)
                {
                    self.absolute(scope, imported)?
                } else {
                    canonical_type_path_root(imported, context)?
                }
            } else if matches!(first.as_str(), "crate" | "self" | "super" | "Self")
                || context.contains(&format!("{TYPE_LOCAL_MARKER}{first}"))
                || values.contains(first)
            {
                self.absolute(scope, segments.clone())?
            } else if matches!(first.as_str(), "std" | "core" | "alloc")
                || marker_suffixes(context, TYPE_EXTERN_CRATE_MARKER)
                    .iter()
                    .any(|binding| {
                        return binding.split(PROVENANCE_SEPARATOR).next() == Some(first.as_str());
                    })
            {
                canonical_type_path_root(segments.clone(), context)?
            } else {
                if self.has_foreign_glob(scope) {
                    return None;
                }
                let globs = marker_suffixes(context, TYPE_USE_GLOB_MARKER);
                for glob in &globs {
                    let candidate = canonical_type_path_root(
                        glob.split("::")
                            .map(str::to_string)
                            .chain(segments.iter().cloned())
                            .collect(),
                        context,
                    )?;
                    if is_eager_construction_intrinsic(&candidate) {
                        return Some(candidate);
                    }
                }
                let no_std = context.contains(TYPE_NO_STD_MARKER);
                let prelude = match first.as_str() {
                    "Box" | "String" | "ToOwned" | "ToString" | "Vec" if no_std => return None,
                    "AsMut" | "AsRef" | "From" | "Into" | "TryFrom" | "TryInto" => "core::convert",
                    "Box" => "std::boxed::Box",
                    "Clone" => "core::clone::Clone",
                    "Copy" | "Send" | "Sized" | "Sync" | "Unpin" => "core::marker",
                    "Debug" => "core::fmt::Debug",
                    "Default" => "core::default::Default",
                    "DoubleEndedIterator"
                    | "ExactSizeIterator"
                    | "Extend"
                    | "FromIterator"
                    | "IntoIterator"
                    | "Iterator" => "core::iter",
                    "Drop" | "Fn" | "FnMut" | "FnOnce" => "core::ops",
                    "Eq" | "Ord" | "PartialEq" | "PartialOrd" => "core::cmp",
                    "Err" | "Ok" | "Result" => "core::result",
                    "Hash" => "core::hash::Hash",
                    "None" | "Option" | "Some" => "core::option",
                    "String" => "std::string::String",
                    "ToOwned" => "std::borrow::ToOwned",
                    "ToString" => "std::string::ToString",
                    "Vec" => "std::vec::Vec",
                    // A standard-library glob supplies any other name, or a qualified path's first
                    // segment, from the standard library; more than one leaves the owner undecided.
                    _ if globs.len() == 1 => {
                        return canonical_type_path_root(
                            globs
                                .iter()
                                .flat_map(|glob| glob.split("::").map(str::to_string))
                                .chain(segments.iter().cloned())
                                .collect(),
                            context,
                        );
                    }
                    _ if !globs.is_empty() => return None,
                    // Any other qualified path's first segment is an extern-prelude crate.
                    _ if !rest.is_empty() => return Some(segments),
                    _ => return None,
                };
                // Names the prelude re-exports from a module are completed with that name.
                let prelude = if prelude.ends_with(first.as_str()) {
                    prelude.to_string()
                } else if prelude == "core::option" && first != "Option" {
                    format!("core::option::Option::{first}")
                } else if prelude == "core::result" && first != "Result" {
                    format!("core::result::Result::{first}")
                } else {
                    format!("{prelude}::{first}")
                };
                let prelude = if prelude.starts_with("core::option") && !no_std {
                    prelude.replacen("core", "std", 1)
                } else {
                    prelude
                };
                prelude
                    .split("::")
                    .map(str::to_string)
                    .chain(rest.iter().cloned())
                    .collect()
            };
            return Some(resolved);
        }

        // The manual `impl Default` blocks of the crate, after failing closed on every implicit
        // dispatch the proof cannot see (see the function comment).
        fn crate_dispatch(&self) -> Result<ManualDefaults, String> {
            let macro_definitions = self
                .scopes
                .iter()
                .flat_map(|scope| scope.program.facts.macro_definitions.iter().cloned())
                .collect::<BTreeSet<_>>();
            let macro_use = self
                .scopes
                .iter()
                .any(|scope| scope.program.facts.macro_use_extern_crate);
            let mut defaults = ManualDefaults::new();
            for (index, scope) in self.scopes.iter().enumerate() {
                let facts = &scope.program.facts;
                if facts.hidden_items {
                    return Err("a macro invocation in this crate carries an `impl` or attribute in its arguments, which the proof cannot see".to_string());
                }
                for attribute in &facts.attributes {
                    self.check_meta(index, &attribute.meta)?;
                }
                for module in &facts.external_modules {
                    self.check_external_module(scope.path.as_deref(), &scope.reaches, module)?;
                }
                for path in &facts.macros {
                    if !self.is_standard_macro(index, path, &macro_definitions, macro_use) {
                        return Err(format!(
                            "it cannot prove what the macro `{}!` in this crate expands to, and a macro can generate any `impl`",
                            path_text(path)
                        ));
                    }
                }
                for item in &facts.impls {
                    let Some((_, trait_path, _)) = &item.trait_ else {
                        continue;
                    };
                    let self_text = rust_type_description(&item.self_ty);
                    let Some(owner) = self.resolve(index, trait_path) else {
                        return Err(format!(
                            "it cannot resolve the trait of `impl {} for {self_text}`, which could be `Default`, `Drop` or `Deref`",
                            path_text(trait_path)
                        ));
                    };
                    let standard = matches!(
                        owner.first().map(String::as_str),
                        Some("std" | "core" | "alloc")
                    );
                    match owner.last().map(String::as_str) {
                        Some(name @ ("Deref" | "DerefMut" | "Drop")) if standard => {
                            return Err(format!(
                                "the crate implements `{name}` for `{self_text}`, which Rust runs implicitly"
                            ));
                        }
                        Some("Default") if standard => {
                            let Some(EagerType::Struct(_, name)) =
                                self.convert(index, &item.self_ty, 0)
                            else {
                                return Err(format!(
                                    "it cannot resolve the struct of `impl Default for {self_text}`"
                                ));
                            };
                            let declaration = item.to_token_stream().to_string();
                            let impls: &mut Vec<(usize, syn::ItemImpl)> =
                                defaults.entry(name).or_default();
                            if !impls.iter().any(|(_, other)| {
                                other.to_token_stream().to_string() == declaration
                            }) {
                                impls.push((index, item.clone()));
                            }
                        }
                        _ => {}
                    }
                }
            }
            return Ok(defaults);
        }

        // Fails closed unless the file Rust loads for `mod name;` is a source the proof sees, by
        // Rust's rules from the declaring file: `#[path]` relative to its directory, otherwise
        // `name.rs` or `name/mod.rs` in its directory (a `mod.rs`, `lib.rs` or `main.rs`) or in the
        // `<stem>/` directory beside it, below any enclosing inline modules. Every path a `cfg_attr`
        // may apply instead is required too, with the default location when no `#[path]` is fixed.
        fn check_external_module(
            &self,
            source: Option<&str>,
            reaches: &BTreeSet<ModuleReach>,
            module: &crate::model::ExternalModule,
        ) -> Result<(), String> {
            let unseen = |shown: String| {
                return Err(format!(
                    "the crate declares `{shown}`, whose source is not among the sources the proof sees"
                ));
            };
            let declared = match &module.path {
                Some(path) => format!("#[path = \"{path}\"] mod"),
                None => format!("mod {}", module.name),
            };
            let Some(source) = source else {
                return unseen(declared);
            };
            let mut candidates = BTreeSet::new();
            for reach in reaches {
                let Some(reached) = external_module_candidates(source, *reach, module) else {
                    return unseen(declared);
                };
                candidates.extend(reached);
            }
            if candidates.is_empty()
                || candidates.iter().any(|(_, alternatives)| {
                    return !alternatives
                        .iter()
                        .any(|candidate| self.inventory.contains(candidate));
                })
            {
                return unseen(declared);
            }
            return Ok(());
        }

        // Fails closed on an attribute that is not built in (or a tool attribute), and on a derive
        // that is not standard; `cfg_attr` is checked through the attributes it may apply.
        fn check_meta(&self, scope: usize, meta: &syn::Meta) -> Result<(), String> {
            let path = meta.path();
            let first = path
                .segments
                .first()
                .map(|segment| segment.ident.to_string())
                .unwrap_or_default();
            if path.segments.len() > 1 {
                return if matches!(first.as_str(), "clippy" | "diagnostic" | "rustfmt") {
                    Ok(())
                } else {
                    Err(format!(
                        "the crate uses the attribute `#[{}]`, which is not built in and can generate any item",
                        path_text(path)
                    ))
                };
            }
            if self.scopes[scope]
                .context
                .contains(&format!("{TYPE_USE_MARKER}{first}"))
                || self.scopes[scope]
                    .program
                    .facts
                    .nested_use_names
                    .contains(&first)
            {
                return Err(format!(
                    "the crate uses the imported attribute `#[{first}]`, which can generate any item"
                ));
            }
            match first.as_str() {
                "derive" => {
                    let syn::Meta::List(list) = meta else {
                        return Err("the crate uses a malformed `#[derive]`".to_string());
                    };
                    let derives = list
                        .parse_args_with(Punctuated::<syn::Path, Token![,]>::parse_terminated)
                        .map_err(|_| "the crate uses a malformed `#[derive]`".to_string())?;
                    for derive in &derives {
                        if self.standard_derive(scope, derive).is_none() {
                            return Err(format!(
                                "the crate derives `{}`, which is not a standard derive and can generate any `impl`",
                                path_text(derive)
                            ));
                        }
                    }
                    return Ok(());
                }
                "cfg_attr" => {
                    let syn::Meta::List(list) = meta else {
                        return Err("the crate uses a malformed `#[cfg_attr]`".to_string());
                    };
                    let metas = list
                        .parse_args_with(Punctuated::<syn::Meta, Token![,]>::parse_terminated)
                        .map_err(|_| "the crate uses a malformed `#[cfg_attr]`".to_string())?;
                    for applied in metas.iter().skip(1) {
                        self.check_meta(scope, applied)?;
                    }
                    return Ok(());
                }
                "allow"
                | "automatically_derived"
                | "cfg"
                | "cold"
                | "deny"
                | "deprecated"
                | "doc"
                | "expect"
                | "forbid"
                | "ignore"
                | "inline"
                | "macro_export"
                | "macro_use"
                | "must_use"
                | "no_mangle"
                | "no_std"
                | "non_exhaustive"
                | "path"
                | "repr"
                | "should_panic"
                | "test"
                | "track_caller"
                | "unsafe"
                | "warn" => {
                    return Ok(());
                }
                _ => {
                    return Err(format!(
                        "the crate uses the attribute `#[{first}]`, which is not built in and can generate any item"
                    ));
                }
            }
        }

        // Whether `field`'s type is one the generated allocation defaults by its spelling, and resolves
        // to the standard type whose `Default` is exactly that value.
        fn is_emitted_default_type(&self, scope: usize, ty: &Type) -> bool {
            return match ty {
                Type::Group(group) => self.is_emitted_default_type(scope, &group.elem),
                Type::Paren(paren) => self.is_emitted_default_type(scope, &paren.elem),
                Type::Reference(reference) => self.is_emitted_default_type(scope, &reference.elem),
                Type::Tuple(tuple) => tuple
                    .elems
                    .iter()
                    .all(|element| self.is_emitted_default_type(scope, element)),
                Type::Path(path) if path.qself.is_none() => {
                    let Some(segment) = path.path.segments.last() else {
                        return false;
                    };
                    let name = segment.ident.to_string();
                    if primitive_eager_type(&name).is_some() {
                        return matches!(
                            self.convert(scope, ty, 0),
                            Some(
                                EagerType::Bool
                                    | EagerType::F32
                                    | EagerType::F64
                                    | EagerType::Integer(_)
                            )
                        );
                    }
                    let Some(owner) = self.resolve(scope, &path.path) else {
                        return false;
                    };
                    let owner = owner.iter().map(String::as_str).collect::<Vec<_>>();
                    let inner = || {
                        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                            return false;
                        };
                        return arguments.args.iter().any(|argument| {
                            return matches!(argument, GenericArgument::Type(inner) if self.is_emitted_default_type(scope, inner));
                        });
                    };
                    match owner.as_slice() {
                        ["std" | "alloc", "string", "String"]
                        | ["std" | "core", "option", "Option"]
                        | ["std" | "alloc", "vec", "Vec"] => true,
                        ["std" | "alloc", "sync", "Arc"]
                        | ["flight_entity", "Ref"]
                        | ["flight_entity", "ir", "Ref"] => inner(),
                        _ => false,
                    }
                }
                _ => false,
            };
        }

        // Whether `value` is exactly the default the generated allocation writes for a field of `ty`.
        fn is_emitted_default_value(&self, scope: usize, ty: &Type, value: &Expr) -> bool {
            if let Expr::Call(call) = value
                && call.args.is_empty()
                && let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && self.resolve(scope, &path.path).is_some_and(|owner| {
                    return matches!(
                        owner
                            .iter()
                            .map(String::as_str)
                            .collect::<Vec<_>>()
                            .as_slice(),
                        ["std" | "core", "default", "Default", "default"]
                    );
                })
            {
                return true;
            }
            let ty = match ty {
                Type::Group(group) => {
                    return self.is_emitted_default_value(scope, &group.elem, value);
                }
                Type::Paren(paren) => {
                    return self.is_emitted_default_value(scope, &paren.elem, value);
                }
                Type::Tuple(tuple) => {
                    let Expr::Tuple(values) = value else {
                        return false;
                    };
                    return tuple.elems.len() == values.elems.len()
                        && tuple
                            .elems
                            .iter()
                            .zip(&values.elems)
                            .all(|(element, value)| {
                                self.is_emitted_default_value(scope, element, value)
                            });
                }
                Type::Path(path) => path,
                _ => return false,
            };
            let Some(segment) = ty.path.segments.last() else {
                return false;
            };
            let constructed = |expected: &[&str]| -> Option<&Punctuated<Expr, Token![,]>> {
                let Expr::Call(call) = value else {
                    return None;
                };
                let Expr::Path(path) = call.func.as_ref() else {
                    return None;
                };
                let owner = self.resolve(scope, &path.path)?;
                return (owner
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .as_slice()
                    == expected)
                    .then_some(&call.args);
            };
            return match segment.ident.to_string().as_str() {
                "bool" => {
                    matches!(value, Expr::Lit(literal) if matches!(&literal.lit, Lit::Bool(flag) if !flag.value))
                }
                name if primitive_eager_type(name).is_some() => match value {
                    Expr::Lit(literal) => match &literal.lit {
                        Lit::Int(integer) => {
                            integer.base10_digits().bytes().all(|digit| digit == b'0')
                        }
                        Lit::Float(float) => float
                            .base10_parse::<f64>()
                            .is_ok_and(|number| number == 0.0 && number.is_sign_positive()),
                        _ => false,
                    },
                    _ => false,
                },
                "String" => constructed(&["std", "string", "String", "new"])
                    .is_some_and(Punctuated::is_empty),
                "Vec" => {
                    constructed(&["std", "vec", "Vec", "new"]).is_some_and(Punctuated::is_empty)
                }
                "Option" => {
                    matches!(value, Expr::Path(path) if path.qself.is_none() && self.resolve(scope, &path.path).is_some_and(|owner| {
                        return matches!(owner.iter().map(String::as_str).collect::<Vec<_>>().as_slice(), ["std" | "core", "option", "Option", "None"]);
                    }))
                }
                "Arc" | "Ref" => {
                    let arguments = constructed(&["std", "sync", "Arc", "new"])
                        .or_else(|| constructed(&["flight_entity", "Ref", "new"]));
                    let PathArguments::AngleBracketed(generics) = &segment.arguments else {
                        return false;
                    };
                    let Some(GenericArgument::Type(inner)) = generics.args.first() else {
                        return false;
                    };
                    arguments.is_some_and(|arguments| {
                        return arguments.len() == 1
                            && self.is_emitted_default_value(scope, inner, &arguments[0]);
                    })
                }
                _ => false,
            };
        }

        // Whether `path` invokes, through the standard macro prelude or a resolved path, one of the
        // macros the proof knows cannot introduce an implicit-dispatch item: the standard library's
        // expression, formatting, assertion and diagnostic macros (`include!`, `thread_local!` and
        // every other standard macro fail closed), and `flight_entity::impl_entity`, which implements
        // only `Entity`.
        fn is_standard_macro(
            &self,
            scope: usize,
            path: &syn::Path,
            definitions: &BTreeSet<String>,
            macro_use: bool,
        ) -> bool {
            let EagerScope {
                context, program, ..
            } = &self.scopes[scope];
            const ITEMLESS: [&str; 32] = [
                "assert",
                "assert_eq",
                "assert_ne",
                "cfg",
                "column",
                "compile_error",
                "concat",
                "dbg",
                "debug_assert",
                "debug_assert_eq",
                "debug_assert_ne",
                "env",
                "eprint",
                "eprintln",
                "file",
                "format",
                "format_args",
                "include_bytes",
                "include_str",
                "line",
                "matches",
                "module_path",
                "option_env",
                "panic",
                "print",
                "println",
                "stringify",
                "todo",
                "unimplemented",
                "unreachable",
                "vec",
                "write",
            ];
            let itemless = |name: &str| ITEMLESS.contains(&name) || name == "writeln";
            if path.leading_colon.is_none() && path.segments.len() == 1 {
                let name = path.segments[0].ident.to_string();
                if !context.contains(&format!("{TYPE_USE_MARKER}{name}")) {
                    return itemless(&name)
                        && !definitions.contains(&name)
                        && !macro_use
                        && !program.facts.nested_use_names.contains(&name)
                        && !program.facts.nested_use_names.contains("*")
                        && marker_suffixes(context, TYPE_USE_GLOB_MARKER).is_empty();
                }
            }
            return self.resolve(scope, path).is_some_and(|owner| {
                let owner = owner.iter().map(String::as_str).collect::<Vec<_>>();
                return matches!(owner.first(), Some(&("std" | "core" | "alloc")))
                    && owner.last().is_some_and(|name| itemless(name))
                    || owner.as_slice() == ["flight_entity", "impl_entity"];
            });
        }

        // Proves `allocate_entity::<ty>()`: `ty` is a struct of this crate whose `Default` is pure
        // and reproduces the generated allocation's field values.
        fn prove_allocation(&mut self, scope: usize, ty: &Type) {
            match self.convert(scope, ty, 0) {
                Some(EagerType::Struct(_, name)) => self.prove_struct_default(&name, true),
                _ => self.reject(format!(
                    "it allocates `{}` with `allocate_entity`, which is not one struct of this crate",
                    rust_type_description(ty)
                )),
            }
        }

        // Proves a struct's `Default` pure (and, with `equivalent`, value-equivalent to the
        // generated allocation): through its standard derive field by field, or through its manual
        // `impl Default`. Every struct is proven once per mode, so recursive defaults terminate.
        fn prove_struct_default(&mut self, name: &str, equivalent: bool) {
            if !self.proven_defaults.insert((name.to_string(), equivalent)) {
                return;
            }
            let mut declarations = Vec::<(usize, &ItemStruct)>::new();
            for (index, scope) in self.scopes.iter().enumerate() {
                for structure in scope
                    .program
                    .structs
                    .iter()
                    .filter(|structure| structure.ident == name)
                {
                    let tokens = structure.to_token_stream().to_string();
                    if !declarations
                        .iter()
                        .any(|(_, other)| other.to_token_stream().to_string() == tokens)
                    {
                        declarations.push((index, structure));
                    }
                }
            }
            let [(index, structure)] = declarations.as_slice() else {
                self.reject(format!(
                    "`{name}` is not one unambiguous struct of this crate"
                ));
                return;
            };
            let (index, structure) = (*index, *structure);
            let derived = structure
                .attrs
                .iter()
                .filter(|attribute| attribute.path().is_ident("derive"))
                .filter_map(|attribute| {
                    return attribute
                        .parse_args_with(Punctuated::<syn::Path, Token![,]>::parse_terminated)
                        .ok();
                })
                .flatten()
                .any(|derive| self.standard_derive(index, &derive).as_deref() == Some("Default"));
            let manual = self.manual_defaults.get(name).cloned().unwrap_or_default();
            match (derived, manual.as_slice()) {
                (true, []) => {
                    let nullable = self.scopes[index].program.nullable_options;
                    for field in &structure.fields {
                        let field_name = field
                            .ident
                            .as_ref()
                            .map_or_else(|| "field".to_string(), ToString::to_string);
                        if equivalent && rust_default_expression(&field.ty).is_some() {
                            if !self.is_emitted_default_type(index, &field.ty) {
                                self.reject(format!(
                                    "the generated allocation defaults `{name}.{field_name}` by the spelling of `{}`, which does not resolve to the standard type with that default",
                                    rust_type_description(&field.ty)
                                ));
                                return;
                            }
                            if nullable && option_inner_type(&field.ty).is_some() {
                                self.reject(format!(
                                    "`{name}.{field_name}` is an `Option` its source represents as `null`, but the generated allocation writes `undefined`"
                                ));
                                return;
                            }
                        }
                        self.prove_type_default(index, &field.ty);
                    }
                }
                (false, [(impl_scope, item)]) => {
                    self.walk_manual_default(*impl_scope, name, index, structure, item, equivalent);
                }
                (false, []) => self.reject(format!(
                    "`{name}` has no `Default` implementation this crate shows, so a macro, a hidden module or nothing provides the one `allocate_entity` runs"
                )),
                _ => self.reject(format!(
                    "`{name}` has more than one `Default` implementation"
                )),
            }
        }

        // Proves a type's `Default` pure: primitives and the standard `String`, `Vec` and `Option`
        // (whose defaults are empty), the entity runtime slot, the standard pointers by their
        // target, and this crate's structs and aliases recursively.
        fn prove_type_default(&mut self, scope: usize, ty: &Type) {
            match ty {
                Type::Group(group) => return self.prove_type_default(scope, &group.elem),
                Type::Paren(paren) => return self.prove_type_default(scope, &paren.elem),
                Type::Array(array) => return self.prove_type_default(scope, &array.elem),
                Type::Tuple(tuple) => {
                    for element in &tuple.elems {
                        self.prove_type_default(scope, element);
                    }
                    return;
                }
                Type::Path(path) if path.qself.is_none() => {
                    let Some(segment) = path.path.segments.last() else {
                        return;
                    };
                    if primitive_eager_type(&segment.ident.to_string()).is_some()
                        && self.convert(scope, ty, 0).is_some()
                    {
                        return;
                    }
                    let owner = self.resolve(scope, &path.path);
                    let owner_text = owner.as_ref().map(|owner| owner.join("::"));
                    let owner = owner
                        .iter()
                        .flatten()
                        .map(String::as_str)
                        .collect::<Vec<_>>();
                    match owner.as_slice() {
                        ["std" | "alloc", "string", "String"]
                        | ["std" | "core", "option", "Option"]
                        | ["std" | "alloc", "vec", "Vec"]
                        | ["flight_entity", "EntityRuntimeSlot"] => return,
                        ["std" | "alloc", "boxed", "Box"]
                        | ["std" | "alloc", "sync", "Arc"]
                        | ["std", "sync", "RwLock"]
                        | ["flight_entity", "Ref"]
                        | ["flight_entity", "ir", "Ref"] => {
                            if let PathArguments::AngleBracketed(arguments) = &segment.arguments
                                && let Some(GenericArgument::Type(inner)) = arguments.args.first()
                            {
                                return self.prove_type_default(scope, inner);
                            }
                        }
                        ["crate", .., name] => {
                            let name = name.to_string();
                            match self.crate_type(&name, 0) {
                                Some(EagerType::Struct(_, structure)) if structure == name => {
                                    return self.prove_struct_default(&name, false);
                                }
                                Some(_) => {
                                    if let Some((alias_scope, alias)) =
                                        self.scopes.iter().enumerate().find_map(|(index, scope)| {
                                            return scope
                                                .program
                                                .type_aliases
                                                .iter()
                                                .find(|alias| {
                                                    alias.ident == name
                                                        && alias.generics.params.is_empty()
                                                })
                                                .map(|alias| (index, alias.ty.as_ref().clone()));
                                        })
                                    {
                                        return self.prove_type_default(alias_scope, &alias);
                                    }
                                }
                                None => {}
                            }
                        }
                        _ => {}
                    }
                    self.reject(format!(
                        "the `Default` of `{}`{} is not visible to the proof",
                        rust_type_description(ty),
                        owner_text.map_or_else(String::new, |owner| format!(" (`{owner}`)"))
                    ));
                }
                _ => self.reject(format!(
                    "the `Default` of `{}` is not visible to the proof",
                    rust_type_description(ty)
                )),
            }
        }

        // The standard derive `path` names (`Clone`, `Copy`, `Debug`, `Default`, `Eq`, `Hash`,
        // `Ord`, `PartialEq`, `PartialOrd`), resolved through the derive-macro prelude or imports.
        fn standard_derive(&self, scope: usize, path: &syn::Path) -> Option<String> {
            const DERIVES: [&str; 9] = [
                "Clone",
                "Copy",
                "Debug",
                "Default",
                "Eq",
                "Hash",
                "Ord",
                "PartialEq",
                "PartialOrd",
            ];
            let owner = self.resolve(scope, path)?;
            let standard = matches!(owner.first().map(String::as_str), Some("std" | "core"));
            let name = owner.last()?;
            return (standard && DERIVES.contains(&name.as_str())).then(|| name.clone());
        }

        // Walks a manual `impl Default` for `name`: its body must return one struct literal of the
        // struct, each field the generated allocation defaults set to exactly that default (with
        // `equivalent`), and every value proven like the factory.
        fn walk_manual_default(
            &mut self,
            scope: usize,
            name: &str,
            struct_scope: usize,
            structure: &ItemStruct,
            item: &syn::ItemImpl,
            equivalent: bool,
        ) {
            let Some(function) = item.items.iter().find_map(|member| match member {
                syn::ImplItem::Fn(function) if function.sig.ident == "default" => Some(function),
                _ => None,
            }) else {
                self.reject(format!(
                    "the manual `Default` for `{name}` has no `default` function"
                ));
                return;
            };
            let literal = match function.block.stmts.as_slice() {
                [Stmt::Expr(Expr::Return(returned), _)] => returned.expr.as_deref(),
                [Stmt::Expr(value, None)] => Some(value),
                _ => None,
            };
            let previous = (
                self.scope,
                std::mem::take(&mut self.env),
                self.self_type.replace(name.to_string()),
            );
            let fields = match literal {
                Some(Expr::Struct(literal))
                    if literal.rest.is_none()
                        && literal.qself.is_none()
                        && matches!(self.resolve(scope, &literal.path).as_deref(), Some([root, .., last]) if root == "crate" && last == name) =>
                {
                    Some(&literal.fields)
                }
                _ => None,
            };
            let Some(fields) = fields else {
                self.reject(format!(
                    "the manual `Default` for `{name}` must return one struct literal of `{name}`, so its field values can be compared with the generated allocation"
                ));
                (self.scope, self.env, self.self_type) = previous;
                return;
            };
            self.bind(scope, Vec::new());
            for value in fields {
                let syn::Member::Named(member) = &value.member else {
                    continue;
                };
                let Some(field) = structure
                    .fields
                    .iter()
                    .find(|field| field.ident.as_ref() == Some(member))
                else {
                    continue;
                };
                if equivalent
                    && rust_default_expression(&field.ty).is_some()
                    && !(self.is_emitted_default_type(struct_scope, &field.ty)
                        && self.is_emitted_default_value(scope, &field.ty, &value.expr))
                {
                    self.reject(format!(
                        "the manual `Default` for `{name}` sets `{member}` to `{}`, which the generated allocation does not reproduce",
                        value.expr.to_token_stream()
                    ));
                    break;
                }
                if let Expr::Call(call) = &value.expr
                    && call.args.is_empty()
                    && let Expr::Path(path) = call.func.as_ref()
                    && path.qself.is_none()
                    && self.resolve(scope, &path.path).is_some_and(|owner| {
                        return matches!(
                            owner
                                .iter()
                                .map(String::as_str)
                                .collect::<Vec<_>>()
                                .as_slice(),
                            ["std" | "core", "default", "Default", "default"]
                        );
                    })
                {
                    self.prove_type_default(struct_scope, &field.ty);
                } else {
                    self.visit_expr(&value.expr);
                }
            }
            (self.scope, self.env, self.self_type) = previous;
        }

        // Visits an operand whose type the enclosing proven operation fixed, so nested arithmetic
        // of unsuffixed literals in it is already `f64` and needs no proof of its own.
        fn visit_unified_operand(&mut self, expression: &Expr) {
            match expression {
                Expr::Group(group) => self.visit_unified_operand(&group.expr),
                Expr::Paren(paren) => self.visit_unified_operand(&paren.expr),
                Expr::Binary(binary) if is_eager_arithmetic(&binary.op) => {
                    self.visit_unified_operand(&binary.left);
                    self.visit_unified_operand(&binary.right);
                }
                Expr::Unary(unary) if matches!(unary.op, UnOp::Neg(_)) => {
                    self.visit_unified_operand(&unary.expr);
                }
                expression => self.visit_expr(expression),
            }
        }
    }
    impl<'ast> Visit<'ast> for EagerSafety<'_> {
        fn visit_expr_binary(&mut self, binary: &'ast syn::ExprBinary) {
            let op = binary.op.to_token_stream();
            if is_eager_arithmetic(&binary.op) {
                if self.infer_binary(binary) != Some(EagerType::F64) {
                    self.reject(format!(
                        "it applies `{op}` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"
                    ));
                    return;
                }
                self.visit_unified_operand(&binary.left);
                self.visit_unified_operand(&binary.right);
            } else if matches!(
                binary.op,
                BinOp::AddAssign(_)
                    | BinOp::DivAssign(_)
                    | BinOp::MulAssign(_)
                    | BinOp::RemAssign(_)
                    | BinOp::SubAssign(_)
            ) {
                if self.infer(&binary.left) != Some(EagerType::F64)
                    || !matches!(
                        self.infer(&binary.right),
                        Some(EagerType::F64 | EagerType::FloatLiteral)
                    )
                {
                    self.reject(format!(
                        "it applies `{op}` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"
                    ));
                    return;
                }
                self.visit_expr(&binary.left);
                self.visit_unified_operand(&binary.right);
            } else if is_eager_comparison(&binary.op) {
                if self.infer_binary(binary) != Some(EagerType::Bool) {
                    self.reject(format!(
                        "it compares with `{op}` operands not proven to be one exactly representable primitive scalar type, so it could run a user `PartialEq` or `PartialOrd`"
                    ));
                    return;
                }
                self.visit_unified_operand(&binary.left);
                self.visit_unified_operand(&binary.right);
            } else if matches!(binary.op, BinOp::And(_) | BinOp::Or(_)) {
                syn::visit::visit_expr_binary(self, binary);
            } else {
                self.reject(format!(
                    "it applies `{op}` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"
                ));
            }
        }

        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            let Expr::Path(path) = call.func.as_ref() else {
                self.reject("it calls a function value".to_string());
                return;
            };
            let owner = if path.qself.is_none() {
                self.resolve(self.scope, &path.path)
            } else {
                None
            };
            let constructor = owner
                .as_ref()
                .is_some_and(|owner| is_eager_construction_intrinsic(owner));
            if constructor
                && owner
                    .as_ref()
                    .and_then(|owner| owner.last())
                    .map(String::as_str)
                    == Some("allocate_entity")
            {
                let declared = path
                    .path
                    .segments
                    .last()
                    .and_then(|segment| match &segment.arguments {
                        PathArguments::AngleBracketed(arguments) => {
                            arguments.args.iter().find_map(|argument| match argument {
                                GenericArgument::Type(ty) => Some((self.scope, ty.clone())),
                                _ => None,
                            })
                        }
                        _ => None,
                    })
                    .or_else(|| {
                        let (site, scope, ty) = self.allocation_site.as_ref()?;
                        return std::ptr::eq(*site, call).then(|| (*scope, ty.clone()));
                    });
                let Some((scope, ty)) = declared else {
                    self.reject("it calls `allocate_entity` without a declared result type (a turbofish or an annotated `let`), so the `Default` it runs is not proven".to_string());
                    return;
                };
                self.prove_allocation(scope, &ty);
            }
            let associated_default = !constructor
                && call.args.is_empty()
                && path.qself.is_none()
                && path.path.segments.len() > 1
                && path
                    .path
                    .segments
                    .last()
                    .is_some_and(|segment| segment.ident == "default");
            if associated_default {
                let mut owner_path = path.path.clone();
                owner_path.segments.pop();
                owner_path.segments.pop_punct();
                let owner_type = Type::Path(syn::TypePath {
                    qself: None,
                    path: owner_path,
                });
                if matches!(
                    owner
                        .as_deref()
                        .map(|owner| owner.iter().map(String::as_str).collect::<Vec<_>>())
                        .as_deref(),
                    Some(["std" | "core", "default", "Default", "default"])
                ) {
                    self.reject("it calls `Default::default()` without a declared result type, so the `Default` it runs is not proven".to_string());
                    return;
                }
                self.prove_type_default(self.scope, &owner_type);
            } else if !constructor {
                let Some(name) = self.crate_function(path) else {
                    self.reject(format!(
                        "it calls `{}`, which is not a side-effect-free function of this crate",
                        path.path
                            .segments
                            .iter()
                            .map(|segment| segment.ident.to_string())
                            .collect::<Vec<_>>()
                            .join("::")
                    ));
                    return;
                };
                self.pending.push(name);
            }
            for argument in &call.args {
                self.visit_expr(argument);
            }
        }

        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let (Pat::Type(typed), Some(init)) = (&local.pat, &local.init)
                && let Expr::Call(call) = init.expr.as_ref()
            {
                self.allocation_site =
                    Some((std::ptr::from_ref(call), self.scope, (*typed.ty).clone()));
            }
            syn::visit::visit_local(self, local);
            self.allocation_site = None;
        }

        fn visit_expr_cast(&mut self, _cast: &'ast syn::ExprCast) {
            self.reject("it casts with `as`, which converts differently in Rust".to_string());
        }

        fn visit_expr_index(&mut self, _index: &'ast syn::ExprIndex) {
            self.reject("it indexes, which can panic".to_string());
        }

        fn visit_expr_macro(&mut self, expression: &'ast syn::ExprMacro) {
            self.reject(format!(
                "it invokes `{}!`",
                expression
                    .mac
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string())
                    .unwrap_or_default()
            ));
        }

        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            self.reject(format!(
                "it calls `.{}()`, and a method name does not prove which operation its receiver performs",
                call.method
            ));
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            let Some(name) = path
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string())
            else {
                return;
            };
            if name == self.static_name {
                self.reject("it reaches the static itself (an initialization cycle)".to_string());
            } else if self.other_statics.contains(&name) && !self.readable_statics.contains(&name) {
                self.reject(format!(
                    "it reads `{name}`, which is not a `LazyLock` or immutable primitive static declared before it"
                ));
            }
        }

        fn visit_expr_try(&mut self, _expression: &'ast syn::ExprTry) {
            self.reject("it uses `?`".to_string());
        }

        fn visit_expr_unary(&mut self, unary: &'ast syn::ExprUnary) {
            let operand = self.infer(&unary.expr);
            match unary.op {
                UnOp::Deref(_) if matches!(operand, Some(EagerType::Pointer(_))) => {}
                UnOp::Deref(_) => {
                    self.reject("it dereferences an operand not proven to be a reference or a standard `LazyLock`, `Box` or `Arc`, so it could run a user `Deref`".to_string());
                    return;
                }
                UnOp::Neg(_)
                    if matches!(operand, Some(EagerType::F64 | EagerType::FloatLiteral)) => {}
                UnOp::Not(_) if operand == Some(EagerType::Bool) => {}
                _ => {
                    self.reject(format!(
                        "it applies `{}` to an operand not proven to be {}",
                        unary.op.to_token_stream(),
                        if matches!(unary.op, UnOp::Not(_)) {
                            "a `bool`"
                        } else {
                            "an `f64` value"
                        }
                    ));
                    return;
                }
            }
            syn::visit::visit_expr_unary(self, unary);
        }

        fn visit_expr_unsafe(&mut self, _expression: &'ast syn::ExprUnsafe) {
            self.reject("it uses `unsafe`".to_string());
        }

        fn visit_stmt_macro(&mut self, statement: &'ast syn::StmtMacro) {
            self.reject(format!(
                "it invokes `{}!`",
                statement
                    .mac
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string())
                    .unwrap_or_default()
            ));
        }
    }
    let crate_name = identities
        .first()
        .and_then(|identity| identity.as_deref())
        .and_then(|identity| identity.split("::").next())
        .map(str::to_string);
    let mut scopes = programs
        .iter()
        .copied()
        .chain(visibility_programs)
        .enumerate()
        .map(|(index, source)| {
            let module = identities
                .get(index)
                .and_then(|identity| identity.as_deref())
                .and_then(|identity| {
                    let mut segments = identity.split("::").map(str::to_string);
                    return (segments.next() == crate_name).then(|| segments.collect::<Vec<_>>());
                })
                .unwrap_or_else(|| vec![format!("#{index}")]);
            let mut context = HashSet::new();
            insert_program_type_path_context(&mut context, source);
            let values = source
                .functions
                .iter()
                .map(|function| function.sig.ident.to_string())
                .chain(
                    source
                        .constants
                        .iter()
                        .map(|constant| constant.ident.to_string()),
                )
                .chain(
                    source
                        .statics
                        .iter()
                        .map(|rust_static| rust_static.ident.to_string()),
                )
                .chain(source.facts.value_names.iter().cloned())
                .collect();
            return EagerScope {
                context,
                module,
                reaches: BTreeSet::new(),
                path: paths
                    .get(index)
                    .and_then(|path| path.as_deref())
                    .map(normalize_source_path),
                program: source,
                values,
            };
        })
        .collect::<Vec<_>>();
    let inventory = scopes
        .iter()
        .filter_map(|scope| scope.path.clone())
        .collect::<BTreeSet<_>>();
    let mut inventory_indices = BTreeMap::<String, Vec<usize>>::new();
    for (index, scope) in scopes.iter().enumerate() {
        if let Some(path) = &scope.path {
            inventory_indices
                .entry(path.clone())
                .or_default()
                .push(index);
        }
    }
    // Carry each declaration's load kind to its target source. Crate roots are known root
    // reaches; a source not connected to an inventoried root is conservatively treated as an
    // ordinary module of the supplied fragment, preserving the API's partial-inventory behavior
    // without granting it crate-root directory rules.
    let propagate_reaches = |scopes: &mut Vec<EagerScope<'_>>| loop {
        let known = scopes
            .iter()
            .map(|scope| scope.reaches.clone())
            .collect::<Vec<_>>();
        let mut additions = BTreeSet::new();
        for (index, reaches) in known.iter().enumerate() {
            let Some(source) = scopes[index].path.as_deref() else {
                continue;
            };
            for reach in reaches {
                for module in &scopes[index].program.facts.external_modules {
                    let Some(groups) = external_module_candidates(source, *reach, module) else {
                        continue;
                    };
                    for (child_reach, alternatives) in groups {
                        for candidate in alternatives {
                            if let Some(indices) = inventory_indices.get(&candidate) {
                                additions
                                    .extend(indices.iter().map(|target| (*target, child_reach)));
                            }
                        }
                    }
                }
            }
        }
        let mut changed = false;
        for (index, reach) in additions {
            changed |= scopes[index].reaches.insert(reach);
        }
        if !changed {
            break;
        }
    };
    for scope in &mut scopes {
        if scope.module.is_empty() {
            scope.reaches.insert(ModuleReach::CrateRoot);
        }
    }
    propagate_reaches(&mut scopes);
    for index in 0..scopes.len() {
        if scopes[index].reaches.is_empty() {
            scopes[index].reaches.insert(ModuleReach::Ordinary);
            propagate_reaches(&mut scopes);
        }
    }
    let functions = programs
        .iter()
        .enumerate()
        .flat_map(|(index, source)| {
            source
                .functions
                .iter()
                .map(move |function| (index, function))
        })
        .collect::<Vec<_>>();
    let all_statics = programs
        .iter()
        .flat_map(|source| &source.statics)
        .map(|rust_static| rust_static.ident.to_string())
        .collect::<BTreeSet<_>>();
    let type_items = programs
        .iter()
        .flat_map(|source| {
            return source
                .structs
                .iter()
                .map(|structure| structure.ident.to_string())
                .chain(
                    source
                        .enums
                        .iter()
                        .map(|rust_enum| rust_enum.ident.to_string()),
                )
                .chain(
                    source
                        .type_aliases
                        .iter()
                        .map(|type_alias| type_alias.ident.to_string()),
                );
        })
        .collect::<BTreeSet<_>>();
    // `programs[0]` is the source being generated, whose statics these are.
    let generated = programs
        .iter()
        .position(|source| std::ptr::eq(*source, program))
        .unwrap_or(0);
    let no_defaults = ManualDefaults::new();
    let mut manual_defaults = None;
    let mut readable_statics = BTreeSet::new();
    for rust_static in &program.statics {
        let name = rust_static.ident.to_string();
        let Some((_, initializer)) = crate::model::lazy_lock_static(rust_static) else {
            if matches!(rust_static.mutability, syn::StaticMutability::None)
                && named_type(&rust_static.ty)
                    .is_some_and(|type_name| primitive_eager_type(&type_name).is_some())
            {
                readable_statics.insert(name);
            }
            continue;
        };
        if manual_defaults.is_none() {
            let checker = EagerSafety {
                allocation_site: None,
                env: BTreeMap::new(),
                error: None,
                functions: &functions,
                manual_defaults: &no_defaults,
                other_statics: &all_statics,
                pending: Vec::new(),
                proven_defaults: BTreeSet::new(),
                readable_statics: &readable_statics,
                scope: generated,
                scopes: &scopes,
                self_type: None,
                static_name: &name,
                type_items: &type_items,
                inventory: &inventory,
            };
            match checker.crate_dispatch() {
                Ok(defaults) => manual_defaults = Some(defaults),
                Err(reason) => {
                    return Err(compile_error(format!(
                        "`LazyLock` static `{name}` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}"
                    )));
                }
            }
        }
        let mut safety = EagerSafety {
            allocation_site: None,
            env: BTreeMap::new(),
            error: None,
            functions: &functions,
            manual_defaults: manual_defaults.as_ref().unwrap_or(&no_defaults),
            other_statics: &all_statics,
            pending: Vec::new(),
            proven_defaults: BTreeSet::new(),
            readable_statics: &readable_statics,
            scope: generated,
            scopes: &scopes,
            self_type: None,
            static_name: &name,
            type_items: &type_items,
            inventory: &inventory,
        };
        match initializer {
            Expr::Path(path) => {
                let Some(factory) = safety.crate_function(path) else {
                    return Err(compile_error(format!(
                        "`LazyLock` initializer for `{name}` must name a free function of this crate; `{}` has no TypeScript value",
                        path.path
                            .segments
                            .iter()
                            .map(|segment| segment.ident.to_string())
                            .collect::<Vec<_>>()
                            .join("::")
                    )));
                };
                safety.pending.push(factory);
            }
            initializer => {
                let mut sites = BindingSites { sites: Vec::new() };
                sites.visit_expr(initializer);
                safety.bind(generated, sites.sites);
                safety.visit_expr(initializer);
            }
        }
        let mut visited = BTreeSet::new();
        while let Some(function_name) = safety.pending.pop() {
            if safety.error.is_some() {
                break;
            }
            if !visited.insert(function_name.clone()) {
                continue;
            }
            let owners = functions
                .iter()
                .filter(|(index, function)| safety.function_path(*index, function) == function_name)
                .collect::<Vec<_>>();
            for (index, function) in owners {
                safety.bind_function(*index, function);
                safety.visit_block(&function.block);
            }
        }
        if let Some(error) = safety.error {
            return Err(compile_error(error));
        }
        readable_statics.insert(name);
    }
    return Ok(());
}

// An `array-like` parameter is only an `ArrayLike<T>` in TypeScript, so its function may read its
// length (`.len()`, `.is_empty()`), index it, or pass it (optionally as `&p`) to a crate function
// whose parameter at that position is also `array-like`. Any other use (iteration, slicing, methods,
// moving it into a binding) would need array methods `ArrayLike` lacks, so it fails closed. An onward
// call is checked against the callee its path resolves to from this source, through its `use`
// bindings and source identity; a name the function itself binds (a closure, parameter, pattern,
// nested item or `use`) shadows every item, and an unresolved or foreign callee is never designated.
pub(super) fn reject_unsupported_array_like_uses(
    program: &Program,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    // Every name a function binds in its own scope: parameters, pattern bindings (closure parameters
    // included), and nested `fn`, `const`, `static` and `use` items.
    struct LocalNames {
        names: BTreeSet<String>,
    }
    impl<'ast> Visit<'ast> for LocalNames {
        fn visit_item_const(&mut self, item: &'ast syn::ItemConst) {
            self.names.insert(item.ident.to_string());
            syn::visit::visit_item_const(self, item);
        }

        fn visit_item_fn(&mut self, item: &'ast ItemFn) {
            self.names.insert(item.sig.ident.to_string());
            syn::visit::visit_item_fn(self, item);
        }

        fn visit_item_static(&mut self, item: &'ast syn::ItemStatic) {
            self.names.insert(item.ident.to_string());
            syn::visit::visit_item_static(self, item);
        }

        fn visit_pat_ident(&mut self, ident: &'ast syn::PatIdent) {
            self.names.insert(ident.ident.to_string());
            syn::visit::visit_pat_ident(self, ident);
        }

        fn visit_use_name(&mut self, name: &'ast syn::UseName) {
            self.names.insert(name.ident.to_string());
        }

        fn visit_use_rename(&mut self, rename: &'ast syn::UseRename) {
            self.names.insert(rename.rename.to_string());
        }

        fn visit_use_glob(&mut self, _glob: &'ast syn::UseGlob) {
            self.names.insert("*".to_string());
        }
    }
    struct ArrayLikeUses<'a> {
        entities: &'a HashSet<String>,
        error: Option<String>,
        function: String,
        locals: BTreeSet<String>,
        parameter: String,
    }
    impl ArrayLikeUses<'_> {
        fn is_parameter(&self, expression: &Expr) -> bool {
            let expression = match expression {
                Expr::Reference(reference) => reference.expr.as_ref(),
                Expr::Paren(paren) => paren.expr.as_ref(),
                expression => expression,
            };
            let expression = match expression {
                Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => unary.expr.as_ref(),
                expression => expression,
            };
            return matches!(expression, Expr::Path(path) if path.qself.is_none() && path.path.is_ident(&self.parameter));
        }
    }
    impl ArrayLikeUses<'_> {
        // Whether the call's callee resolves, from this source, to a function whose parameter at
        // `position` is `array-like`.
        fn designated(&self, callee: &Expr, position: usize) -> bool {
            let Expr::Path(path) = callee else {
                return false;
            };
            if path.qself.is_some()
                || self.locals.contains("*")
                || path
                    .path
                    .segments
                    .first()
                    .is_some_and(|segment| self.locals.contains(&segment.ident.to_string()))
            {
                return false;
            }
            let Some(current) = current_source(self.entities) else {
                return false;
            };
            let Some((owner, declaration)) =
                resolve_path_owner(self.entities, FUNCTION_OWNER_MARKER, &current, &path.path)
            else {
                return false;
            };
            return self.entities.contains(&format!(
                "{ARRAY_LIKE_ARGUMENT_MARKER}{owner}{PROVENANCE_SEPARATOR}{declaration}{PROVENANCE_SEPARATOR}{position}"
            ));
        }
    }
    impl<'ast> Visit<'ast> for ArrayLikeUses<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            let callee = match call.func.as_ref() {
                Expr::Path(path) if path.qself.is_none() => path
                    .path
                    .segments
                    .iter()
                    .map(|segment| segment.ident.to_string())
                    .collect::<Vec<_>>()
                    .join("::"),
                callee => callee.to_token_stream().to_string(),
            };
            self.visit_expr(&call.func);
            for (index, argument) in call.args.iter().enumerate() {
                if self.is_parameter(argument) {
                    if !self.designated(&call.func, index) && self.error.is_none() {
                        self.error = Some(format!(
                            "`array-like` parameter `{}` of `{}` is passed to `{callee}` argument {index}, which does not resolve to an `array-like` parameter",
                            self.parameter, self.function
                        ));
                    }
                } else {
                    self.visit_expr(argument);
                }
            }
        }

        fn visit_expr_index(&mut self, index: &'ast syn::ExprIndex) {
            if self.is_parameter(&index.expr) && !matches!(index.index.as_ref(), Expr::Range(_)) {
                self.visit_expr(&index.index);
                return;
            }
            syn::visit::visit_expr_index(self, index);
        }

        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            if self.is_parameter(&call.receiver)
                && call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "is_empty" | "len")
            {
                return;
            }
            syn::visit::visit_expr_method_call(self, call);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.qself.is_none() && path.path.is_ident(&self.parameter) && self.error.is_none() {
                self.error = Some(format!(
                    "`array-like` parameter `{}` of `{}` is used in a way `ArrayLike` does not support; only `.len()`, `.is_empty()`, indexing, and passing it to another `array-like` parameter are",
                    self.parameter, self.function
                ));
            }
        }
    }
    for function in &program.functions {
        for argument in &function.sig.inputs {
            let FnArg::Typed(typed) = argument else {
                continue;
            };
            let Pat::Ident(pattern) = typed.pat.as_ref() else {
                continue;
            };
            if !program
                .array_like_parameters
                .contains(&format!("{}.{}", function.sig.ident, pattern.ident))
            {
                continue;
            }
            let mut locals = LocalNames {
                names: BTreeSet::new(),
            };
            for input in &function.sig.inputs {
                locals.visit_fn_arg(input);
            }
            locals.visit_block(&function.block);
            let mut uses = ArrayLikeUses {
                entities,
                error: None,
                function: function.sig.ident.to_string(),
                locals: locals.names,
                parameter: pattern.ident.to_string(),
            };
            uses.visit_block(&function.block);
            if let Some(error) = uses.error {
                return Err(compile_error(error));
            }
        }
    }
    return Ok(());
}
