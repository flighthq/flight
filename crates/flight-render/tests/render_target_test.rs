use flight_geometry::{create_matrix, create_rectangle, multiply_matrix};
use flight_node::get_node_local_matrix;
use flight_render::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::display_node;

fn descriptor(width: f32, height: f32) -> RenderTargetDescriptor {
    return RenderTargetDescriptor {
        width,
        height,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
}

mod compute_render_cache_transform {
    use super::*;

    #[test]
    fn compute_render_cache_transform_uses_bounds_origin() {
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_render_cache_transform(
            &mut out,
            &create_rectangle(10.0, 20.0, 100.0, 80.0),
            None,
            None,
        );
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (1.0, 0.0, 0.0, 1.0, 10.0, 20.0)
        );
    }

    #[test]
    fn compute_render_cache_transform_subtracts_content_origin() {
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_render_cache_transform(
            &mut out,
            &create_rectangle(10.0, 20.0, 100.0, 80.0),
            Some(3.0),
            Some(7.0),
        );
        assert_eq!((out.tx, out.ty), (7.0, 13.0));
    }
}

mod compute_render_target_size {
    use super::*;

    #[test]
    fn compute_render_target_size_writes_rounded_bounds() {
        let mut out = crate::support::test_default::<RenderTargetSize>();
        let result = compute_render_target_size(
            &mut out,
            &create_rectangle(0.0, 0.0, 100.4, 80.6),
            None,
            None,
            None,
        );
        assert_eq!((result.width, result.height), (101.0, 81.0));
    }

    #[test]
    fn compute_render_target_size_adds_uniform_padding() {
        let mut out = crate::support::test_default::<RenderTargetSize>();
        compute_render_target_size(
            &mut out,
            &create_rectangle(0.0, 0.0, 100.0, 80.0),
            Some(RenderTargetPadding::Uniform(4.0)),
            None,
            None,
        );
        assert_eq!((out.width, out.height), (108.0, 88.0));
    }

    #[test]
    fn compute_render_target_size_adds_directional_padding() {
        let mut out = crate::support::test_default::<RenderTargetSize>();
        compute_render_target_size(
            &mut out,
            &create_rectangle(-3.0, 4.0, 100.0, 80.0),
            Some(RenderTargetPadding::Edges(EffectPadding {
                bottom: 7.0,
                left: 2.0,
                right: 5.0,
                top: 3.0,
            })),
            None,
            None,
        );
        assert_eq!((out.width, out.height), (107.0, 90.0));
    }

    #[test]
    fn compute_render_target_size_respects_minimums() {
        let mut out = crate::support::test_default::<RenderTargetSize>();
        compute_render_target_size(
            &mut out,
            &create_rectangle(0.0, 0.0, 0.0, 0.0),
            Some(RenderTargetPadding::Uniform(0.0)),
            Some(32.0),
            Some(16.0),
        );
        assert_eq!((out.width, out.height), (32.0, 16.0));
    }

    #[test]
    fn compute_render_target_size_defaults_to_one() {
        let mut out = crate::support::test_default::<RenderTargetSize>();
        compute_render_target_size(
            &mut out,
            &create_rectangle(0.0, 0.0, 0.0, 0.0),
            None,
            None,
            None,
        );
        assert_eq!((out.width, out.height), (1.0, 1.0));
    }
}

mod compute_scene_2d_render_target_transform {
    use super::*;

    #[test]
    fn scene2d_target_transform_is_numeric_at_origin() {
        let source = display_node();
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_scene_2d_render_target_transform(
            &mut out,
            &source,
            &create_rectangle(0.0, 0.0, 100.0, 80.0),
            None,
            None,
        );
        assert!(out.a.is_finite() && out.tx.is_finite());
    }

    #[test]
    fn scene2d_target_transform_offsets_content_origin() {
        let source = display_node();
        let bounds = create_rectangle(10.0, 20.0, 100.0, 80.0);
        let mut first = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut second = first.clone();
        compute_scene_2d_render_target_transform(
            &mut first,
            &source,
            &bounds,
            Some(0.0),
            Some(0.0),
        );
        compute_scene_2d_render_target_transform(
            &mut second,
            &source,
            &bounds,
            Some(5.0),
            Some(10.0),
        );
        assert_ne!(second.tx, first.tx);
    }

