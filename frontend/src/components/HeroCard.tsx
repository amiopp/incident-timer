type HeroCardProps = {
  busy: boolean;
  onStartIncident: () => void;
  onOpenHistory: () => void;
  companyLogoSrc: string;
  mainLogoSrc: string;
};

export default function HeroCard({
  busy,
  onStartIncident,
  onOpenHistory,
  companyLogoSrc,
  mainLogoSrc,
}: HeroCardProps) {
  return (
    <section className="pcc-hero-card" aria-label="Centre de commande PCC">
      <div className="pcc-hero-top">
        <img
          className="pcc-company-logo"
          src={encodeURI(companyLogoSrc)}
          alt="Logo entreprise"
        />
      </div>

      <div className="pcc-hero-center">
        <img
          className="pcc-main-logo"
          src={encodeURI(mainLogoSrc)}
          alt="Logo principal PCC"
        />
        <h1 className="pcc-hero-title">Centre de supervision PCC</h1>
      </div>

      <div className="pcc-hero-actions">
        <button
          type="button"
          className="pcc-start-incident-btn"
          onClick={onStartIncident}
          disabled={busy}
        >
          <span className="pcc-start-incident-icon" aria-hidden="true">
            ▶
          </span>
          <span>{busy ? "Démarrage..." : "Démarrer incident"}</span>
        </button>

        <button
          type="button"
          className="pcc-history-btn"
          onClick={onOpenHistory}
          disabled={busy}
        >
          Historique
        </button>
      </div>
    </section>
  );
}
