import { useState, useEffect, useRef, useCallback } from "react";

const LEVELS = {
  Normal:    { label: "Normal",    color: "#16a34a", bg: "#15803d", shadow: "rgba(22,163,74,0.5)" },
  Important: { label: "Important", color: "#ea580c", bg: "#c2410c", shadow: "rgba(234,88,12,0.5)" },
  Critique:  { label: "Critique",  color: "#dc2626", bg: "#b91c1c", shadow: "rgba(220,38,38,0.5)" },
};

const LEVEL_ORDER = ["Normal", "Important", "Critique"];

function getEscalatedLevel(initialLevel, elapsedSeconds) {
  const startIndex = LEVEL_ORDER.indexOf(initialLevel);
  const steps = Math.floor(elapsedSeconds / (15 * 60));
  return LEVEL_ORDER[Math.min(startIndex + steps, LEVEL_ORDER.length - 1)];
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatClock(date) {
  return date.toTimeString().slice(0, 8);
}

function useIncident() {
  const [state, setState] = useState(null);
  const intervalRef = useRef(null);

  const start = useCallback((initialLevel, name) => {
    // On stocke le timestamp exact de départ — c'est lui qui fait foi
    setState({
      initialLevel,
      name: name || "Incident",
      startTime: new Date(),
      // elapsed et level sont recalculés en temps réel, pas incrémentés
      elapsed: 0,
      level: initialLevel,
    });
  }, []);

  const stop = useCallback(() => {
    setState(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (!state) return;
    const tick = () => {
      setState((prev) => {
        if (!prev) return null;
        // Calcul basé sur l'heure réelle, résistant au sleep/verrouillage
        const newElapsed = Math.floor((Date.now() - prev.startTime.getTime()) / 1000);
        return { ...prev, elapsed: newElapsed, level: getEscalatedLevel(prev.initialLevel, newElapsed) };
      });
    };
    tick(); // mise à jour immédiate au montage
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [state?.startTime]);

  return { state, start, stop };
}

function Badge({ icon, label, pulse, small }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: small ? "0.4rem" : "0.6rem",
      background: "rgba(255,255,255,0.18)",
      border: "2px solid rgba(255,255,255,0.55)",
      borderRadius: "8px",
      padding: small ? "0.45rem 0.9rem" : "0.6rem 1.2rem",
      color: "#fff",
      fontSize: small ? "clamp(0.65rem, 1vw, 0.82rem)" : "clamp(0.8rem, 1.4vw, 1.05rem)",
      fontWeight: 800,
      letterSpacing: "0.09em",
      backdropFilter: "blur(8px)",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
      animation: pulse ? "pulse-badge 1.2s ease-in-out infinite" : "none",
    }}>
      <span style={{ fontSize: small ? "1.1em" : "1.3em" }}>{icon}</span>
      {label}
    </div>
  );
}

