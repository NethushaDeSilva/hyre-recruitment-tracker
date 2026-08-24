// A pure-CSS 3D cube (six faces). No libraries. Size/spin speed are props.
const FACES = ["front", "back", "right", "left", "top", "bottom"];

export default function Cube3D({ size = 90, duration = 20 }) {
  return (
    <div className="cube3d" style={{ "--s": `${size}px`, "--dur": `${duration}s` }}>
      {FACES.map((f) => (
        <span key={f} className={`face ${f}`} />
      ))}
    </div>
  );
}
