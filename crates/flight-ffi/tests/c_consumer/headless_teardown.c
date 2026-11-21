/* Strict C coverage for render objects that outlive their headless host: a pass open on a
 * non-empty scene when the host is destroyed, and render states whose draws race the destroy on
 * other threads. Every call must return, every state must tear down and free, and the sanitizers
 * check that nothing is used after it is freed or leaked. */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>

#include "flight_ffi.h"

#define CHECK(condition)                                                                          \
  do {                                                                                            \
    if (!(condition)) {                                                                           \
      fprintf(stderr, "check failed at line %d: %s\n", __LINE__, #condition);                    \
      return 1;                                                                                   \
    }                                                                                             \
  } while (0)

static const char *const SCENE_SVG =
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"><rect x=\"1\" y=\"1\" "
    "width=\"5\" height=\"5\" fill=\"#00ff00\"/></svg>";

/* A render state over `device` with the 2D preset, and a filled SVG rectangle prepared on it: the
 * shape renderer uploads GPU buffers for it on every draw. */
struct scene {
  void *state;
  void *proxies;
  FlightNode *root;
};

static bool create_scene(void *device, struct scene *out) {
  out->state = flight_create_wgpu_render_state(device, NULL);
  out->proxies = NULL;
  out->root = NULL;
  if (out->state == NULL) {
    return false;
  }
  flight_register_wgpu_standard_material(out->state);
  flight_register_standard_wgpu_texture_resolvers(out->state);
  flight_register_wgpu_scene2d_render_preset(out->state);
  out->proxies = flight_create_wgpu_scene_2d_render_proxies();
  out->root = flight_create_display_object();
  FlightNode *shapes = flight_create_scene2d_from_svg_document(SCENE_SVG, NULL, NULL);
  flight_free_node(flight_add_node_child(out->root, shapes));
  flight_free_node(shapes);
  return flight_prepare_wgpu_scene_2d_render(out->state, out->proxies, out->root);
}

static void free_scene(struct scene *scene) {
  if (scene->state != NULL) {
    flight_destroy_wgpu_render_state(scene->state, scene->proxies);
    flight_destroy_wgpu_render_state(scene->state, scene->proxies);
    flight_free_wgpu_scene_2d_render_proxies(scene->proxies);
    flight_free_wgpu_render_state(scene->state);
  }
  flight_free_node(scene->root);
}

/* The host is destroyed under an open pass on a non-empty scene: the pass still draws, ends and
 * submits, because the device and the target it holds stay alive until it lets them go. */
static int check_open_pass_across_destroy(void) {
  FlightHeadlessHost *host = flight_create_headless_host(NULL);
  CHECK(host != NULL);
  void *device = flight_get_headless_host_wgpu_device(host);
  void *target = flight_create_headless_host_render_target(host, 8, 8);
  struct scene scene;
  CHECK(create_scene(device, &scene));
  FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(scene.state, target, NULL);
  CHECK(pass != NULL);
  flight_destroy_headless_host(host);
  CHECK(flight_is_headless_host_destroyed(host));
  CHECK(flight_render_wgpu_scene2d(pass, scene.proxies, scene.root, NULL));
  CHECK(flight_end_wgpu_render_pass(pass));
  flight_free_wgpu_render_pass_handle(pass);
  flight_submit_wgpu_frame(scene.state);
  CHECK(flight_begin_wgpu_render_pass(scene.state, target, NULL) == NULL);
  CHECK(flight_create_bitmap_from_headless_screen_render_target(target, 100) == NULL);
  free_scene(&scene);
  return 0;
}

struct race {
  void *device;
  void *target;
  int drawn;
  int refused;
};

static void *draw_while_the_host_dies(void *argument) {
  struct race *race = argument;
  for (int i = 0; i < 6; ++i) {
    struct scene scene;
    if (!create_scene(race->device, &scene)) {
      __atomic_add_fetch(&race->refused, 1, __ATOMIC_SEQ_CST);
      free_scene(&scene);
      continue;
    }
    FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(scene.state, race->target, NULL);
    if (pass != NULL) {
      bool drawn = flight_render_wgpu_scene2d(pass, scene.proxies, scene.root, NULL);
      drawn = flight_end_wgpu_render_pass(pass) && drawn;
      flight_free_wgpu_render_pass_handle(pass);
      flight_submit_wgpu_frame(scene.state);
      if (drawn) {
        __atomic_add_fetch(&race->drawn, 1, __ATOMIC_SEQ_CST);
      }
    }
    free_scene(&scene);
  }
  return NULL;
}

/* Render states draw on three threads while the host is destroyed at a varying moment, round
 * after round: every draw either completes or is refused, and every state tears down. */
static int check_draws_racing_destroy(int rounds, int *drawn, int *refused) {
  for (int round = 0; round < rounds; ++round) {
    FlightHeadlessHost *host = flight_create_headless_host(NULL);
    CHECK(host != NULL);
    struct race race = {flight_get_headless_host_wgpu_device(host),
                        flight_create_headless_host_render_target(host, 8, 8), 0, 0};
    pthread_t threads[3];
    for (int t = 0; t < 3; ++t) {
      CHECK(pthread_create(&threads[t], NULL, draw_while_the_host_dies, &race) == 0);
    }
    struct timespec pause = {0, (long)(round % 5) * 2000000L};
    nanosleep(&pause, NULL);
    flight_destroy_headless_host(host);
    for (int t = 0; t < 3; ++t) {
      CHECK(pthread_join(threads[t], NULL) == 0);
    }
    *drawn += race.drawn;
    *refused += race.refused;
  }
  return 0;
}

int main(void) {
  FlightHeadlessHost *probe = flight_create_headless_host(NULL);
  if (probe == NULL) {
    printf("flight-ffi headless teardown: skipped (no adapter)\n");
    return 0;
  }
  flight_destroy_headless_host(probe);
  if (check_open_pass_across_destroy() != 0) {
    return 1;
  }
  int drawn = 0;
  int refused = 0;
  if (check_draws_racing_destroy(20, &drawn, &refused) != 0) {
    return 1;
  }
  CHECK(drawn + refused > 0);
  printf("flight-ffi headless teardown: ok\n");
  return 0;
}