function TimerBlock({ value, label, split }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <div style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "10px",
        padding: split ? "0.55rem 0.75rem" : "0.9rem 1.3rem",
        minWidth: split ? "clamp(50px, 5vw, 75px)" : "clamp(70px, 8vw, 120px)",
        textAlign: "center",
        backdropFilter: "blur(4px)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}>
        <span style={{
          fontSize: split ? "clamp(1.5rem, 3.2vw, 2.8rem)" : "clamp(2.2rem, 5vw, 4.5rem)",
          fontWeight: 900,
          fontFamily: "'Courier New', monospace",
          color: "#fff",
          textShadow: "0 2px 10px rgba(0,0,0,0.3)",
          display: "block", lineHeight: 1,
        }}>{value}</span>
      </div>
      <span style={{
        fontSize: split ? "clamp(0.48rem, 0.75vw, 0.62rem)" : "clamp(0.58rem, 1vw, 0.78rem)",
        fontWeight: 800, letterSpacing: "0.18em",
        opacity: 0.9, color: "#fff", textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

function Colon({ split }) {
  return (
    <div style={{
      color: "#fff", opacity: 0.6, fontWeight: 900, lineHeight: 1,
      fontSize: split ? "clamp(1.2rem, 2.8vw, 2.2rem)" : "clamp(1.8rem, 4.5vw, 4rem)",
      paddingTop: split ? "0.4rem" : "0.8rem",
    }}>:</div>
  );
}

function IncidentPanel({ incident, onStop, split }) {
  const { level, name, startTime, elapsed } = incident;
  const cfg = LEVELS[level];
  const isCritique = level === "Critique";
  const parts = formatTime(elapsed).split(":");

  return (
    <div style={{
      flex: 1,
      background: `linear-gradient(135deg, ${cfg.bg} 0%, ${cfg.color} 100%)`,
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      borderRight: split ? "3px solid rgba(0,0,0,0.3)" : "none",
    }}>
      {/* ── TOP BAR ── */}
      {split ? (
        // SPLIT MODE : 2 lignes
        <div style={{
          display: "flex", flexDirection: "column",
          backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.22)",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
          flexShrink: 0,
        }}>
          {/* Ligne 1 : URGENCE + X */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.55rem 1rem",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              color: "#fff", fontWeight: 800,
              fontSize: "clamp(0.7rem, 1.1vw, 0.9rem)",
              letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap",
            }}>
              <span>⚠️</span> URGENCE
            </div>
            <button
              onClick={onStop}
              style={{
                background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.6)",
                color: "#fff", width: "2.2rem", height: "2.2rem", borderRadius: "50%",
                cursor: "pointer", fontSize: "1rem", fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", backdropFilter: "blur(4px)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.38)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "scale(1)"; }}
            >✕</button>
          </div>
          {/* Ligne 2 : badges */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.6rem",
            padding: "0.55rem 1rem", flexWrap: "wrap",
          }}>
            <Badge icon="🔔" label="ANNONCE VOYAGEUR" small />
            {isCritique && <Badge icon="🚨" label="ASTREINTE" pulse small />}
          </div>
        </div>
      ) : (
        // PLEIN ÉCRAN : 1 ligne
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.9rem 1.5rem",
          backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.18)",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
          flexShrink: 0, gap: "0.8rem",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            color: "#fff", fontWeight: 800,
            fontSize: "clamp(0.8rem, 1.3vw, 1.05rem)",
            letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            <span style={{ fontSize: "1.2em" }}>⚠️</span> URGENCE
          </div>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
            <Badge icon="🔔" label="ANNONCE VOYAGEUR" />
            {isCritique && <Badge icon="🚨" label="ASTREINTE" pulse />}
            <button
              onClick={onStop}
              style={{
                background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.6)",
                color: "#fff", width: "2.6rem", height: "2.6rem", borderRadius: "50%",
                cursor: "pointer", fontSize: "1.1rem", fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", backdropFilter: "blur(4px)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.38)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "scale(1)"; }}
            >✕</button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", color: "#fff",
        padding: split ? "0.8rem 1rem" : "1.5rem 2rem",
        gap: split ? "0.6rem" : "1.1rem",
        overflow: "hidden",
      }}>
        {/* Level tag */}
        <div style={{
          background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "4px", padding: "0.22rem 0.9rem",
          fontSize: "clamp(0.58rem, 0.9vw, 0.8rem)", fontWeight: 800,
          letterSpacing: "0.22em", color: "rgba(255,255,255,0.9)",
        }}>{level.toUpperCase()}</div>

        {/* Title */}
        <h1 style={{
          fontSize: split ? "clamp(1.2rem, 2.8vw, 2.5rem)" : "clamp(1.8rem, 4vw, 3.8rem)",
          fontWeight: 900, lineHeight: 1.05,
          textShadow: "0 4px 20px rgba(0,0,0,0.3)",
          letterSpacing: "-0.02em", margin: 0,
        }}>
          ALERTE — INCIDENT EN COURS
        </h1>

        {/* Incident name - single line, truncated */}
        <div style={{
          fontSize: split ? "clamp(0.85rem, 2vw, 1.6rem)" : "clamp(1.2rem, 3vw, 2.5rem)",
          fontWeight: 900,
          color: "rgba(255,255,255,0.95)",
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
          background: "rgba(0,0,0,0.2)",
          borderRadius: "8px",
          padding: split ? "0.2rem 0.7rem" : "0.3rem 1.2rem",
          maxWidth: "95%",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}>
          {name}
        </div>

        {/* Triggered time */}
        <p style={{
          fontSize: split ? "clamp(0.65rem, 1.2vw, 0.95rem)" : "clamp(0.9rem, 1.8vw, 1.4rem)",
          fontWeight: 600, opacity: 0.85, margin: 0, letterSpacing: "0.05em",
        }}>
          Déclenché à {formatClock(startTime)}
        </p>

        {/* Timer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            fontSize: "clamp(0.48rem, 0.82vw, 0.7rem)", fontWeight: 800,
            letterSpacing: "0.28em", opacity: 0.75, textTransform: "uppercase",
          }}>DURÉE INCIDENT</div>

          <div style={{
            display: "flex",
            gap: split ? "clamp(0.25rem, 0.7vw, 0.6rem)" : "clamp(0.5rem, 1.2vw, 1rem)",
            justifyContent: "center", alignItems: "flex-start",
          }}>
            <TimerBlock value={parts[0]} label="HEURES"   split={split} />
            <Colon split={split} />
            <TimerBlock value={parts[1]} label="MINUTES"  split={split} />
            <Colon split={split} />
            <TimerBlock value={parts[2]} label="SECONDES" split={split} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiIncidentPanel({ onTrigger }) {
  const [level, setLevel] = useState("Normal");
  const [name, setName] = useState("");
  const cfg = LEVELS[level];

  return (
    <div style={{
      position: "fixed", bottom: "1.2rem", right: "1.2rem",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.18)", borderRadius: "14px",
      padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.65rem",
      width: "240px", zIndex: 100, boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
    }}>
      {/* Title */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.4rem",
        color: "rgba(255,255,255,0.7)", fontSize: "0.65rem",
        fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
      }}>
        <span>⚡</span> MODE MULTI-INCIDENT
      </div>

      {/* Nom */}
      <input
        value={name} onChange={e => setName(e.target.value)}
        placeholder="Nom de l'incident..."
        style={{
          background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff", borderRadius: "7px", padding: "0.48rem 0.7rem",
          fontSize: "0.85rem", fontWeight: 500, fontFamily: "inherit", outline: "none",
          width: "100%",
        }}
      />

      {/* Niveau */}
      <select
        value={level} onChange={e => setLevel(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff", borderRadius: "7px", padding: "0.48rem 2rem 0.48rem 0.7rem",
          fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 11 11'%3E%3Cpath fill='white' d='M5.5 7.5L1 3h9z'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat", backgroundPosition: "right 0.6rem center",
          fontFamily: "inherit", width: "100%",
        }}
      >
        {Object.keys(LEVELS).map(l => (
          <option key={l} value={l} style={{ background: "#1a1a1a" }}>{l}</option>
        ))}
      </select>

      {/* Bouton */}
      <button
        onClick={() => onTrigger(level, name)}
        style={{
          background: cfg.color, color: "#fff", border: "none", borderRadius: "7px",
          padding: "0.55rem 1rem", fontWeight: 800, fontSize: "0.82rem",
          letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase",
          fontFamily: "inherit", transition: "filter 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.filter = ""; }}
      >
        ▶ DÉCLENCHER
      </button>
    </div>
  );
}

