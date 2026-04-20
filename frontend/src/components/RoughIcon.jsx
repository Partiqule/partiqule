import { useEffect, useRef } from "react";
import rough from "roughjs";

export default function RoughIcon({
  drawFn,
  size = 24,
  color = "var(--moss)",
  seed = 0,
  "aria-label": ariaLabel,
  ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawFn(svg, { size, seed });
  }, [drawFn, size, seed]);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      style={{ display: "block", color, overflow: "visible" }}
      {...rest}
    />
  );
}
