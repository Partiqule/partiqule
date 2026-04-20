import rough from "roughjs";
import RoughIcon from "../RoughIcon.jsx";

const ROUGHNESS = 1.3;
const BOWING = 1;
const SEED = 7;

function drawHome(svg, { size, seed }) {
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

  svg.appendChild(
    rc.path(
      `M ${3.5 * s} ${12 * s} L ${12 * s} ${3.5 * s} L ${20.5 * s} ${12 * s}`,
      opts
    )
  );
  svg.appendChild(rc.rectangle(5 * s, 11.5 * s, 14 * s, 9 * s, opts));
  svg.appendChild(rc.rectangle(10 * s, 14.5 * s, 4 * s, 6 * s, opts));
}

export default function HomeIcon(props) {
  return <RoughIcon drawFn={drawHome} seed={SEED} aria-label="Home" {...props} />;
}
