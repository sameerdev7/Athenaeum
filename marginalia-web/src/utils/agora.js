/**
 * Seat placement for the Agora's ring.
 *
 * docs/DESIGN.md asks for participants "arranged in a circle or loose ring,
 * not a grid", evoking an assembly rather than decorating for its own sake.
 * A wide ellipse (wider than tall) reads better than a true circle at the
 * aspect ratios the container works at, and keeps the first seat at the top
 * rather than off to the side.
 */
export function seatPosition(index, total) {
  if (total <= 1) return { x: 50, y: 50 };
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: round(50 + Math.cos(angle) * 42),
    y: round(50 + Math.sin(angle) * 38),
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
