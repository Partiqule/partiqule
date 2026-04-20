import rough from "roughjs";
import RoughIcon from "../RoughIcon.jsx";

const ROUGHNESS = 1.3;
const BOWING = 1;
const SEED = 17;

function drawRoutine(svg, { size, seed }) {
  const rc = rough.svg(svg);
  const s = size / 24;
  const sw = Math.max(1, 1.4 * s);
  const opts = {
    stroke: "currentColor",
    strokeWidth: sw,
    roughness: ROUGHNESS,
    bowing: BOWING,
    fill: "none",
    seed,
  };

  svg.appendChild(rc.rectangle(4.5 * s, 4 * s, 15 * s, 16 * s, opts));
  svg.appendChild(rc.line(8 * s, 8.5 * s, 16 * s, 8.5 * s, opts));
  svg.appendChild(rc.line(8 * s, 12.2 * s, 14.5 * s, 12.2 * s, opts));
  svg.appendChild(rc.line(8 * s, 15.8 * s, 13 * s, 15.8 * s, opts));
}

export default function RoutineIcon(props) {
  return <RoughIcon drawFn={drawRoutine} seed={SEED} aria-label="Routine" {...props} />;
}