    #[test]
    fn scene2d_target_transform_cancels_detached_root_transform() {
        let typed = flight_scene2d::create_display_object();
        {
            let mut source = typed.write().unwrap();
            source.x = 50.0;
            source.y = 30.0;
            source.rotation = 31.0;
            source.scale_x = 2.0;
            source.scale_y = 0.5;
        }
        let source: flight_node::NodeRef = typed;
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_scene_2d_render_target_transform(
            &mut out,
            &source,
            &create_rectangle(-12.0, -7.0, 100.0, 80.0),
            Some(9.0),
            Some(4.0),
        );
        let mut composed = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        multiply_matrix(&mut composed, &out, &get_node_local_matrix(&source));
        assert!((composed.a - 1.0).abs() < 1e-5);
        assert!(composed.b.abs() < 1e-5);
        assert!(composed.c.abs() < 1e-5);
        assert!((composed.d - 1.0).abs() < 1e-5);
        assert!((composed.tx - 21.0).abs() < 1e-4);
        assert!((composed.ty - 11.0).abs() < 1e-4);
    }
}

mod explain_render_target_axes {
    use super::*;

    #[test]
    fn explain_render_target_axes_reports_changes_in_stable_order() {
        let requested = resolve_render_target_descriptor(&RenderTargetDescriptor {
            format: Some(RenderTargetFormat::Rgba16F),
            color_attachments: Some(2.0),
            sample_count: Some(8.0),
            depth: Some(RenderTargetDepth::DepthStencilSampled),
            ..descriptor(64.0, 48.0)
        });
        let effective = RenderTargetAxes {
            format: RenderTargetFormat::Rgba8,
            color_formats: vec![RenderTargetFormat::Rgba8; 2],
            sample_count: 4,
            depth: RenderTargetDepth::DepthStencil,
            ..requested.clone()
        };
        let differences = explain_render_target_axes(&requested, &effective);
        assert_eq!(differences.len(), 4);
        assert_eq!(differences[0].axis, RenderTargetAxis::Format);
        assert_eq!(differences[1].axis, RenderTargetAxis::ColorFormats);
        assert_eq!(differences[2].axis, RenderTargetAxis::SampleCount);
        assert_eq!(differences[3].axis, RenderTargetAxis::Depth);
    }

    #[test]
    fn explain_render_target_axes_returns_empty_for_equal_axes() {
        let axes = resolve_render_target_descriptor(&descriptor(64.0, 48.0));
        assert!(explain_render_target_axes(&axes, &axes.clone()).is_empty());
    }
}

mod resolve_render_target_descriptor {
    use super::*;

    #[test]
    fn resolve_render_target_descriptor_defaults_every_axis() {
        assert_eq!(
            resolve_render_target_descriptor(&descriptor(64.0, 48.0)),
            RenderTargetAxes {
                width: 64,
                height: 48,
                format: RenderTargetFormat::Rgba8,
                color_attachments: 1,
                color_formats: vec![RenderTargetFormat::Rgba8],
                sample_count: 1,
                depth: RenderTargetDepth::None,
                color_space: RenderTargetColorSpace::Srgb,
            }
        );
    }

    #[test]
    fn resolve_render_target_descriptor_normalizes_counts_once() {
        let axes = resolve_render_target_descriptor(&RenderTargetDescriptor {
            color_attachments: Some(1.2),
            sample_count: Some(3.1),
            ..descriptor(10.2, 0.0)
        });
        assert_eq!(
            (
                axes.width,
                axes.height,
                axes.color_attachments,
                axes.sample_count
            ),
            (11, 1, 2, 4)
        );
    }

    #[test]
    fn resolve_render_target_descriptor_expands_heterogeneous_formats() {
        let axes = resolve_render_target_descriptor(&RenderTargetDescriptor {
            format: Some(RenderTargetFormat::Rgba16F),
            color_attachments: Some(3.0),
            color_formats: Some(vec![RenderTargetFormat::Rgba8, RenderTargetFormat::Rgba32F]),
            ..descriptor(64.0, 48.0)
        });
        assert_eq!(axes.format, RenderTargetFormat::Rgba8);
        assert_eq!(
            axes.color_formats,
            vec![
                RenderTargetFormat::Rgba8,
                RenderTargetFormat::Rgba32F,
                RenderTargetFormat::Rgba16F
            ]
        );
    }

    #[test]
    fn resolve_render_target_descriptor_copies_color_formats() {
        let formats = vec![RenderTargetFormat::Rgba8, RenderTargetFormat::Rgba16F];
        let axes = resolve_render_target_descriptor(&RenderTargetDescriptor {
            color_attachments: Some(2.0),
            color_formats: Some(formats.clone()),
            ..descriptor(64.0, 48.0)
        });
        drop(formats);
        assert_eq!(
            axes.color_formats,
            vec![RenderTargetFormat::Rgba8, RenderTargetFormat::Rgba16F]
        );
    }
}
