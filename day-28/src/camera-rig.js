import * as THREE from "three";

function monotoneTangents(ts, vs) {
  const n = ts.length;
  const d = [];
  for (let i = 0; i < n - 1; i++)
    d[i] = (vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i],
      b = m[i + 1] / d[i],
      s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

function sampleHermite(ts, vs, ms, t) {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const h = ts[i + 1] - ts[i],
    s = (t - ts[i]) / h,
    s2 = s * s,
    s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1,
    h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2,
    h11 = s3 - s2;
  return h00 * vs[i] + h10 * h * ms[i] + h01 * vs[i + 1] + h11 * h * ms[i + 1];
}

export class CameraRig {
  constructor(camera, keys) {
    this.camera = camera;
    this.keys = keys;
    const n = keys.length;
    this._t = keys.map((k) => k.t);
    this._px = monotoneTangents(
      this._t,
      keys.map((k) => k.pos[0]),
    );
    this._py = monotoneTangents(
      this._t,
      keys.map((k) => k.pos[1]),
    );
    this._pz = monotoneTangents(
      this._t,
      keys.map((k) => k.pos[2]),
    );
    this._lx = monotoneTangents(
      this._t,
      keys.map((k) => k.look[0]),
    );
    this._ly = monotoneTangents(
      this._t,
      keys.map((k) => k.look[1]),
    );
    this._lz = monotoneTangents(
      this._t,
      keys.map((k) => k.look[2]),
    );
    this._fov = monotoneTangents(
      this._t,
      keys.map((k) => k.fov ?? camera.fov),
    );
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._posA = keys.map((k) => new THREE.Vector3(...k.pos));
    this._lookA = keys.map((k) => new THREE.Vector3(...k.look));
  }

  apply(t) {
    const nt = Math.min(1, Math.max(0, t));
    const x = sampleHermite(
      this._t,
      this._posA.map((v) => v.x),
      this._px,
      nt,
    );
    const y = sampleHermite(
      this._t,
      this._posA.map((v) => v.y),
      this._py,
      nt,
    );
    const z = sampleHermite(
      this._t,
      this._posA.map((v) => v.z),
      this._pz,
      nt,
    );
    this._pos.set(x, y, z);
    const lx = sampleHermite(
      this._t,
      this._lookA.map((v) => v.x),
      this._lx,
      nt,
    );
    const ly = sampleHermite(
      this._t,
      this._lookA.map((v) => v.y),
      this._ly,
      nt,
    );
    const lz = sampleHermite(
      this._t,
      this._lookA.map((v) => v.z),
      this._lz,
      nt,
    );
    this._look.set(lx, ly, lz);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    const fov = sampleHermite(
      this._t,
      this.keys.map((k) => k.fov ?? 40),
      this._fov,
      nt,
    );
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
