//! `Texture` constructors and helpers.

use flighthq_geometry::create_vector2;
use flighthq_types::{ImageResource, Matrix3, Sampler, Texture, TextureColorSpace, Vector2};

use crate::equals_image_binding;
use crate::sampler::{clone_sampler, copy_sampler, create_sampler, equals_sampler};

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

/// True when both textures describe identical state: same color space, same
/// sampler state, the same image binding, and the same uv-transform values.
/// Returns false for absent (`None`) operands so callers can compare nullable
/// references directly.
pub fn equals_texture(a: Option<&Texture>, b: Option<&Texture>) -> bool {
    let (a, b) = match (a, b) {
        (Some(a), Some(b)) => (a, b),
        _ => return false,
    };
    a.color_space == b.color_space
        && equals_image_binding(&a.image, &b.image)
        && a.uv_rotation == b.uv_rotation
        && a.uv_offset.x == b.uv_offset.x
        && a.uv_offset.y == b.uv_offset.y
        && a.uv_scale.x == b.uv_scale.x
        && a.uv_scale.y == b.uv_scale.y
        && equals_sampler(Some(&a.sampler), Some(&b.sampler))
}

/// Returns the pixel height of the texture's bound image, or `-1` when no image
/// is bound.
pub fn get_texture_height(texture: &Texture) -> i64 {
    match &texture.image {
        Some(image) => image.height as i64,
        None => -1,
    }
}

/// Composes the `KHR_texture_transform` fields (`uv_offset`, `uv_rotation`,
/// `uv_scale`) into the 3×3 matrix a shader consumes at sample time. Row-major
/// layout matching `flighthq-geometry` [`Matrix3`]. The transform applies
/// scale → rotate → translate, per the `KHR_texture_transform` spec:
/// row 0 = `[sx*cos(r), -sy*sin(r), tx]`; row 1 = `[sx*sin(r), sy*cos(r), ty]`;
/// row 2 = `[0, 0, 1]`. Out-param form — writes into a pre-allocated matrix to
/// avoid per-call allocation.
pub fn get_texture_uv_matrix(out: &mut Matrix3, texture: &Texture) {
    let r = texture.uv_rotation;
    let sx = texture.uv_scale.x;
    let sy = texture.uv_scale.y;
    let tx = texture.uv_offset.x;
    let ty = texture.uv_offset.y;
    let cos_r = r.cos();
    let sin_r = r.sin();
    out.m[0] = sx * cos_r;
    out.m[1] = -sy * sin_r;
    out.m[2] = tx;
    out.m[3] = sx * sin_r;
    out.m[4] = sy * cos_r;
    out.m[5] = ty;
    out.m[6] = 0.0;
    out.m[7] = 0.0;
    out.m[8] = 1.0;
}

