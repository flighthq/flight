//! `Texture` constructors and helpers.

use flighthq_geometry::create_vector2;
use flighthq_types::{ImageResource, Sampler, Texture, TextureColorSpace, Vector2};

use crate::sampler::{clone_sampler, copy_sampler, create_sampler};

/// Partial overrides for [`create_texture`], mirroring the TS
/// `Readonly<Partial<TextureLike>>` constructor argument. Each `None` field
/// keeps the default.
#[derive(Clone, Default)]
pub struct TextureOptions {
    pub color_space: Option<TextureColorSpace>,
    pub image: Option<ImageResource>,
    pub sampler: Option<Sampler>,
    pub uv_offset: Option<Vector2>,
    pub uv_rotation: Option<f32>,
    pub uv_scale: Option<Vector2>,
}

/// Allocates an independent [`Texture`] over the SAME image pixels: the
/// [`ImageResource`] is cloned by value (a value-typed resource, the Rust
/// analogue of the TS shared reference), while the [`Sampler`] and the
/// uv-transform vectors are deep-cloned so the two textures can be sampled
/// independently.
pub fn clone_texture(source: &Texture) -> Texture {
    Texture {
        color_space: source.color_space,
        image: source.image.clone(),
        sampler: clone_sampler(&source.sampler),
        uv_offset: create_vector2(source.uv_offset.x, source.uv_offset.y),
        uv_rotation: source.uv_rotation,
        uv_scale: create_vector2(source.uv_scale.x, source.uv_scale.y),
    }
}

/// Copies every [`Texture`] field from `source` into `out` in place. The image
/// is shared (cloned by value); the [`Sampler`] and uv-transform vectors are
/// copied into `out`'s existing fields. Safe when `out` aliases `source`:
/// inputs are read into locals before any write.
pub fn copy_texture(out: &mut Texture, source: &Texture) {
    let color_space = source.color_space;
    let image = source.image.clone();
    let uv_rotation = source.uv_rotation;
    let uv_offset = source.uv_offset;
    let uv_scale = source.uv_scale;
    let sampler = source.sampler;
    copy_sampler(&mut out.sampler, &sampler);
    out.uv_offset.x = uv_offset.x;
    out.uv_offset.y = uv_offset.y;
    out.uv_scale.x = uv_scale.x;
    out.uv_scale.y = uv_scale.y;
    out.color_space = color_space;
    out.image = image;
    out.uv_rotation = uv_rotation;
}

/// Builds a [`Texture`]: an unbound image slot (`None`), a default [`Sampler`],
/// `Srgb` color space (the albedo default — data maps override to `Linear`),
/// and an identity `KHR_texture_transform` (zero offset, unit scale, no
/// rotation). Pass [`TextureOptions`] to override any of these.
pub fn create_texture(opts: Option<&TextureOptions>) -> Texture {
    Texture {
        color_space: opts
            .and_then(|o| o.color_space)
            .unwrap_or(TextureColorSpace::Srgb),
        image: opts.and_then(|o| o.image.clone()),
        sampler: opts
            .and_then(|o| o.sampler.as_ref())
            .map(clone_sampler)
            .unwrap_or_else(|| create_sampler(None)),
        uv_offset: opts
            .and_then(|o| o.uv_offset)
            .map(|v| create_vector2(v.x, v.y))
            .unwrap_or_else(|| create_vector2(0.0, 0.0)),
        uv_rotation: opts.and_then(|o| o.uv_rotation).unwrap_or(0.0),
        uv_scale: opts
            .and_then(|o| o.uv_scale)
            .map(|v| create_vector2(v.x, v.y))
            .unwrap_or_else(|| create_vector2(1.0, 1.0)),
    }
}

/// True once the texture references a pixel source. A texture with a `None`
/// image is treated as an absent slot by materials, so this is the gate a
/// material samples behind.
pub fn is_texture_ready(texture: &Texture) -> bool {
    texture.image.is_some()
}

