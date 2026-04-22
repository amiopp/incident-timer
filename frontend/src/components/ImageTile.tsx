import type { LandingImageTile } from "./images.config";

type ImageTileProps = {
  tile: LandingImageTile;
  index: number;
};

export default function ImageTile({ tile, index }: ImageTileProps) {
  const imagePath = encodeURI(tile.imagePath);

  return (
    <article
      className="pcc-image-tile"
      style={{
        backgroundImage: `url("${imagePath}")`,
        animationDelay: `${Math.min(index * 0.08, 0.9)}s`,
      }}
      aria-label={tile.title ?? `Visuel PCC ${index + 1}`}
    >
      <div className="pcc-image-overlay" aria-hidden="true" />
      {tile.title ? <span className="pcc-image-title">{tile.title}</span> : null}
    </article>
  );
}
