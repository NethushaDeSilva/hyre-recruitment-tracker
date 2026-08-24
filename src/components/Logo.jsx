// The Hyre brand mark — the yellow "H" badge. Single source of truth so the
// logo is identical everywhere and can be swapped in one place.
// The image already carries its own rounded-square shape + colour, so it needs
// no background wrapper — just render it at the requested size.
export default function Logo({ size = 36, className = "" }) {
  return (
    <img
      src="/brand/logo.png"
      alt="Hyre"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      draggable="false"
    />
  );
}
