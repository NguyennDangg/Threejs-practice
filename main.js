import gsap from "gsap";
import { initBackground } from "./background.js";

function typewriter(el, text, duration = 1.6, delay = 0) {
  let shown = 0;
  return gsap.to(
    // <-- return the tween
    { i: 0 },
    {
      i: text.length,
      duration,
      delay,
      ease: "none",
      onUpdate: function () {
        const i = Math.floor(this.targets()[0].i);
        if (i !== shown) {
          el.textContent = text.slice(0, i);
          shown = i;
        }
      },
    },
  );
}

function cycleScenarios(el, lines) {
  let idx = 0;
  function run() {
    const line = lines[idx % lines.length];
    const tl = gsap.timeline({
      onComplete: () => {
        // hold, then erase, then next
        gsap.to(
          { i: line.length },
          {
            i: 0,
            duration: 0.5,
            delay: 2.4,
            ease: "none",
            onUpdate: function () {
              el.textContent = line.slice(0, Math.floor(this.targets()[0].i));
            },
            onComplete: () => {
              idx++;
              run();
            },
          },
        );
      },
    });
    tl.add(typewriter(el, line, Math.max(0.9, line.length * 0.045)));
  }
  run();
}

function startClock() {
  const footer = document.querySelector(".status-line");

  function tick() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, ".");
    const time = now.toTimeString().slice(0, 8);

    // Append or update the timestamp span
    let stamp = footer.querySelector(".timestamp");
    if (!stamp) {
      stamp = document.createElement("span");
      stamp.className = "timestamp";
      footer.appendChild(stamp);
    }
    stamp.textContent = ` \u00a0//\u00a0 ${date} — ${time}`;
  }

  tick();
  setInterval(tick, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  initBackground();
  startClock();
  const tl = gsap.timeline();

  tl.from(".eva-tag", { opacity: 0, y: -10, duration: 0.5, ease: "power2.out" })
    .from(
      "header h1",
      { opacity: 0, y: 14, duration: 0.6, ease: "power2.out" },
      "-=0.25",
    )
    .from(
      ".subtitle",
      { opacity: 0, y: 10, duration: 0.5, ease: "power2.out" },
      "-=0.3",
    )
    .from(".readout", { opacity: 0, duration: 0.4 }, "-=0.2")
    .from(
      ".reference-pill",
      { opacity: 0, y: 8, duration: 0.45, ease: "power2.out" },
      "-=0.15",
    )
    .from(
      ".project-card",
      {
        opacity: 0,
        y: 20,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
      },
      "-=0.1",
    )
    .from(".status-line", { opacity: 0, duration: 0.5 }, "-=0.2")
    .call(
      () => {
        const el = document.getElementById("scenario-text");
        cycleScenarios(el, [
          "scenario complete. feelings irrelevant.",
          "magi system synchronized. awaiting input.",
          "pattern blue. no anomalies detected.",
          "sync ratio nominal. proceed at will.",
        ]);
      },
      [],
      tl.duration(),
    );
});
