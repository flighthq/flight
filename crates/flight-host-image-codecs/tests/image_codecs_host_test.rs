use flight_host_image_codecs::*;
#[cfg(feature = "png")]
use flight_image_codec::ImageDecodeOptions;
#[cfg(any(feature = "jpeg", feature = "png"))]
use flight_image_codec::{DecodedImage, ImageEncodeOptions};

use crate::support::*;

fn assert_send_sync<T: Send + Sync>() {}

mod create_image_codecs_host {
    use super::*;

    #[test]
    fn creates_sendable_host_state_without_initializing_native_state() {
        assert_send_sync::<ImageCodecsHost>();
        let host = create_image_codecs_host(None);
        assert!(!is_image_codecs_host_destroyed(&host));
    }
}

mod create_image_codecs_host_options {
    use super::*;

    #[test]
    fn returns_documented_resource_bounds() {
        assert_send_sync::<ImageCodecsHostOptions>();
        let options = create_image_codecs_host_options();
        assert_eq!(options.max_encoded_bytes, 64 * 1024 * 1024);
        assert_eq!((options.max_width, options.max_height), (16_384, 16_384));
        assert_eq!(options.max_pixels, 64 * 1024 * 1024);
    }
}

mod decode_image_with_image_codecs_host {
    use super::*;

    #[test]
    fn rejects_an_unsupported_mime_type() {
        let host = create_image_codecs_host(None);
        assert!(decode_image_with_image_codecs_host(&host, &[1], "image/webp", None).is_none());
    }

    #[cfg(not(feature = "jpeg"))]
    #[test]
    fn rejects_jpeg_when_the_feature_is_disabled() {
        let host = create_image_codecs_host(None);
        assert!(decode_image_with_image_codecs_host(&host, &[1], "image/jpeg", None).is_none());
    }

    #[cfg(not(feature = "png"))]
    #[test]
    fn rejects_png_when_the_feature_is_disabled() {
        let host = create_image_codecs_host(None);
        assert!(decode_image_with_image_codecs_host(&host, &[1], "image/png", None).is_none());
    }
}

mod destroy_image_codecs_host {
    use super::*;

    #[test]
    fn is_idempotent_and_makes_calls_fail_as_destroyed() {
        let mut host = create_image_codecs_host(None);
        destroy_image_codecs_host(&mut host);
        destroy_image_codecs_host(&mut host);
        assert_reason(
            &explain_image_codecs_host_decode(&host, &[1], "image/unsupported", None),
            ImageCodecsHostOperationExplanationReason::Destroyed,
        );
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &generated_rgba_image(),
                "image/unsupported",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::Destroyed,
        );
    }
}

mod encode_image_with_image_codecs_host {
    use super::*;

    #[test]
    fn rejects_an_unsupported_mime_type() {
        let host = create_image_codecs_host(None);
        assert!(
            encode_image_with_image_codecs_host(
                &host,
                &generated_rgba_image(),
                "image/webp",
                None,
            )
            .is_none()
        );
    }

    #[cfg(not(feature = "jpeg"))]
    #[test]
    fn rejects_jpeg_when_the_feature_is_disabled() {
        let host = create_image_codecs_host(None);
        assert!(
            encode_image_with_image_codecs_host(
                &host,
                &generated_rgba_image(),
                "image/jpeg",
                None,
            )
            .is_none()
        );
    }

    #[cfg(not(feature = "png"))]
    #[test]
    fn rejects_png_when_the_feature_is_disabled() {
        let host = create_image_codecs_host(None);
        assert!(
            encode_image_with_image_codecs_host(&host, &generated_rgba_image(), "image/png", None,)
                .is_none()
        );
    }
}

mod explain_image_codecs_host_decode {
    use super::*;

