const ACCENT = "#c1121f";
const DIM = "#5a5a5a";
const TEXT = "#e8e8e8";
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export class ProfilerHUD {
  constructor({ width = 268, height = 186, parent = document.body } = {}) {
    this.w = width;
    this.h = height;
    this.dpr = Math.min(window.devicePixelRatio, 2);

    const c = document.createElement("canvas");
    c.width = width * this.dpr;
    c.height = height * this.dpr;
    Object.assign(c.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      width: `${width}px`,
      height: `${height}px`,
      zIndex: "9999",
      pointerEvents: "none",
    });
    parent.appendChild(c);

    this.canvas = c;
    this.ctx = c.getContext("2d");
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.textBaseline = "top";
  }

  _row(y, label, value, warn = false) {
    const ctx = this.ctx;
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(label, 12, y);
    ctx.fillStyle = warn ? ACCENT : TEXT;
    ctx.textAlign = "right";
    ctx.fillText(value, this.w - 12, y);
    ctx.textAlign = "left";
  }

  update(p, stageLabel = "") {
    const ctx = this.ctx;
    const { w, h } = this;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6,6,8,0.86)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(193,18,31,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText("NERV // FRAME DIAGNOSTIC", 12, 10);
    ctx.fillStyle = DIM;
    ctx.textAlign = "right";
    ctx.fillText(stageLabel, w - 12, 10);
    ctx.textAlign = "left";

    // frame-time graph
    const gx = 12,
      gy = 26,
      gw = w - 24,
      gh = 46;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(gx, gy, gw, gh);

    let peak = 33.4;
    for (let i = 0; i < p.filled; i++) peak = Math.max(peak, p.frames[i]);

    const n = p.frames.length;
    const bw = gw / n;
    for (let i = 0; i < p.filled; i++) {
      const v = p.frames[(p.cursor + i) % n];
      const bh = Math.min(1, v / peak) * gh;
      ctx.fillStyle = v > 16.9 ? ACCENT : "rgba(232,232,232,0.55)";
      ctx.fillRect(gx + i * bw, gy + gh - bh, Math.max(1, bw - 0.5), bh);
    }

    // 16.7ms budget line
    const y60 = gy + gh - (16.7 / peak) * gh;
    ctx.strokeStyle = "rgba(193,18,31,0.45)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(gx, y60);
    ctx.lineTo(gx + gw, y60);
    ctx.stroke();
    ctx.setLineDash([]);

    // readouts
    let y = gy + gh + 10;
    const step = 13;
    this._row(
      y,
      "FRAME",
      `${p.frameMs.toFixed(2)} ms  ${p.fps.toFixed(0)} fps`,
      p.frameMs > 17,
    );
    this._row((y += step), "CPU SUBMIT", `${p.cpuMs.toFixed(2)} ms`);
    this._row(
      (y += step),
      "GPU",
      p.gpuMs < 0 ? "n/a" : `${p.gpuMs.toFixed(2)} ms`,
    );
    this._row((y += step), "DRAW CALLS", String(p.calls), p.calls > 200);
    this._row((y += step), "TRIANGLES", p.tris.toLocaleString());
    this._row((y += step), "PROGRAMS", String(p.programs));
    this._row((y += step), "GEO / TEX", `${p.geometries} / ${p.textures}`);

    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText(p.verdict, 12, h - 14);
  }
}
