// Registry tokens: the one encoding every non-dereferenced C handle flight-ffi issues. A token is a
// sequence number drawn once from one process-wide counter, shifted above an odd tag naming its
// family. Sequence numbers are never reissued, whatever the family, so no two live or past handles
// share a value; the tag lets every consumer refuse a handle of another family before it looks the
// token up. When the sequence is exhausted no token is minted and the producer fails closed.

/// One family of registry tokens: the handles a registry issues and accepts.
pub struct TokenFamily {
    /// What the tokens name, for messages and the audit.
    pub name: &'static str,
    /// The generated constant holding the family's tag.
    pub tag_const: &'static str,
    /// The family's tag: odd, so a token is never an aligned address, and below 2^TAG_BITS.
    pub tag: usize,
}

/// The bits below the sequence number that hold the family tag.
pub const TAG_BITS: u32 = 8;

/// Every token family flight-ffi issues. A new registry adds its family here, and the build and the
/// pairwise audit keep every tag distinct.
pub const TOKEN_FAMILIES: &[TokenFamily] = &[
    TokenFamily {
        name: "render pass handle",
        tag_const: "FFI_RENDER_PASS_TOKEN_TAG",
        tag: 1,
    },
    TokenFamily {
        name: "headless host handle",
        tag_const: "FFI_HEADLESS_HOST_TOKEN_TAG",
        tag: 3,
    },
    TokenFamily {
        name: "headless host lent device",
        tag_const: "FFI_HEADLESS_DEVICE_TOKEN_TAG",
        tag: 5,
    },
    TokenFamily {
        name: "headless host lent wgpu capability",
        tag_const: "FFI_HEADLESS_CAPABILITY_TOKEN_TAG",
        tag: 7,
    },
    TokenFamily {
        name: "headless host lent surface",
        tag_const: "FFI_HEADLESS_SURFACE_TOKEN_TAG",
        tag: 9,
    },
    TokenFamily {
        name: "headless host lent render target",
        tag_const: "FFI_HEADLESS_RENDER_TARGET_TOKEN_TAG",
        tag: 11,
    },
];

/// Fails when two families share a tag or a tag is even or does not fit below the sequence.
pub fn check_token_families(families: &[TokenFamily]) -> Result<(), String> {
    let mut seen = std::collections::BTreeMap::new();
    for family in families {
        if family.tag % 2 == 0 || family.tag >= 1 << TAG_BITS {
            return Err(format!(
                "{} tag {} must be odd and below {}",
                family.name,
                family.tag,
                1usize << TAG_BITS
            ));
        }
        if let Some(other) = seen.insert(family.tag, family.name) {
            return Err(format!(
                "{} and {other} share token tag {}",
                family.name, family.tag
            ));
        }
    }
    return Ok(());
}

/// The constant declaring `name`'s tag in generated code.
pub fn family_tag_const(name: &str) -> String {
    let family = TOKEN_FAMILIES
        .iter()
        .find(|family| family.tag_const == name)
        .unwrap_or_else(|| panic!("no token family {name}"));
    return format!(
        "// The {} token family.\nconst {}: usize = {};\n",
        family.name, family.tag_const, family.tag
    );
}

/// The sequence, minting and family check every registry shares, with the render pass family.
pub fn generate_registry_token_support() -> String {
    check_token_families(TOKEN_FAMILIES).unwrap_or_else(|error| panic!("{error}"));
    return format!("{SUPPORT}{}", family_tag_const("FFI_RENDER_PASS_TOKEN_TAG"));
}

const SUPPORT: &str = r#"// Registry tokens: every non-dereferenced C handle is a sequence number drawn once from one
// process-wide counter, shifted above an odd family tag. Sequence numbers are never reissued across
// families, and every consumer checks the tag before it looks a token up.
const FFI_REGISTRY_TOKEN_TAG_BITS: u32 = 8;
static FFI_REGISTRY_TOKEN_SEQUENCE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
// The token for `sequence` in the family `tag`, or None when the sequence no longer fits above the
// tag bits.
fn ffi_compose_registry_token(sequence: usize, tag: usize) -> Option<usize> {
    if sequence == 0 || sequence > usize::MAX >> FFI_REGISTRY_TOKEN_TAG_BITS {
        return None;
    }
    return Some(sequence << FFI_REGISTRY_TOKEN_TAG_BITS | tag);
}
// Draws the next sequence number and composes a token of the family `tag`. The counter never wraps:
// once exhausted it stays exhausted, and every later mint returns None.
fn ffi_mint_registry_token(tag: usize) -> Option<usize> {
    if ffi_is_registry_token_sequence_exhausted_for_test() {
        return None;
    }
    let mut current = FFI_REGISTRY_TOKEN_SEQUENCE.load(std::sync::atomic::Ordering::SeqCst);
    let sequence = loop {
        let next = current.checked_add(1)?;
        match FFI_REGISTRY_TOKEN_SEQUENCE.compare_exchange_weak(current, next, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst) {
            Ok(_) => break next,
            Err(actual) => current = actual,
        }
    };
    return ffi_compose_registry_token(sequence, tag);
}
// Whether `token` is a token of the family `tag`; nothing else is ever looked up in its registry.
fn ffi_is_registry_token(token: usize, tag: usize) -> bool {
    return token & ((1 << FFI_REGISTRY_TOKEN_TAG_BITS) - 1) == tag && token >> FFI_REGISTRY_TOKEN_TAG_BITS != 0;
}
// Whether `value` has the shape of a registry token of any family. Tags are odd, so no aligned
// address ever does: a consumer that accepts both owned carriers and registry tokens tells them
// apart by this alone, and resolves the token or refuses it.
#[allow(dead_code)]
fn ffi_is_registry_token_shaped(value: usize) -> bool {
    return value & 1 == 1;
}
#[cfg(test)]
std::thread_local! {
    static FFI_REGISTRY_TOKEN_SEQUENCE_EXHAUSTED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}
// Lets a test make this thread's next mints fail as an exhausted sequence would, without touching
// the process-wide counter other tests draw from.
#[cfg(test)]
fn set_registry_token_sequence_exhausted_for_test(exhausted: bool) {
    FFI_REGISTRY_TOKEN_SEQUENCE_EXHAUSTED.with(|flag| flag.set(exhausted));
}
#[cfg(test)]
fn ffi_is_registry_token_sequence_exhausted_for_test() -> bool {
    return FFI_REGISTRY_TOKEN_SEQUENCE_EXHAUSTED.with(|flag| flag.get());
}
#[cfg(not(test))]
fn ffi_is_registry_token_sequence_exhausted_for_test() -> bool {
    return false;
}
"#;
