// The homepage's dark-mode light bulb, hanging from a FLEXIBLE rope.
//
// The cord is a real rope simulation: a chain of points connected by distance
// constraints, integrated with Verlet integration (the standard accurate method
// for rope/cloth). Gravity pulls the points down; the constraints keep the rope
// together while still letting it bend and stretch. Point 0 is pinned to the
// hook; while you drag, the last point is pinned to the cursor — so the bulb
// goes exactly where the mouse goes, and the rope bends/stretches to follow.
//
// PARKING: there's a second "parking" hook next to the main one. Drag the bulb
// onto it and release — the bulb hangs on that hook and the rope contracts, so
// it tucks up at the top and stops dangling into the page. Grab it again to pull
// it back off and let it hang normally.
//
// A single always-running rAF loop drives it (kept simple so it can't wedge on
// StrictMode's mount→cleanup→mount). Only the bulb captures pointer events, so
// the page is never blocked. Dark-mode + homepage only.
import { useEffect, useRef, useState } from "react";
import { currentTheme } from "@/lib/theme";

const SEGMENTS = 16; // rope resolution
const REST_LEN = 152; // natural (hanging) rope length (px)
const PARK_LEN = 66; // contracted length while parked on the second hook
const GRAVITY = 2000; // px / s²
const FRICTION = 0.99; // velocity retained per frame (air drag)
const ITER = 24; // constraint solver passes (higher = stiffer / less stretch)
const DT = 1 / 60;
const HOOK_Y = 9;
const PARK_DX = 42; // horizontal gap to the parking hook (matches CSS)
const SNAP = 58; // release-within-this of the parking hook to hang it
const START_ANGLE = 0.5; // radians the rope is pulled to on load, so it swings in

const centerX = () =>
  (typeof document !== "undefined" ? document.documentElement.clientWidth : 960) / 2;

export default function LightbulbIntro() {
  const [dark, setDark] = useState(currentTheme() === "dark");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const onChange = (e) => {
      const isDark = e.detail === "dark";
      setDark(isDark);
      if (isDark) setRun((n) => n + 1);
    };
    window.addEventListener("hiree-theme-change", onChange);
    return () => window.removeEventListener("hiree-theme-change", onChange);
  }, []);

  if (!dark) return null;
  return <Rope key={run} />;
}

