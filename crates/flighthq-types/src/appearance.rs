use crate::blend::BlendMode;

bitflags::bitflags! {
    /// Flags indicating which appearance properties are set or changed on a node.
    #[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
    pub struct AppearanceFlags: u32 {
        const NONE       = 0;
        const VISIBLE    = 1 << 0;
        const ALPHA      = 1 << 1;
        const BLEND_MODE = 1 << 2;
        const CLIP       = 1 << 3;
        const SCALE9GRID = 1 << 4;
        const ANY        = 1 << 31;
    }
}

impl AppearanceFlags {
    /// Returns true if any of the `test` flags are set.
    #[inline]
    pub fn any(self, test: AppearanceFlags) -> bool {
        self.intersects(test)
    }

    /// Returns true if all of the `test` flags are set.
    #[inline]
    pub fn has(self, test: AppearanceFlags) -> bool {
        self.contains(test)
    }

    /// Returns `self` with `add` flags set.
    #[inline]
    pub fn add(self, add: AppearanceFlags) -> AppearanceFlags {
        self | add
    }

    /// Returns `self` with `remove` flags cleared.
    #[inline]
    pub fn remove_flags(self, remove: AppearanceFlags) -> AppearanceFlags {
        self & !remove
    }

    /// Returns empty flags.
    #[inline]
    pub fn clear() -> AppearanceFlags {
        AppearanceFlags::NONE
    }
}

/// Appearance properties shared by all visible nodes.
pub trait HasAppearance {
    fn alpha(&self) -> f32;
    fn blend_mode(&self) -> Option<BlendMode>;
    fn is_visible(&self) -> bool;
}
