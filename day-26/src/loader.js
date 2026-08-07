const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

export class LoaderOverlay {
  constructor(parent = document.body) {
    const el = document.createElement("div");
    el.innerHTML = `
      <style>
        .ld { position: fixed; inset: 0; z-index: 10000; display: flex;
          align-items: center; justify-content: center; background: #08080c;
          font: 15px "JetBrains Mono", ui-monospace, monospace; color: #e8e8e8;
          transition: opacity .45s; }
        .ld.gone { opacity: 0; pointer-events: none; }
        .ld .box { width: 400px; }
        .ld .top { display: flex; justify-content: space-between;
          margin-bottom: 10px; letter-spacing: .1em; }
        .ld .top b { color: #c1121f; font-weight: normal; }
        .ld .top span { color: #5a5a5a; }
        .ld .track { height: 2px; background: rgba(255,255,255,.1); }
        .ld .bar { height: 2px; width: 0; background: #c1121f;
          transition: width .1s linear; }
        .ld .bot { display: flex; justify-content: space-between;
          color: #5a5a5a; margin-top: 8px; }
        .ld .bot .note.err { color: #c1121f; }
      </style>
      <div class="ld">
        <div class="box">
          <div class="top"><b data-name>—</b><span data-pct>0%</span></div>
          <div class="track"><div class="bar" data-bar></div></div>
          <div class="bot">
            <span data-bytes>—</span>
            <span class="note" data-note>INCOMING</span>
          </div>
        </div>
      </div>`;
    parent.appendChild(el);
    this.root = el.querySelector(".ld");
    this.name = el.querySelector("[data-name]");
    this.pct = el.querySelector("[data-pct]");
    this.bar = el.querySelector("[data-bar]");
    this.bytes = el.querySelector("[data-bytes]");
    this.note = el.querySelector("[data-note]");
  }

  show(name) {
    this.root.classList.remove("gone");
    this.name.textContent = name;
    this.pct.textContent = "0%";
    this.bar.style.width = "0%";
    this.bytes.textContent = "—";
    this.note.classList.remove("err");
    this.note.textContent = "INCOMING";
  }

  progress(loaded, total) {
    this.bytes.textContent = total
      ? `${mb(loaded)} / ${mb(total)}`
      : mb(loaded);
    if (!total) return;
    const p = Math.min(1, loaded / total);
    this.pct.textContent = `${Math.round(p * 100)}%`;
    this.bar.style.width = `${p * 100}%`;
  }

  // Parse and compile happen after the last byte lands, without this the
  // bar sits at 100% looking frozen for half a second
  stage(label) {
    this.note.classList.remove("err");
    this.note.textContent = label;
  }

  fail(message) {
    this.note.classList.add("err");
    this.note.textContent = message;
  }

  hide() {
    this.root.classList.add("gone");
  }
}
