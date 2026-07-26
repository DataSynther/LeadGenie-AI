import { wallpaperDataUri, WALLPAPER_TILE_PX } from "../../lib/sdrWallpaper";

// Baked-in per-theme tint (matches --c-brand light/dark values) — data URIs
// can't read CSS custom properties, so both variants are pre-rendered once
// and swapped via Tailwind's `dark:` class on the app's `html.dark` toggle.
const LIGHT_URI = wallpaperDataUri("rgba(109,40,217,0.10)");
const DARK_URI = wallpaperDataUri("rgba(167,139,250,0.09)");

export function SDRWallpaperLayer({
  tileSize = WALLPAPER_TILE_PX,
  className = "",
}: {
  tileSize?: number;
  className?: string;
}) {
  const size = `${tileSize}px ${tileSize}px`;
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden>
      <div
        className="absolute inset-0 dark:hidden"
        style={{ backgroundImage: `url("${LIGHT_URI}")`, backgroundSize: size, backgroundRepeat: "repeat" }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ backgroundImage: `url("${DARK_URI}")`, backgroundSize: size, backgroundRepeat: "repeat" }}
      />
    </div>
  );
}