    #[test]
    fn distinguishes_unsupported_and_unavailable_formats() {
        let host = create_image_codecs_host(None);
        assert_reason(
            &explain_image_codecs_host_decode(&host, &[1], "image/webp", None),
            ImageCodecsHostOperationExplanationReason::UnsupportedMimeType,
        );
        #[cfg(not(feature = "png"))]
        assert_reason(
            &explain_image_codecs_host_decode(&host, &[1], "image/png", None),
            ImageCodecsHostOperationExplanationReason::FormatUnavailable,
        );
    }
}

mod explain_image_codecs_host_encode {
    use super::*;

    #[test]
    fn distinguishes_unsupported_and_unavailable_formats() {
        let host = create_image_codecs_host(None);
        let image = generated_rgba_image();
        assert_reason(
            &explain_image_codecs_host_encode(&host, &image, "image/webp", None),
            ImageCodecsHostOperationExplanationReason::UnsupportedMimeType,
        );
        #[cfg(not(feature = "jpeg"))]
        assert_reason(
            &explain_image_codecs_host_encode(&host, &image, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::FormatUnavailable,
        );
    }
}

mod get_image_codecs_host_decode_capabilities {
    use super::*;

    #[test]
    fn fills_only_enabled_png_and_jpeg_slots() {
        let host = create_image_codecs_host(None);
        let capabilities = get_image_codecs_host_decode_capabilities(&host);
        assert!(capabilities.avif.is_none());
        assert!(capabilities.bmp.is_none());
        assert!(capabilities.gif.is_none());
        assert!(capabilities.webp.is_none());
        assert_eq!(capabilities.jpeg.is_some(), cfg!(feature = "jpeg"));
        assert_eq!(capabilities.png.is_some(), cfg!(feature = "png"));
    }
}

mod get_image_codecs_host_encode_capabilities {
    use super::*;

    #[test]
    fn fills_only_enabled_png_and_jpeg_slots() {
        let host = create_image_codecs_host(None);
        let capabilities = get_image_codecs_host_encode_capabilities(&host);
        assert!(capabilities.webp.is_none());
        assert_eq!(capabilities.jpeg.is_some(), cfg!(feature = "jpeg"));
        assert_eq!(capabilities.png.is_some(), cfg!(feature = "png"));
    }
}

mod is_image_codecs_host_destroyed {
    use super::*;

    #[test]
    fn changes_only_after_destroy() {
        let mut host = create_image_codecs_host(None);
        assert!(!is_image_codecs_host_destroyed(&host));
        destroy_image_codecs_host(&mut host);
        assert!(is_image_codecs_host_destroyed(&host));
    }
}

#[cfg(feature = "jpeg")]
mod jpeg {
    use super::*;

    fn encoded_fixture() -> Box<[u8]> {
        let host = create_image_codecs_host(None);
        return encode_image_with_image_codecs_host(
            &host,
            &generated_jpeg_image(),
            "image/jpeg",
            Some(&ImageEncodeOptions { quality: Some(1.0) }),
        )
        .expect("generated RGBA encodes as JPEG");
    }