/// Returns the pixel width of the texture's bound image, or `-1` when no image
/// is bound.
pub fn get_texture_width(texture: &Texture) -> i64 {
    match &texture.image {
        Some(image) => image.width as i64,
        None => -1,
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

/// Sets the uv offset (scroll/translation) in place. Equivalent to assigning
/// `texture.uv_offset` directly but provides a named mutator for the
/// `KHR_texture_transform` model.
pub fn set_texture_uv_offset(texture: &mut Texture, x: f32, y: f32) {
    texture.uv_offset.x = x;
    texture.uv_offset.y = y;
}

/// Sets the uv rotation in radians in place.
pub fn set_texture_uv_rotation(texture: &mut Texture, radians: f32) {
    texture.uv_rotation = radians;
}

/// Sets the uv scale (tiling) in place.
pub fn set_texture_uv_scale(texture: &mut Texture, x: f32, y: f32) {
    texture.uv_scale.x = x;
    texture.uv_scale.y = y;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sampler::{SamplerOptions, equals_sampler};
    use flighthq_geometry::create_matrix3_identity;

    fn fake_image() -> ImageResource {
        ImageResource {
            width: 32,
            height: 64,
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
        assert_eq!(copy_image.width, 32);
        assert_eq!(copy_image.height, 64);
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
        assert_eq!(out_image.width, 32);
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
    fn equals_texture_is_true_for_identical_state_and_same_image() {
        let a = create_texture(Some(&TextureOptions {
            image: Some(fake_image()),
            color_space: Some(TextureColorSpace::Linear),
            ..Default::default()
        }));
        let b = create_texture(Some(&TextureOptions {
            image: Some(fake_image()),
            color_space: Some(TextureColorSpace::Linear),
            ..Default::default()
        }));

        assert!(equals_texture(Some(&a), Some(&b)));
        assert!(equals_texture(Some(&a), Some(&a)));
    }

    #[test]
    fn equals_texture_is_false_when_the_image_differs() {
        let other = ImageResource {
            width: 4,
            height: 4,
            ..Default::default()
        };
        let a = create_texture(Some(&TextureOptions {
            image: Some(fake_image()),
            ..Default::default()
        }));
        let b = create_texture(Some(&TextureOptions {
            image: Some(other),
            ..Default::default()
        }));

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_when_color_space_differs() {
        let a = create_texture(Some(&TextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            ..Default::default()
        }));
        let b = create_texture(Some(&TextureOptions {
            color_space: Some(TextureColorSpace::Srgb),
            ..Default::default()
        }));

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_when_uv_rotation_differs() {
        let a = create_texture(Some(&TextureOptions {
            uv_rotation: Some(0.5),
            ..Default::default()
        }));
        let b = create_texture(Some(&TextureOptions {
            uv_rotation: Some(0.0),
            ..Default::default()
        }));

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_when_uv_offset_differs() {
        let a = create_texture(None);
        let mut b = create_texture(None);
        b.uv_offset.x = 0.5;

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_when_uv_scale_differs() {
        let a = create_texture(None);
        let mut b = create_texture(None);
        b.uv_scale.y = 2.0;

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_when_the_sampler_differs() {
        let a = create_texture(None);
        let b = create_texture(Some(&TextureOptions {
            sampler: Some(create_sampler(Some(&SamplerOptions {
                mipmaps: Some(false),
                ..Default::default()
            }))),
            ..Default::default()
        }));

        assert!(!equals_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_texture_is_false_for_absent_operands() {
        let a = create_texture(None);

        assert!(!equals_texture(Some(&a), None));
        assert!(!equals_texture(None, Some(&a)));
        assert!(!equals_texture(None, None));
    }

    #[test]
    fn get_texture_height_returns_image_height_or_minus_one() {
        let bound = create_texture(Some(&TextureOptions {
            image: Some(fake_image()),
            ..Default::default()
        }));
        assert_eq!(get_texture_height(&bound), 64);

        let unbound = create_texture(None);
        assert_eq!(get_texture_height(&unbound), -1);
    }

    #[test]
    fn get_texture_uv_matrix_produces_identity_for_default_transform() {
        let texture = create_texture(None);
        let mut out = create_matrix3_identity();

        get_texture_uv_matrix(&mut out, &texture);

        // Row-major identity = [1,0,0; 0,1,0; 0,0,1]
        assert!((out.m[0] - 1.0).abs() < 1e-6);
        assert!(out.m[1].abs() < 1e-6);
        assert!(out.m[2].abs() < 1e-6);
        assert!(out.m[3].abs() < 1e-6);
        assert!((out.m[4] - 1.0).abs() < 1e-6);
        assert!(out.m[5].abs() < 1e-6);
        assert!(out.m[6].abs() < 1e-6);
        assert!(out.m[7].abs() < 1e-6);
        assert!((out.m[8] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn get_texture_uv_matrix_encodes_offset_in_translation_column() {
        let mut texture = create_texture(None);
        set_texture_uv_offset(&mut texture, 0.25, 0.75);
        let mut out = create_matrix3_identity();

        get_texture_uv_matrix(&mut out, &texture);

        assert!((out.m[2] - 0.25).abs() < 1e-6);
        assert!((out.m[5] - 0.75).abs() < 1e-6);
    }

    #[test]
    fn get_texture_uv_matrix_encodes_scale_in_diagonal() {
        let mut texture = create_texture(None);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        let mut out = create_matrix3_identity();

        get_texture_uv_matrix(&mut out, &texture);

        assert!((out.m[0] - 2.0).abs() < 1e-6);
        assert!((out.m[4] - 3.0).abs() < 1e-6);
    }

    #[test]
    fn get_texture_uv_matrix_matches_khr_formula_for_rotated_scaled_offset() {
        let r = std::f32::consts::FRAC_PI_4;
        let mut texture = create_texture(Some(&TextureOptions {
            uv_rotation: Some(r),
            ..Default::default()
        }));
        set_texture_uv_scale(&mut texture, 2.0, 2.0);
        set_texture_uv_offset(&mut texture, 0.1, 0.2);
        let mut out = create_matrix3_identity();

        get_texture_uv_matrix(&mut out, &texture);

        let cos_r = r.cos();
        let sin_r = r.sin();
        assert!((out.m[0] - 2.0 * cos_r).abs() < 1e-6);
        assert!((out.m[1] - (-2.0 * sin_r)).abs() < 1e-6);
        assert!((out.m[2] - 0.1).abs() < 1e-6);
        assert!((out.m[3] - 2.0 * sin_r).abs() < 1e-6);
        assert!((out.m[4] - 2.0 * cos_r).abs() < 1e-6);
        assert!((out.m[5] - 0.2).abs() < 1e-6);
    }

    #[test]
    fn get_texture_width_returns_image_width_or_minus_one() {
        let bound = create_texture(Some(&TextureOptions {
            image: Some(fake_image()),
            ..Default::default()
        }));
        assert_eq!(get_texture_width(&bound), 32);

        let unbound = create_texture(None);
        assert_eq!(get_texture_width(&unbound), -1);
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

    #[test]
    fn set_texture_uv_offset_updates_the_uv_offset_in_place() {
        let mut texture = create_texture(None);

        set_texture_uv_offset(&mut texture, 0.3, 0.7);

        assert!((texture.uv_offset.x - 0.3).abs() < 1e-6);
        assert!((texture.uv_offset.y - 0.7).abs() < 1e-6);
    }

    #[test]
    fn set_texture_uv_rotation_updates_uv_rotation_in_place() {
        let mut texture = create_texture(None);

        set_texture_uv_rotation(&mut texture, std::f32::consts::PI);

        assert!((texture.uv_rotation - std::f32::consts::PI).abs() < 1e-6);
    }

    #[test]
    fn set_texture_uv_scale_updates_the_uv_scale_in_place() {
        let mut texture = create_texture(None);

        set_texture_uv_scale(&mut texture, 4.0, 8.0);

        assert!((texture.uv_scale.x - 4.0).abs() < 1e-6);
        assert!((texture.uv_scale.y - 8.0).abs() < 1e-6);
    }
}
