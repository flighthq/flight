/* Live C coverage for the borrow-erased WGPU pass bracket. Production C has no producer for a
 * render state or render target; both come from the host seam that acquires a device. The
 * `stand-in-wgpu-host` build supplies them on wgpu's noop backend, which records commands but does
 * not rasterize, and runs the same sequence natively as the reference. This program builds a scene
 * through the generated externs, registers its render policy, prepares, begins, draws, ends,
 * submits, derives an offscreen state and destroys it through them, and compares the state after
 * each render step with the native reference. It also drives the guarded state wrappers and
 * released, repeated and foreign handles under the sanitizers. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "flight_ffi.h"

typedef struct FlightStandInWgpuRenderReport {
  uint32_t pass_depth;
  bool encoder_open;
  bool render_pass_open;
  bool target_bound;
  uint64_t encoder_serial;
  uint32_t uniform_offset;
  uint32_t quad_batch_count;
  uint64_t uniform_hash;
  uint32_t shape_mesh_pipeline_count;
  uint32_t proxy_count;
  uint64_t proxy_hash;
} FlightStandInWgpuRenderReport;

void *flight_stand_in_create_wgpu_render_state(void);
void *flight_stand_in_create_wgpu_texture_target(const void *state, double width, double height);
void flight_stand_in_destroy_wgpu_render_state(void *state);
void flight_stand_in_destroy_wgpu_render_target(void *target);
bool flight_stand_in_report_wgpu_render_state(const void *state, const void *proxies,
                                              FlightStandInWgpuRenderReport *out);
FlightNode *flight_stand_in_create_solid_shape(uint32_t color, double x, double y, double width,
                                              double height);
bool flight_stand_in_run_wgpu_reference_sequence(const FlightNode *source, double width,
                                                 double height,
                                                 FlightStandInWgpuRenderReport *reports);

static int check(int ok, const char *what) {
  if (!ok) {
    printf("flight-ffi render pass live: FAILED %s\n", what);
  }
  return ok;
}

static void print_report(const char *label, const FlightStandInWgpuRenderReport *report) {
  printf("  %s: depth %u encoder %d pass %d target %d serial %llu offset %u quads %u hash %llu "
         "pipelines %u proxies %u proxy hash %llu\n",
         label, report->pass_depth, report->encoder_open, report->render_pass_open,
         report->target_bound, (unsigned long long)report->encoder_serial, report->uniform_offset,
         report->quad_batch_count, (unsigned long long)report->uniform_hash,
         report->shape_mesh_pipeline_count, report->proxy_count,
         (unsigned long long)report->proxy_hash);
}

static int matches(const void *state, const void *proxies,
                   const FlightStandInWgpuRenderReport *expected, const char *step) {
  FlightStandInWgpuRenderReport live;
  memset(&live, 0, sizeof live);
  if (!check(flight_stand_in_report_wgpu_render_state(state, proxies, &live), step)) {
    return 0;
  }
  if (live.pass_depth == expected->pass_depth && live.encoder_open == expected->encoder_open &&
      live.render_pass_open == expected->render_pass_open &&
      live.target_bound == expected->target_bound &&
      live.encoder_serial == expected->encoder_serial &&
      live.uniform_offset == expected->uniform_offset &&
      live.quad_batch_count == expected->quad_batch_count &&
      live.uniform_hash == expected->uniform_hash &&
      live.shape_mesh_pipeline_count == expected->shape_mesh_pipeline_count &&
      live.proxy_count == expected->proxy_count && live.proxy_hash == expected->proxy_hash) {
    return 1;
  }
  printf("flight-ffi render pass live: FAILED %s differs from the native reference\n", step);
  print_report("live", &live);
  print_report("reference", expected);
  return 0;
}

int main(void) {
  const double size = 16.0;
  FlightNode *root = flight_create_display_object();
  FlightNode *sprite = flight_create_sprite();
  FlightNode *shape = flight_stand_in_create_solid_shape(0x00cc00ffu, 1.0, 2.0, 6.0, 5.0);
  FlightNode *batch = flight_create_quad_batch();
  int ok = check(root != NULL && sprite != NULL && shape != NULL && batch != NULL, "scene nodes");
  ok &= check(flight_set_node2d_x(sprite, 12.0), "sprite x");
  ok &= check(flight_set_node2d_scale_x(sprite, 2.0), "sprite scale");
  ok &= check(flight_set_node2d_x(shape, -3.0), "shape x");
  ok &= check(flight_set_node2d_rotation(shape, 30.0), "shape rotation");
  FlightNode *added[3] = {
      flight_add_node_child(root, sprite),
      flight_add_node_child(root, shape),
      flight_add_node_child(sprite, batch),
  };
  ok &= check(added[0] != NULL && added[1] != NULL && added[2] != NULL, "scene tree");

  FlightStandInWgpuRenderReport reference[3];
  memset(reference, 0, sizeof reference);
  ok &= check(flight_stand_in_run_wgpu_reference_sequence(root, size, size, reference),
              "native reference sequence");
  ok &= check(reference[0].pass_depth == 1 && reference[0].encoder_open &&
                  reference[2].pass_depth == 0 && !reference[2].encoder_open,
              "reference opens then ends and submits one pass");
  ok &= check(reference[1].shape_mesh_pipeline_count > reference[0].shape_mesh_pipeline_count &&
                  reference[1].proxy_count == 4,
              "reference draw reaches the shape renderer for every proxy the comparison observes");

  void *state = flight_stand_in_create_wgpu_render_state();
  void *target = flight_stand_in_create_wgpu_texture_target(state, size, size);
  void *proxies = flight_create_wgpu_scene_2d_render_proxies();
  ok &= check(state != NULL && target != NULL && proxies != NULL, "stand-in carriers");
  flight_register_wgpu_standard_material(state);
  flight_register_standard_wgpu_texture_resolvers(state);
  flight_register_wgpu_scene2d_render_preset(state);
  ok &= check(flight_prepare_wgpu_scene_2d_render(state, proxies, root), "prepare");

  FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(state, target, NULL);
  ok &= check(pass != NULL, "begin");
  ok &= matches(state, proxies, &reference[0], "after begin");
  ok &= check(flight_begin_wgpu_render_pass(state, target, NULL) == NULL, "second begin refused");
  ok &= check(!flight_prepare_wgpu_scene_2d_render(state, proxies, root),
              "prepare refused while the pass borrows the state");
  flight_destroy_wgpu_scene_2d_render(state, proxies);

  ok &= check(flight_render_wgpu_scene2d(pass, proxies, root, NULL), "draw");
  ok &= matches(state, proxies, &reference[1], "after draw");
  ok &= check(flight_end_wgpu_render_pass(pass), "end");
  flight_submit_wgpu_frame(state);
  ok &= matches(state, proxies, &reference[2], "after end and submit");

  ok &= check(!flight_end_wgpu_render_pass(pass), "second end refused");
  ok &= check(!flight_render_wgpu_scene2d(pass, proxies, root, NULL), "draw after end refused");
  flight_free_wgpu_render_pass_handle(pass);
  flight_free_wgpu_render_pass_handle(pass);
  FlightWgpuRenderPassHandle *foreign = (FlightWgpuRenderPassHandle *)root;
  ok &= check(!flight_render_wgpu_scene2d(pass, proxies, root, NULL), "draw after free refused");
  ok &= check(!flight_end_wgpu_render_pass(foreign), "foreign end refused");
  ok &= check(!flight_render_wgpu_scene2d(foreign, proxies, root, NULL), "foreign draw refused");
  flight_free_wgpu_render_pass_handle(foreign);

  FlightWgpuRenderPassHandle *next = flight_begin_wgpu_render_pass(state, target, NULL);
  ok &= check(next != NULL && next != pass, "second frame begins with a new handle");
  ok &= check(!flight_end_wgpu_render_pass(pass), "released handle cannot end the new pass");
  ok &= check(flight_render_wgpu_scene2d(next, proxies, root, NULL), "second frame draw");
  FlightStandInWgpuRenderReport second;
  memset(&second, 0, sizeof second);
  ok &= check(flight_stand_in_report_wgpu_render_state(state, proxies, &second) && second.pass_depth == 1 &&
                  second.encoder_serial == reference[2].encoder_serial + 1,
              "second frame opens one more encoder");
  flight_free_wgpu_render_pass_handle(next);
  ok &= check(flight_stand_in_report_wgpu_render_state(state, proxies, &second) && second.pass_depth == 0 &&
                  !second.encoder_open,
              "free ends and submits the open second frame");

  void *offscreen = flight_create_wgpu_offscreen_render_state(state);
  ok &= check(offscreen != NULL, "offscreen render-state path");
  flight_free_wgpu_offscreen_render_state_result(offscreen);
  flight_destroy_wgpu_render_state(state, proxies);
  flight_free_wgpu_scene_2d_render_proxies(proxies);
  flight_stand_in_destroy_wgpu_render_target(target);
  flight_stand_in_destroy_wgpu_render_state(state);
  for (int index = 0; index < 3; index += 1) {
    flight_free_node(added[index]);
  }
  flight_free_node(batch);
  flight_free_node(shape);
  flight_free_node(sprite);
#ifndef FLIGHT_FFI_DELIBERATE_LEAK
  flight_free_node(root);
#endif

  if (!ok) {
    return 1;
  }
  printf("flight-ffi render pass live: ok\n");
  return 0;
}