    #[test]
    fn round_trip_preserves_dimensions_row_order_and_opaque_rgba_layout() {
        let host = create_image_codecs_host(None);
        let source = generated_jpeg_image();
        let encoded = encoded_fixture();
        assert_eq!(&encoded[..2], b"\xff\xd8");
        let decoded = decode_image_with_image_codecs_host(&host, &encoded, "image/jpeg", None)
            .expect("JPEG decode succeeds");
        assert_eq!(
            (decoded.width, decoded.height),
            (source.width, source.height)
        );
        assert_eq!(decoded.data.len(), source.width * source.height * 4);
        let mut total_error = 0usize;
        for (actual, expected) in decoded
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .zip(source.data.as_chunks::<4>().0)
        {
            assert_eq!(actual[3], 255);
            total_error += actual[..3]
                .iter()
                .map(|channel| channel.abs_diff(expected[0]) as usize)
                .sum::<usize>();
        }
        assert!(
            total_error <= source.width * source.height * 3 * 4,
            "unexpected JPEG channel error: {total_error}"
        );
        assert_reason(
            &explain_image_codecs_host_decode(&host, &encoded, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::Ready,
        );
    }

    #[test]
    fn malformed_and_truncated_inputs_fail_closed() {
        let host = create_image_codecs_host(None);
        let malformed = [0, 1, 2, 3];
        assert!(
            decode_image_with_image_codecs_host(&host, &malformed, "image/jpeg", None).is_none()
        );
        assert_reason(
            &explain_image_codecs_host_decode(&host, &malformed, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::MalformedInput,
        );
        let encoded = encoded_fixture();
        let truncated = &encoded[..encoded.len() / 2];
        assert!(
            decode_image_with_image_codecs_host(&host, truncated, "image/jpeg", None).is_none()
        );
        assert_reason(
            &explain_image_codecs_host_decode(&host, truncated, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::MalformedInput,
        );

        let decode = get_image_codecs_host_decode_capabilities(&host)
            .jpeg
            .as_ref()
            .expect("JPEG decode capability")
            .decode
            .clone();
        let sentinel = block_on((decode)(malformed.to_vec(), None));
        assert_eq!((sentinel.width, sentinel.height), (0, 0));
        assert!(sentinel.data.is_empty());
    }

    #[test]
    fn quality_is_normalized_and_invalid_values_are_explained() {
        let host = create_image_codecs_host(None);
        let image = generated_jpeg_image();
        for quality in [-0.01, 1.01, f32::NAN, f32::INFINITY] {
            let options = ImageEncodeOptions {
                quality: Some(quality),
            };
            assert!(
                encode_image_with_image_codecs_host(&host, &image, "image/jpeg", Some(&options),)
                    .is_none()
            );
            assert_reason(
                &explain_image_codecs_host_encode(&host, &image, "image/jpeg", Some(&options)),
                ImageCodecsHostOperationExplanationReason::InvalidQuality,
            );
        }
        for quality in [0.0, 0.5, 1.0] {
            assert!(
                encode_image_with_image_codecs_host(
                    &host,
                    &image,
                    "image/jpeg",
                    Some(&ImageEncodeOptions {
                        quality: Some(quality),
                    }),
                )
                .is_some()
            );
        }
    }

    #[test]
    fn bad_layouts_and_resource_limits_fail_before_unbounded_work() {
        let host = create_image_codecs_host(None);
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: Vec::new().into_boxed_slice(),
                    height: 0,
                    width: 1,
                },
                "image/jpeg",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::InvalidDimensions,
        );
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: vec![0; 7].into_boxed_slice(),
                    height: 1,
                    width: 2,
                },
                "image/jpeg",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::PixelLengthMismatch,
        );
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: vec![0; 9].into_boxed_slice(),
                    height: 1,
                    width: 2,
                },
                "image/jpeg",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::PixelLengthMismatch,
        );

        let encoded = encoded_fixture();
        let mut options = create_image_codecs_host_options();
        options.max_encoded_bytes = encoded.len() - 1;
        let limited = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_decode(&limited, &encoded, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::InputTooLarge,
        );

        let mut options = create_image_codecs_host_options();
        options.max_height = 7;
        let limited = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_decode(&limited, &encoded, "image/jpeg", None),
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
        );

        let mut options = create_image_codecs_host_options();
        options.max_encoded_bytes = 16;
        let limited = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_encode(
                &limited,
                &generated_jpeg_image(),
                "image/jpeg",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::OutputTooLarge,
        );
    }

    #[cfg(not(feature = "png"))]
    #[test]
    fn retained_jpeg_callbacks_fail_after_destroy_in_jpeg_only_builds() {
        let mut host = create_image_codecs_host(None);
        let decode = get_image_codecs_host_decode_capabilities(&host)
            .jpeg
            .as_ref()
            .expect("JPEG decode capability")
            .decode
            .clone();
        let encode = get_image_codecs_host_encode_capabilities(&host)
            .jpeg
            .as_ref()
            .expect("JPEG encode capability")
            .encode
            .clone();
        let decode_future = (decode)(encoded_fixture().into(), None);
        let encode_future = (encode)(generated_jpeg_image(), None);
        destroy_image_codecs_host(&mut host);
        let decoded = block_on(decode_future);
        assert_eq!((decoded.width, decoded.height), (0, 0));
        assert!(decoded.data.is_empty());
        assert!(block_on(encode_future).is_empty());
    }
}

