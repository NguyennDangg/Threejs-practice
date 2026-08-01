import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="shell" style={{ paddingTop: 120, paddingBottom: 120 }}>
      <p className="mono" style={{ color: "var(--accent)", marginBottom: 16 }}>
        ERROR 404
      </p>
      <h1 style={{ fontSize: "var(--fs-hero)", margin: "0 0 12px" }}>
        NO SIGNAL
      </h1>
      <p
        className="mono"
        style={{ color: "var(--ink-faint)", marginBottom: 28 }}
      >
        THE REQUESTED RECORD DOES NOT EXIST
      </p>
      <Link to="/" className="mono" style={{ color: "var(--ink)" }}>
        ← RETURN TO ARCHIVE
      </Link>
    </div>
  );
}
