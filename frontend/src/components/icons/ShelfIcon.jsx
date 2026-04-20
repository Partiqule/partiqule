import rough from "roughjs";
import RoughIcon from "../RoughIcon.jsx";

const ROUGHNESS = 1.3;
const BOWING = 1;
const SEED = 11;

function drawShelf(svg, { size, seed }) {
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
  const fillOpts = {
    stroke: "currentColor",
    strokeWidth: sw,
    roughness: ROUGHNESS,
    fill: "currentColor",
    fillStyle: "solid",
    seed,
  };

  svg.appendChild(rc.line(3 * s, 6.5 * s, 21 * s, 6.5 * s, opts));
  svg.appendChild(rc.line(3 * s, 12 * s, 21 * s, 12 * s, opts));
  svg.appendChild(rc.line(3 * s, 17.5 * s, 21 * s, 17.5 * s, opts));
  svg.appendChild(rc.circle(7 * s, 5.3 * s, 1.8 * s, fillOpts));
  svg.appendChild(rc.circle(15 * s, 10.8 * s, 1.8 * s, fillOpts));
  svg.appendChild(rc.circle(10 * s, 16.3 * s, 1.8 * s, fillOpts));
}

export default function ShelfIcon(props) {
  return <RoughIcon drawFn={drawShelf} seed={SEED} aria-label="Shelf" {...props} />;
}