function Rope() {
  const pathRef = useRef(null);
  const bulbRef = useRef(null);
  const parkRef = useRef(null);
  const st = useRef(null);

  if (!st.current) {
    const hookX = centerX();
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = reduced ? 0 : START_ANGLE;
    const pts = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const len = (i * REST_LEN) / SEGMENTS;
      const x = hookX + Math.sin(a) * len;
      const y = HOOK_Y + Math.cos(a) * len;
      pts.push({ x, y, px: x, py: y }); // starts at rest, then falls under gravity
    }
    st.current = {
      pts, hookX, reduced,
      dragging: false, cx: hookX, cy: HOOK_Y + REST_LEN,
      parked: false, restLen: REST_LEN, restTarget: REST_LEN,
    };
  }

  const parkPos = () => ({ x: st.current.hookX + PARK_DX, y: HOOK_Y });
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const draw = () => {
    const s = st.current;
    const p = s.pts;
    let d = `M ${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
    for (let i = 1; i < p.length; i++) d += ` L ${p[i].x.toFixed(1)},${p[i].y.toFixed(1)}`;
    if (pathRef.current) pathRef.current.setAttribute("d", d);
    const a = p[SEGMENTS];
    const b = p[SEGMENTS - 1];
    const rot = -Math.atan2(a.x - b.x, a.y - b.y) * (180 / Math.PI);
    if (bulbRef.current) bulbRef.current.style.transform = `translate(${(a.x - 24).toFixed(1)}px, ${a.y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
    // parking-hook affordance: highlight when the bulb is near / holding
    if (parkRef.current) {
      const pk = parkPos();
      const near = s.dragging && dist(a.x, a.y, pk.x, pk.y) < SNAP;
      parkRef.current.className = `bulb-hook park${s.parked ? " holding" : ""}${near ? " near" : ""}`;
    }
  };

  const simulate = () => {
    const s = st.current;
    const p = s.pts;
    // ease the rope length toward its target (full when hanging, short when parked)
    s.restLen += (s.restTarget - s.restLen) * 0.16;
    const seg = s.restLen / SEGMENTS;
    const pk = parkPos();

    for (let i = 1; i < p.length; i++) {
      const pt = p[i];
      const vx = (pt.x - pt.px) * FRICTION;
      const vy = (pt.y - pt.py) * FRICTION;
      pt.px = pt.x;
      pt.py = pt.y;
      pt.x += vx;
      pt.y += vy + GRAVITY * DT * DT;
    }
    // clamp the grabbed end to within the rope's length of the hook, so you can't
    // pull it past full length — it goes taut instead of stretching.
    let tx = s.cx;
    let ty = s.cy;
    if (s.dragging) {
      const dxp = s.cx - s.hookX;
      const dyp = s.cy - HOOK_Y;
      const dd = Math.hypot(dxp, dyp) || 0.0001;
      if (dd > s.restLen) {
        tx = s.hookX + (dxp / dd) * s.restLen;
        ty = HOOK_Y + (dyp / dd) * s.restLen;
      }
    }
    for (let k = 0; k < ITER; k++) {
      p[0].x = s.hookX;
      p[0].y = HOOK_Y;
      // the bulb end is pinned to the (clamped) cursor while dragging, or the hook when parked
      if (s.dragging) { p[SEGMENTS].x = tx; p[SEGMENTS].y = ty; }
      else if (s.parked) { p[SEGMENTS].x = pk.x; p[SEGMENTS].y = pk.y; }
      for (let i = 0; i < SEGMENTS; i++) {
        const p1 = p[i];
        const p2 = p[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = ((d - seg) / d) * 0.5;
        const ox = dx * diff;
        const oy = dy * diff;
        const p1fixed = i === 0;
        const p2fixed = i + 1 === SEGMENTS && (s.dragging || s.parked);
        if (!p1fixed) { p1.x += ox; p1.y += oy; }
        if (!p2fixed) { p2.x -= ox; p2.y -= oy; }
      }
    }
  };

  const onMove = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    s.cx = e.clientX;
    s.cy = e.clientY;
    e.preventDefault();
  };
  const onUp = () => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.classList.remove("bulb-grabbing");
    // released near the parking hook? hang it there (contract the rope)
    const pk = parkPos();
    if (dist(s.cx, s.cy, pk.x, pk.y) < SNAP) {
      s.parked = true;
      s.restTarget = PARK_LEN;
    } else {
      s.parked = false;
      s.restTarget = REST_LEN;
    }
  };
  const onDown = (e) => {
    const s = st.current;
    // grabbing always takes it off the hook and restores full length
    s.parked = false;
    s.restTarget = REST_LEN;
    s.dragging = true;
    s.cx = e.clientX;
    s.cy = e.clientY;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.classList.add("bulb-grabbing");
    e.preventDefault();
  };

  useEffect(() => {
    const s = st.current;
    const onResize = () => { s.hookX = centerX(); };
    window.addEventListener("resize", onResize);
    let raf = 0;
    const tick = () => {
      if (!s.reduced) simulate();
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("bulb-grabbing");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = st.current.pts[SEGMENTS];
  return (
    <div className="bulb-scene" aria-hidden="true">
      <svg className="bulb-rope"><path ref={pathRef} /></svg>
      <span className="bulb-hook" />
      <span className="bulb-hook park" ref={parkRef} />
      <span
        className="bulb"
        ref={bulbRef}
        onPointerDown={onDown}
        title="Grab me — swing me, or hang me on the hook →"
        style={{ transform: `translate(${last.x - 24}px, ${last.y}px)` }}
      >
        <span className="bulb-glow" />
        <span className="bulb-cap" />
        <span className="bulb-glass" />
        <span className="bulb-light" />
      </span>
    </div>
  );
}
