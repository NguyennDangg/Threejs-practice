import * as THREE from "three";

// One TIME_ELAPSED query may be active at a time, and results arrive
// several frames late - so I pool queries and drain them as they land
function createGpuTimer(gl) {
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext) return null;

  const pool = [];
  const pending = [];
  let active = null;

  return {
    begin() {
      if (active) return;
      active = pool.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (!active) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    },
    poll() {
      let ms;
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        // GPU_DISJOINT means the GPU was interrupted - the timing is garbage
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        }
        pool.push(q);
      }
      return ms;
    },
  };
}

export class Profiler {
  constructor(renderer, { smoothing = 0.12, history = 120 } = {}) {
    this.renderer = renderer;
    this.k = smoothing;

    // Critical: without this, info resets on every render() call, so a
    // multi-pass frame only reports the last pass
    renderer.info.autoReset = false;

    this.frames = new Float32Array(history);
    this.cursor = 0;
    this.filled = 0;

    this.frameMs = 16.7; // wall clock between frames
    this.cpuMs = 0; // time spent submitting - not time spent rendering
    this.gpuMs = -1; // -1 = unsupported
    this.fps = 60;

    this.calls = 0;
    this.tris = 0;
    this.programs = 0;
    this.geometries = 0;
    this.textures = 0;

    this.verdict = "PROBE IDLE";

    this._start = performance.now();
    this._last = this._start;
    this._t0 = 0;
    this._gpu = createGpuTimer(renderer.getContext());
    this._probe = null;
  }

  // Seconds since construction - handy if you'd rather not keep a
  // separate startTime in your scene file - Updated in begin()
  get elapsed() {
    return (this._last - this._start) / 1000;
  }

  begin() {
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;

    // Ignore tab-switch and first-frame spikes
    if (dt < 500) {
      this.frameMs += (dt - this.frameMs) * (1 - Math.exp(-this.k));
      this.frames[this.cursor] = dt;
      this.cursor = (this.cursor + 1) % this.frames.length;
      if (this.filled < this.frames.length) this.filled++;
      this._tickProbe(dt);
    }
    this.fps = 1000 / this.frameMs;

    this.renderer.info.reset();
    this._gpu?.begin();
    this._t0 = performance.now();
  }

  end() {
    const cpu = performance.now() - this._t0;
    this.cpuMs += (cpu - this.cpuMs) * (1 - Math.exp(-this.k));

    this._gpu?.end();
    const g = this._gpu?.poll();
    if (g !== undefined) {
      this.gpuMs =
        this.gpuMs < 0
          ? g
          : this.gpuMs + (g - this.gpuMs) * (1 - Math.exp(-this.k));
    }

    const info = this.renderer.info;
    this.calls = info.render.calls;
    this.tris = info.render.triangles;
    this.programs = info.programs ? info.programs.length : 0;
    this.geometries = info.memory.geometries;
    this.textures = info.memory.textures;
  }

  // Halve the pixel ratio for ~half a second and compare. If frame time
  // drops, the cost scales with pixel count -> fragment-bound
  probe() {
    if (this._probe) return;
    this._probe = {
      phase: "full",
      frames: 0,
      sum: 0,
      n: 0,
      full: 0,
      dpr: this.renderer.getPixelRatio(),
    };
    this.verdict = "PROBING…";
  }

  _tickProbe(dt) {
    const p = this._probe;
    if (!p) return;

    p.frames++;
    if (p.frames > 10) {
      p.sum += dt;
      p.n++;
    } // 10 warm-up frames
    if (p.frames < 45) return;

    const avg = p.sum / p.n;

    if (p.phase === "full") {
      p.full = avg;
      p.phase = "half";
      p.frames = 0;
      p.sum = 0;
      p.n = 0;
      this.renderer.setPixelRatio(p.dpr * 0.5);
      // If add EffectComposer later, mirror this: composer.setPixelRatio(...)
      return;
    }

    this.renderer.setPixelRatio(p.dpr);
    const gain = (p.full - avg) / p.full;

    if (p.full < 17.5) {
      this.verdict = "VSYNC-CAPPED / NO SIGNAL";
    } else if (gain > 0.25) {
      this.verdict = `FRAGMENT-BOUND  ${(gain * 100) | 0}%`;
    } else {
      this.verdict = `CPU OR VERTEX-BOUND  ${(gain * 100) | 0}%`;
    }
    this._probe = null;
  }
}
