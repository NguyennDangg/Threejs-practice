// Horizontal spans on a shared time axis, plus a ledger that accumulates
// across runs. The ledger is the real deliverable - one run tells you
// nothing, three side by side tell you everything

const COLORS = {
  download: "#c1121f",
  parse: "#e8e8e8",
  compile: "#7a86ff",
};

export class LoadTimeline {
  constructor(parent = document.body) {
    const el = document.createElement("div");
    el.innerHTML = `
      <style>
        .tl { position: fixed; top: 16px; left: 16px; z-index: 9998;
          font: 12px "JetBrains Mono", ui-monospace, monospace;
          background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
          padding: 10px 12px; color: #e8e8e8; width: 420px; }
        .tl h5 { color: #c1121f; font-weight: normal; letter-spacing: .1em;
          margin-bottom: 8px; }
        .tl .r { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .tl .lbl { color: #5a5a5a; width: 92px; flex: none; }
        .tl .track { position: relative; height: 10px; flex: 1;
          background: rgba(255,255,255,.04); }
        .tl .bar { position: absolute; top: 0; height: 10px; min-width: 2px; }
        .tl .mark { position: absolute; top: -2px; width: 1px; height: 14px;
          background: #7dffb0; }
        .tl .ms { color: #5a5a5a; width: 64px; flex: none; text-align: right; }
        .tl .sec { border-top: 1px solid rgba(255,255,255,.1);
          padding-top: 8px; margin-top: 8px; }
        .tl .stat { color: #5a5a5a; line-height: 1.7; }
        .tl .stat b { color: #e8e8e8; font-weight: normal; float: right; }
        .tl table { width: 100%; border-collapse: collapse; color: #5a5a5a; }
        .tl th { text-align: right; font-weight: normal; color: #3f3f3f;
          padding-bottom: 4px; }
        .tl th:first-child, .tl td:first-child { text-align: left; }
        .tl td { text-align: right; color: #e8e8e8; padding: 1px 0; }
      </style>
      <div class="tl">
        <h5>LOAD TIMELINE</h5>
        <div data-rows></div>
        <div class="sec stat" data-stat></div>
        <div class="sec"><table data-ledger></table></div>
      </div>`;
    parent.appendChild(el);
    this.rows = el.querySelector("[data-rows]");
    this.stat = el.querySelector("[data-stat]");
    this.ledger = el.querySelector("[data-ledger]");
  }

  // spans: [{ label, start, end, kind }]   marks: [{ label, at }]
  render(spans, marks, statLines) {
    const span = Math.max(
      1,
      ...spans.map((s) => s.end),
      ...marks.map((m) => m.at),
    );
    this.rows.innerHTML = "";

    for (const s of spans) {
      const row = document.createElement("div");
      row.className = "r";
      row.innerHTML = `
        <div class="lbl">${s.label}</div>
        <div class="track"><div class="bar"></div></div>
        <div class="ms">${(s.end - s.start).toFixed(0)} ms</div>`;
      const bar = row.querySelector(".bar");
      bar.style.left = `${(s.start / span) * 100}%`;
      bar.style.width = `${((s.end - s.start) / span) * 100}%`;
      bar.style.background = COLORS[s.kind] ?? "#5a5a5a";
      this.rows.appendChild(row);
    }

    for (const m of marks) {
      const row = document.createElement("div");
      row.className = "r";
      row.innerHTML = `
        <div class="lbl" style="color:#7dffb0">${m.label}</div>
        <div class="track"><div class="mark"></div></div>
        <div class="ms">${m.at.toFixed(0)} ms</div>`;
      row.querySelector(".mark").style.left = `${(m.at / span) * 100}%`;
      this.rows.appendChild(row);
    }

    this.stat.innerHTML = statLines
      .map(([k, v]) => `<div>${k} <b>${v}</b></div>`)
      .join("");
  }

  renderLedger(rows) {
    if (!rows.length) {
      this.ledger.innerHTML = "";
      return;
    }
    this.ledger.innerHTML =
      `<tr><th>MODEL</th><th>CAP</th><th>WIRE</th><th>VRAM</th><th>TRIS</th></tr>` +
      rows
        .map(
          (r) =>
            `<tr><td>${r.key}</td><td>${r.cap}</td><td>${r.wire}</td>` +
            `<td>${r.vram}</td><td>${r.tris}</td></tr>`,
        )
        .join("");
  }
}
