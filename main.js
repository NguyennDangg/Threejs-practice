import gsap from "gsap";
import { initBackground } from "./background.js";

function typewriter(el, text, duration = 1.6, delay = 0) {
  let shown = 0;
  gsap.to(
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

document.addEventListener("DOMContentLoaded", () => {
  initBackground();
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
    .call(() => {
      typewriter(
        document.getElementById("scenario-text"),
        "scenario complete. feelings irrelevant.",
        1.4,
      );
    });
});
