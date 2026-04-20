import rough from "roughjs";
import RoughIcon from "../RoughIcon.jsx";

const ROUGHNESS = 1.3;
const BOWING = 1;
const SEED = 19;

function drawYou(svg, { size, seed }) {
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

  svg.appendChild(rc.circle(12 * s, 8.5 * s, 7 * s, opts));
  svg.appendChild(
    rc.path(
      `M ${4 * s} ${20 * s} Q ${4 * s} ${15 * s} ${8.5 * s} ${14 * s} ` +
        `L ${15.5 * s} ${14 * s} Q ${20 * s} ${15 * s} ${20 * s} ${20 * s}`,
      opts
    )
  );
}

export default function YouIcon(props) {
  return <RoughIcon drawFn={drawYou} seed={SEED} aria-label="You" {...props} />;
}
