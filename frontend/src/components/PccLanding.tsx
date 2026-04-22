import HeroCard from "./HeroCard";
import ImageTile from "./ImageTile";
import { LANDING_LEFT_TILES, LANDING_RIGHT_TILES } from "./images.config";
import "./pccLanding.css";

type PccLandingProps = {
  busy: boolean;
  onStartIncident: () => void;
  onOpenHistory: () => void;
};

const COMPANY_LOGO_PATH =
  "/logo_entreprise/RATP Dev logo on transparent background.png";
const MAIN_LOGO_PATH = "/logo/logo_lkhr.png";

export default function PccLanding({
  busy,
  onStartIncident,
  onOpenHistory,
}: PccLandingProps) {
  return (
    <section className="pcc-landing" aria-label="Tableau de bord PCC">
      <div className="pcc-landing-background" aria-hidden="true" />

      <div className="pcc-mosaic pcc-mosaic-left" aria-hidden="true">
        {LANDING_LEFT_TILES.map((tile, index) => (
          <ImageTile key={tile.id} tile={tile} index={index} />
        ))}
      </div>

      <HeroCard
        busy={busy}
        onStartIncident={onStartIncident}
        onOpenHistory={onOpenHistory}
        companyLogoSrc={COMPANY_LOGO_PATH}
        mainLogoSrc={MAIN_LOGO_PATH}
      />

      <div className="pcc-mosaic pcc-mosaic-right" aria-hidden="true">
        {LANDING_RIGHT_TILES.map((tile, index) => (
          <ImageTile
            key={tile.id}
            tile={tile}
            index={index + LANDING_LEFT_TILES.length}
          />
        ))}
      </div>
    </section>
  );
}
