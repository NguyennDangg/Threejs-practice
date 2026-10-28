// A scroll driver is two things pretending to be one:
// 1. Reading raw scroll (fast, jittery, device-dependent)
// 2. Producing smooth progress (what the scene actually consumes)

// Lenis interpolates between them with exp(-k·dt), the same easing every
// other system in this project uses. That is not a coincidence — it is
// the only easing that is stable at any framerate.

import Lenis from "lenis";

export class ScrollStage {
  constructor({ lerp = 0.1, wheelMultiplier = 1 } = {}) {
    this.lenis = new Lenis({
      // duration-based and lerp-based are alternatives; lerp is what we want
      // because it is framerate independent by construction.
      lerp,
      wheelMultiplier,
      smoothWheel: true,
      // Never let a wheel burst skip a scene beat.
      syncTouch: false,
    });

    this.progress = 0; // smoothed, 0..1, what the scene reads
    this.rawProgress = 0; // what the browser actually reports
    this.velocity = 0; // px/frame, useful for shake or skew later
    this._listeners = new Set();
    this._raf = null;

    this.lenis.on("scroll", ({ progress, velocity }) => {
      this.rawProgress = progress ?? 0;
      this.velocity = velocity ?? 0;
    });

    const loop = (time) => {
      this.lenis.raf(time);

      // Lenis already smooths scrollTop, but progress itself can still
      // step if content height changes. Re-read it and re-smooth.
      const target = this.rawProgress;
      this.progress += (target - this.progress) * 0.15;

      if (Math.abs(target - this.progress) < 0.00001) {
        this.progress = target;
      }

      for (const fn of this._listeners) fn(this.progress);

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  onProgress(fn) {
    this._listeners.add(fn);
    fn(this.progress); // fire immediately so stage 0 renders correctly
    return () => this._listeners.delete(fn);
  }

  scrollTo(target, opts = {}) {
    this.lenis.scrollTo(target, { duration: 1.4, ...opts });
  }

  stop() {
    this.lenis.stop();
  }
  start() {
    this.lenis.start();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._listeners.clear();
    this.lenis.destroy();
  }
}
