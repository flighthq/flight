//! Clip field group initialization (TS `hasClip.ts`).

use flight_clip::ClipRegion;
use flight_entity::Ref;

use crate::types::*;

/// Options for `init_clip_trait` (TS `Partial<HasClip>`).
#[derive(Clone, Debug, Default)]
pub struct HasClipOptions {
    pub clip: Option<Ref<ClipRegion>>,
}

/// Applies the clip default and any supplied clip (TS `initClipTrait`). The supplied region's
/// shared identity is retained, as the source stores the object reference.
pub fn init_clip_trait(target: &mut HasClip, obj: Option<&HasClipOptions>) {
    target.clip = obj.and_then(|obj| obj.clip.clone());
}