#[cfg(feature = "png")]
mod png {
    use super::*;

    fn encoded_fixture() -> Box<[u8]> {
        let host = create_image_codecs_host(None);
        return encode_image_with_image_codecs_host(
            &host,
            &generated_rgba_image(),
            "image/png",
            None,
        )
        .expect("generated RGBA encodes as PNG");
    }

    #[test]
    fn lossless_round_trip_preserves_rgba_layout_and_premultiplies_on_request() {
        let host = create_image_codecs_host(None);
        let image = generated_rgba_image();
        let encoded = encode_image_with_image_codecs_host(&host, &image, "image/png", None)
            .expect("PNG encode succeeds");
        assert_eq!(&encoded[..8], b"\x89PNG\r\n\x1a\n");
        let decoded = decode_image_with_image_codecs_host(&host, &encoded, "image/png", None)
            .expect("PNG decode succeeds");
        assert_eq!((decoded.width, decoded.height), (3, 2));
        assert_eq!(decoded.data, image.data);
        assert_reason(
            &explain_image_codecs_host_decode(&host, &encoded, "image/png", None),
            ImageCodecsHostOperationExplanationReason::Ready,
        );

        let premultiplied = decode_image_with_image_codecs_host(
            &host,
            &encoded,
            "image/png",
            Some(&ImageDecodeOptions {
                premultiply_alpha: Some(true),
            }),
        )
        .expect("premultiplied PNG decode succeeds");
        let mut expected = image.data.into_vec();
        for pixel in expected.as_chunks_mut::<4>().0 {
            let alpha = u16::from(pixel[3]);
            for channel in &mut pixel[..3] {
                *channel = ((u16::from(*channel) * alpha + 127) / 255) as u8;
            }
        }
        assert_eq!(premultiplied.data.as_ref(), expected);
    }

    #[test]
    fn malformed_and_truncated_inputs_fail_closed() {
        let host = create_image_codecs_host(None);
        let malformed = [0, 1, 2, 3];
        assert!(
            decode_image_with_image_codecs_host(&host, &malformed, "image/png", None).is_none()
        );
        assert_reason(
            &explain_image_codecs_host_decode(&host, &malformed, "image/png", None),
            ImageCodecsHostOperationExplanationReason::MalformedInput,
        );

        let encoded = encoded_fixture();
        let truncated = &encoded[..encoded.len() / 2];
        assert!(decode_image_with_image_codecs_host(&host, truncated, "image/png", None).is_none());
        assert_reason(
            &explain_image_codecs_host_decode(&host, truncated, "image/png", None),
            ImageCodecsHostOperationExplanationReason::MalformedInput,
        );

        let decode = get_image_codecs_host_decode_capabilities(&host)
            .png
            .as_ref()
            .expect("PNG decode capability")
            .decode
            .clone();
        let sentinel = block_on((decode)(malformed.to_vec(), None));
        assert_eq!((sentinel.width, sentinel.height), (0, 0));
        assert!(sentinel.data.is_empty());
    }

