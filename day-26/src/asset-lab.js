// Loading instrumented by hand. GLTFLoader.load() hides the split between
// "bytes arriving" and "bytes becoming a scene graph" — and that split is
// the subject of this log. So: fetch ourselves, time the download, then
// hand the buffer to loader.parse().

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader();
// Free if the file isn't meshopt-compressed, and means compressed files
// just work if you ever get a build pipeline running.
loader.setMeshoptDecoder(MeshoptDecoder);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reads the response as a stream and paces the chunks. A network throttle
// you control in-page, without opening DevTools.
export async function fetchThrottled(url, bytesPerSec, onProgress) {
  // no-store matters: without it the second run hits the browser cache,
  // reports a 3ms download, and every comparison becomes meaningless.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} — ${url}`);

  // Vite serves index.html for unknown paths, so a missing model arrives
  // as HTML and fails later with a confusing JSON parse error.
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) {
    throw new Error(`Got HTML, not a model — ${url} is a 404`);
  }

  // With gzip on this is the COMPRESSED size. GLB is mostly incompressible
  // binary, so the two are close, but not identical.
  const total = Number(res.headers.get("content-length")) || 0;

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  const start = performance.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;

    if (bytesPerSec > 0) {
      const shouldHaveTaken = (loaded / bytesPerSec) * 1000;
      const actuallyTook = performance.now() - start;
      if (shouldHaveTaken > actuallyTook)
        await sleep(shouldHaveTaken - actuallyTook);
    }
    onProgress?.(loaded, total);
  }

  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf.buffer;
}

export function parseGLB(arrayBuffer) {
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, "", resolve, reject);
  });
}

export async function loadModel(url, bytesPerSec, onProgress) {
  const t0 = performance.now();
  const buf = await fetchThrottled(url, bytesPerSec, onProgress);
  const t1 = performance.now();
  const gltf = await parseGLB(buf);
  const t2 = performance.now();

  return {
    scene: gltf.scene,
    bytes: buf.byteLength,
    downloadMs: t1 - t0,
    parseMs: t2 - t1,
  };
}

// ---------------------------------------------------------------------
function collectTextures(root) {
  const texs = new Set();
  root.traverse((o) => {
    if (!o.material) return;
    for (const mat of [].concat(o.material)) {
      for (const key in mat) {
        const v = mat[key];
        if (v && v.isTexture) texs.add(v);
      }
    }
  });
  return texs;
}

// Redraw each texture smaller and swap the image in place. The original
// is stashed on userData so FULL restores without re-downloading.
// This changes VRAM only — the bytes already came over the wire at full
// resolution. A real pipeline does this at build time.
export function capTextures(root, maxSize) {
  let changed = 0;
  for (const t of collectTextures(root)) {
    const original = t.userData.__original ?? t.image;
    if (!original?.width) continue;
    t.userData.__original = original;

    const scale = Math.min(
      1,
      maxSize / Math.max(original.width, original.height),
    );
    const w = Math.max(1, Math.round(original.width * scale));
    const h = Math.max(1, Math.round(original.height * scale));
    if (t.image?.width === w && t.image?.height === h) continue;

    if (scale === 1) {
      t.image = original;
    } else {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      // Canvas 2D resampling isn't colour-managed the way a proper mip
      // chain is. Fine for a demo, not how you'd ship it.
      c.getContext("2d").drawImage(original, 0, 0, w, h);
      t.image = c;
    }
    t.needsUpdate = true; // forces re-upload at the new size
    changed++;
  }
  return changed;
}

// ---------------------------------------------------------------------
// An ESTIMATE. Assumes 8-bit RGBA in VRAM, which is what PNG and JPEG
// become once uploaded — file size on disk is irrelevant here. KTX2/Basis
// textures stay compressed and would be 4-8x less; this doesn't model that.
export function estimateVram(root) {
  const geos = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
  });
  const texs = collectTextures(root);

  let geoBytes = 0;
  let tris = 0;
  for (const g of geos) {
    for (const name in g.attributes)
      geoBytes += g.attributes[name].array.byteLength;
    if (g.index) {
      geoBytes += g.index.array.byteLength;
      tris += g.index.count / 3;
    } else if (g.attributes.position) {
      tris += g.attributes.position.count / 3;
    }
  }

  let texBytes = 0;
  const sizes = [];
  for (const t of texs) {
    const img = t.image;
    if (!img?.width) continue;
    let b = img.width * img.height * 4;
    if (t.generateMipmaps) b *= 4 / 3; // the full mip chain adds ~33%
    texBytes += b;
    sizes.push({ w: img.width, h: img.height });
  }

  return {
    geoBytes,
    texBytes,
    geoCount: geos.size,
    texCount: texs.size,
    tris,
    sizes,
  };
}

export function disposeModel(root) {
  const texs = collectTextures(root);
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (!o.material) return;
    for (const mat of [].concat(o.material)) mat.dispose();
  });
  texs.forEach((t) => t.dispose());
}
