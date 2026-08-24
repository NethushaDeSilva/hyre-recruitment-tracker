// Ambient 3D background: a few slowly-rotating wireframe cubes and soft floating
// orbs placed around the hero for depth. Decorative only (pointer-events:none via
// .scene-3d), and kept subtle so it never competes with the text.
import "./animations.css";
import Cube3D from "./Cube3D";

// position/size/timing for each floating cube
const CUBES = [
  { top: "12%", left: "6%", size: 64, dur: 22, float: 9 },
  { top: "58%", left: "16%", size: 42, dur: 16, float: 7 },
  { top: "20%", right: "10%", size: 96, dur: 26, float: 11 },
];
const ORBS = [
  { top: "70%", right: "22%", size: 150, float: 10 },
  { top: "4%", left: "40%", size: 90, float: 8 },
];

export default function AmbientShapes() {
  return (
    <div className="scene-3d" aria-hidden="true">
      {CUBES.map((c, i) => (
        <div
          key={`c${i}`}
          className="float-3d"
          style={{ top: c.top, left: c.left, right: c.right, "--float": `${c.float}s` }}
        >
          <Cube3D size={c.size} duration={c.dur} />
        </div>
      ))}
      {ORBS.map((o, i) => (
        <div
          key={`o${i}`}
          className="orb-3d"
          style={{ top: o.top, left: o.left, right: o.right, "--s": `${o.size}px`, "--float": `${o.float}s` }}
        />
      ))}
    </div>
  );
}
