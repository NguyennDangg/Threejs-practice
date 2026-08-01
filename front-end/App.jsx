import { useState, useCallback, useRef } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider.jsx";
import CropMarks from "./components/CropMarks/CropMarks.jsx";
import ScatterOverlay from "./components/ScatterOverlay/ScatterOverlay.jsx";
import Nav from "./components/Nav/Nav.jsx";
import Archive from "./routes/Archive/Archive.jsx";
import Dossier from "./routes/Dossier/Dossier.jsx";
import NotFound from "./routes/NotFound.jsx";
import styles from "./App.module.scss";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [booting, setBooting] = useState(true);
  const [pending, setPending] = useState(null);

  // mirror `pending` in a ref so the callbacks below can read it
  // WITHOUT listing it as a dependency. if they depended on it, their
  // identity would change mid-animation and restart the overlay.
  const pendingRef = useRef(null);

  const requestNav = useCallback((to) => {
    if (to === window.location.pathname) return;
    pendingRef.current = to;
    setPending(to);
  }, []);

  // fires at full cover - the route swaps while the screen is hidden
  const handleCovered = useCallback(() => {
    if (pendingRef.current) {
      navigate(pendingRef.current);
      window.scrollTo(0, 0);
    }
  }, [navigate]);

  const handleDone = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const handleBootDone = useCallback(() => setBooting(false), []);

  return (
    <ThemeProvider>
      <div className={styles.sheet}>
        <CropMarks />
        <Nav onNavigate={requestNav} />
        <main>
          <Routes location={location}>
            <Route path="/" element={<Archive />} />
            <Route path="/dossier" element={<Dossier />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>

      {booting && <ScatterOverlay mode="boot" onDone={handleBootDone} />}

      {pending && (
        <ScatterOverlay
          mode="transition"
          onCovered={handleCovered}
          onDone={handleDone}
        />
      )}
    </ThemeProvider>
  );
}