export default function App() {
  const inc1 = useIncident();
  const inc2 = useIncident();
  const [homeLevel, setHomeLevel] = useState("Normal");
  const [homeName, setHomeName] = useState("");

  const hasInc1 = !!inc1.state;
  const hasInc2 = !!inc2.state;
  const hasAny  = hasInc1 || hasInc2;
  const hasBoth = hasInc1 && hasInc2;
  const cfg = LEVELS[homeLevel];

  // ── HOME ──────────────────────────────────────────────────────
  if (!hasAny) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body, #root { width: 100%; height: 100%; }
          body { font-family: 'Syne', sans-serif; }
          input::placeholder { color: rgba(0,0,0,0.35); }
          input:focus { outline: 2px solid #2563eb; border-color: transparent !important; }
          @keyframes float {
            0%,100% { transform: translateY(0) scale(1); }
            50%      { transform: translateY(-12px) scale(1.03); }
          }
          @keyframes glow-anim {
            0%,100% { box-shadow: 0 0 40px ${cfg.shadow}, 0 0 80px ${cfg.shadow}, 0 20px 60px rgba(0,0,0,0.1); }
            50%      { box-shadow: 0 0 70px ${cfg.shadow}, 0 0 130px ${cfg.shadow}, 0 20px 60px rgba(0,0,0,0.1); }
          }
        `}</style>
        <div style={{
          width: "100vw", height: "100vh", background: "#f8f8f6",
          display: "flex", flexDirection: "column", fontFamily: "'Syne', sans-serif",
        }}>
          <div style={{
            padding: "1.2rem 2rem", display: "flex", alignItems: "center", gap: "0.6rem",
            borderBottom: "1px solid #e5e5e0", flexShrink: 0,
          }}>
            <div style={{
              width: "28px", height: "28px", background: "#2563eb", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: "0.9rem", fontWeight: 900,
            }}>i</div>
            <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#111" }}>IncidentTimer</span>
          </div>

          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "2rem", textAlign: "center",
          }}>
            <h1 style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 900,
              color: "#0f0f0f", lineHeight: 1.1, letterSpacing: "-0.03em",
              marginBottom: "0.5rem", maxWidth: "700px",
            }}>
              Déclenchez un incident de niveau
            </h1>
            <p style={{ color: "#777", fontSize: "clamp(0.9rem, 1.8vw, 1.1rem)", marginBottom: "2rem", fontWeight: 500 }}>
              Sélectionnez la criticité pour démarrer le suivi d'intervention.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", width: "100%", maxWidth: "420px", marginBottom: "2rem", textAlign: "left" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.9rem", color: "#444" }}>Nom de l'incident</label>
                <input
                  value={homeName} onChange={e => setHomeName(e.target.value)}
                  placeholder="Ex: Panne de signalisation"
                  style={{
                    fontSize: "1rem", fontWeight: 500, padding: "0.85rem 1.1rem",
                    borderRadius: "12px", border: "2px solid #e0e0da", background: "#fff",
                    color: "#111", fontFamily: "'Syne', sans-serif",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.9rem", color: "#444" }}>Niveau de criticité</label>
                <select
                  value={homeLevel} onChange={e => setHomeLevel(e.target.value)}
                  style={{
                    fontSize: "1rem", fontWeight: 700, padding: "0.85rem 3rem 0.85rem 1.1rem",
                    borderRadius: "12px", border: "2px solid #e0e0da", background: "#fff",
                    color: "#111", cursor: "pointer", appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3Cpath fill='%23333' d='M7 9L2 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center",
                    fontFamily: "'Syne', sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  }}
                >
                  {Object.keys(LEVELS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={() => inc1.start(homeLevel, homeName)}
              style={{
                width: "clamp(190px, 23vw, 250px)", height: "clamp(190px, 23vw, 250px)",
                borderRadius: "50%", background: cfg.color,
                border: "6px solid rgba(255,255,255,0.5)", color: "#fff", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                fontFamily: "'Syne', sans-serif", fontWeight: 900,
                fontSize: "clamp(1.1rem, 2vw, 1.4rem)", letterSpacing: "0.12em",
                transition: "transform 0.2s",
                animation: "float 3s ease-in-out infinite, glow-anim 2s ease-in-out infinite",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <span style={{ fontSize: "1.8rem" }}>🚀</span>
              DÉCLENCHER
            </button>
          </div>

          <footer style={{ textAlign: "center", padding: "1rem", color: "#aaa", fontSize: "0.8rem", flexShrink: 0 }}>
            © 2024 IncidentTimer Protocol. Tous droits réservés.
          </footer>
        </div>
      </>
    );
  }

  // ── INCIDENT SCREEN ───────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; height: 100%; font-family: 'Syne', sans-serif; }
        @keyframes pulse-badge {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.82; transform: scale(0.96); }
        }
      `}</style>
      <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden" }}>
        {hasInc1 && <IncidentPanel incident={inc1.state} onStop={inc1.stop} split={hasBoth} />}
        {hasInc2 && <IncidentPanel incident={inc2.state} onStop={inc2.stop} split={hasBoth} />}
      </div>
      {!hasBoth && (
        <MultiIncidentPanel onTrigger={hasInc1 ? inc2.start : inc1.start} />
      )}
    </>
  );
}