    #[test]
    fn png_ignores_lossy_quality_but_rejects_bad_pixel_layouts() {
        let host = create_image_codecs_host(None);
        let image = generated_rgba_image();
        assert!(
            encode_image_with_image_codecs_host(
                &host,
                &image,
                "image/png",
                Some(&ImageEncodeOptions {
                    quality: Some(f32::NAN),
                }),
            )
            .is_some()
        );
        for invalid in [
            DecodedImage {
                data: Vec::new().into_boxed_slice(),
                height: 1,
                width: 0,
            },
            DecodedImage {
                data: vec![0; 23].into_boxed_slice(),
                height: 2,
                width: 3,
            },
            DecodedImage {
                data: vec![0; 25].into_boxed_slice(),
                height: 2,
                width: 3,
            },
        ] {
            assert!(
                encode_image_with_image_codecs_host(&host, &invalid, "image/png", None).is_none()
            );
        }
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: Vec::new().into_boxed_slice(),
                    height: 1,
                    width: 0,
                },
                "image/png",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::InvalidDimensions,
        );
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: vec![0; 23].into_boxed_slice(),
                    height: 2,
                    width: 3,
                },
                "image/png",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::PixelLengthMismatch,
        );
        assert_reason(
            &explain_image_codecs_host_encode(
                &host,
                &DecodedImage {
                    data: vec![0; 25].into_boxed_slice(),
                    height: 2,
                    width: 3,
                },
                "image/png",
                None,
            ),
            ImageCodecsHostOperationExplanationReason::PixelLengthMismatch,
        );
    }

    #[test]
    fn decode_and_encode_resource_limits_are_enforced() {
        let encoded = encoded_fixture();
        let mut options = create_image_codecs_host_options();
        options.max_encoded_bytes = encoded.len() - 1;
        let host = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_decode(&host, &encoded, "image/png", None),
            ImageCodecsHostOperationExplanationReason::InputTooLarge,
        );

        let mut options = create_image_codecs_host_options();
        options.max_width = 2;
        let host = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_decode(&host, &encoded, "image/png", None),
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
        );

        let mut options = create_image_codecs_host_options();
        options.max_pixels = 5;
        let host = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_decode(&host, &encoded, "image/png", None),
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
        );

        let mut options = create_image_codecs_host_options();
        options.max_encoded_bytes = 8;
        let host = create_image_codecs_host(Some(&options));
        assert_reason(
            &explain_image_codecs_host_encode(&host, &generated_rgba_image(), "image/png", None),
            ImageCodecsHostOperationExplanationReason::OutputTooLarge,
        );
    }

    #[test]
    fn retained_capabilities_are_sendable_lazy_and_destroy_aware() {
        let encoded = encoded_fixture();
        let image = generated_rgba_image();
        let mut host = create_image_codecs_host(None);
        let decode = get_image_codecs_host_decode_capabilities(&host)
            .png
            .as_ref()
            .expect("PNG decode capability")
            .decode
            .clone();
        let encode = get_image_codecs_host_encode_capabilities(&host)
            .png
            .as_ref()
            .expect("PNG encode capability")
            .encode
            .clone();

        let thread_decode = decode.clone();
        let thread_encoded = encoded.clone();
        let decoded =
            std::thread::spawn(move || block_on((thread_decode)(thread_encoded.into(), None)))
                .join()
                .expect("capability can run on another thread");
        assert_eq!((decoded.width, decoded.height), (3, 2));

        let decode_future = (decode)(encoded.into(), None);
        let encode_future = (encode)(image, None);
        destroy_image_codecs_host(&mut host);
        let decoded = block_on(decode_future);
        let encoded = block_on(encode_future);
        assert_eq!((decoded.width, decoded.height), (0, 0));
        assert!(decoded.data.is_empty());
        assert!(encoded.is_empty());
    }

    #[test]
    fn retained_capability_fails_closed_after_host_drop() {
        let decode = {
            let host = create_image_codecs_host(None);
            get_image_codecs_host_decode_capabilities(&host)
                .png
                .as_ref()
                .expect("PNG decode capability")
                .decode
                .clone()
        };
        let decoded = block_on((decode)(encoded_fixture().into(), None));
        assert_eq!((decoded.width, decoded.height), (0, 0));
        assert!(decoded.data.is_empty());
    }
}
