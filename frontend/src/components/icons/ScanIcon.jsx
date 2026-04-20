import rough from "roughjs";
import RoughIcon from "../RoughIcon.jsx";

const ROUGHNESS = 1.3;
const BOWING = 1;
const SEED = 13;

function drawScan(svg, { size, seed }) {
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
  const dotOpts = {
    stroke: "currentColor",
    strokeWidth: sw,
    roughness: ROUGHNESS,
    fill: "currentColor",
    fillStyle: "solid",
    seed,
  };

  svg.appendChild(
    rc.path(
      `M ${3 * s} ${19.5 * s} L ${3 * s} ${8 * s} L ${7.2 * s} ${8 * s} ` +
        `L ${9 * s} ${5.5 * s} L ${15 * s} ${5.5 * s} L ${16.8 * s} ${8 * s} ` +
        `L ${21 * s} ${8 * s} L ${21 * s} ${19.5 * s} Z`,
      opts
    )
  );
  svg.appendChild(rc.circle(12 * s, 13.2 * s, 7 * s, opts));
  svg.appendChild(rc.circle(17.8 * s, 10 * s, 1.3 * s, dotOpts));
}

export default function ScanIcon(props) {
  return <RoughIcon drawFn={drawScan} seed={SEED} aria-label="Scan" {...props} />;
}