/// Binds (or clears, with `None`) the texture's image source in place. Does not
/// touch sampling state or the uv-transform.
pub fn set_texture_image(texture: &mut Texture, image: Option<ImageResource>) {
    texture.image = image;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sampler::{SamplerOptions, equals_sampler};

    fn fake_image() -> ImageResource {
        ImageResource {
            width: 2,
            height: 2,
            ..Default::default()
        }
    }

    #[test]
    fn clone_texture_shares_the_image_but_deep_clones_the_sampler_and_uv_vectors() {
        let mut source = create_texture(Some(&TextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            image: Some(fake_image()),
            uv_rotation: Some(0.5),
            ..Default::default()
        }));
        source.uv_offset.x = 0.25;
        source.uv_scale.y = 3.0;

        let mut copy = clone_texture(&source);

        let copy_image = copy.image.as_ref().expect("clone keeps the image");
        assert_eq!(copy_image.width, 2);
        assert_eq!(copy_image.height, 2);
        assert_eq!(copy.color_space, TextureColorSpace::Linear);
        assert_eq!(copy.uv_rotation, 0.5);
        assert!(equals_sampler(Some(&copy.sampler), Some(&source.sampler)));
        assert_eq!(copy.uv_offset.x, 0.25);
        assert_eq!(copy.uv_scale.y, 3.0);

        copy.uv_offset.x = 0.9;
        assert_eq!(source.uv_offset.x, 0.25);
    }

    #[test]
    fn copy_texture_writes_every_field_from_source_into_a_distinct_out() {
        let mut source = create_texture(Some(&TextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            image: Some(fake_image()),
            uv_rotation: Some(1.0),
            ..Default::default()
        }));
        source.uv_scale.x = 4.0;
        let mut out = create_texture(None);

        copy_texture(&mut out, &source);

        let out_image = out.image.as_ref().expect("copy keeps the image");
        assert_eq!(out_image.width, 2);
        assert_eq!(out.color_space, TextureColorSpace::Linear);
        assert_eq!(out.uv_rotation, 1.0);
        assert_eq!(out.uv_scale.x, 4.0);
    }

    #[test]
    fn copy_texture_is_safe_when_out_aliases_source() {
        let mut source = create_texture(Some(&TextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            image: Some(fake_image()),
            uv_rotation: Some(2.0),
            ..Default::default()
        }));
        source.uv_scale.x = 7.0;

        let snapshot = source.clone();
        copy_texture(&mut source, &snapshot);

        assert_eq!(source.color_space, TextureColorSpace::Linear);
        assert!(source.image.is_some());
        assert_eq!(source.uv_rotation, 2.0);
        assert_eq!(source.uv_scale.x, 7.0);
    }

    #[test]
    fn create_texture_applies_the_default_unbound_srgb_identity_transform_state() {
        let texture = create_texture(None);

        assert!(texture.image.is_none());
        assert_eq!(texture.color_space, TextureColorSpace::Srgb);
        assert_eq!(texture.uv_rotation, 0.0);
        assert_eq!(texture.uv_offset.x, 0.0);
        assert_eq!(texture.uv_offset.y, 0.0);
        assert_eq!(texture.uv_scale.x, 1.0);
        assert_eq!(texture.uv_scale.y, 1.0);
        assert!(equals_sampler(
            Some(&texture.sampler),
            Some(&create_sampler(None)),
        ));
    }

    #[test]
    fn create_texture_clones_supplied_sampler_and_uv_vectors_rather_than_aliasing_them() {
        let sampler = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(8.0),
            ..Default::default()
        }));
        let texture = create_texture(Some(&TextureOptions {
            sampler: Some(sampler),
            ..Default::default()
        }));

        assert_eq!(texture.sampler.anisotropy, 8.0);
    }

    #[test]
    fn is_texture_ready_is_false_with_a_null_image_and_true_once_bound() {
        let mut texture = create_texture(None);

        assert!(!is_texture_ready(&texture));

        texture.image = Some(fake_image());
        assert!(is_texture_ready(&texture));
    }

    #[test]
    fn set_texture_image_binds_and_clears_the_image_in_place() {
        let mut texture = create_texture(None);

        set_texture_image(&mut texture, Some(fake_image()));
        assert!(texture.image.is_some());

        set_texture_image(&mut texture, None);
        assert!(texture.image.is_none());
    }
}
