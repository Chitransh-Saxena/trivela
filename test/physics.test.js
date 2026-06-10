/* trivela physics — node smoke tests (no deps). run: node test/physics.test.js */
const P = require("../public/physics.js");

let fails = 0;
function ok(name, cond, info) {
  console.log((cond ? "  PASS" : "✗ FAIL") + " — " + name + (info ? "   " + info : ""));
  if (!cond) fails++;
}
const r2 = (n) => Number(n).toFixed(2);

console.log("trivela physics smoke tests\n");

/* 1 — a clean strike at the centre is a goal */
{
  const r = P.simulateAimed({ x: 0, y: 1.2 }, 26, 0, {});
  ok("straight centre strike => GOAL", r.outcome.type === "goal",
     `(${r.outcome.type} @ x=${r2(r.outcome.point.x)} y=${r2(r.outcome.point.y)})`);
}

/* 2 — spin curls the ball, sign-correct, sane magnitude */
{
  const aim = { x: -2.2, y: 1.7 };
  const straight = P.simulateAimed(aim, 26, 0, {});
  const right = P.simulateAimed(aim, 26, 1, {});
  const left = P.simulateAimed(aim, 26, -1, {});
  const curve = right.outcome.point.x - straight.outcome.point.x;
  ok("+spin curls right", right.outcome.point.x > straight.outcome.point.x + 0.5,
     `straight x=${r2(straight.outcome.point.x)} -> curled x=${r2(right.outcome.point.x)}`);
  ok("-spin curls left", left.outcome.point.x < straight.outcome.point.x - 0.5);
  ok("full-curl deflection is believable (1.5-7m)", curve > 1.5 && curve < 7,
     `lateral curve = ${r2(curve)} m`);
}

/* 3 — a near-post wall blocks the direct route; curl bends the SAME shot
       around it. (straight => walled; add curl => goal) */
{
  const world = { wall: { z: 9.15, halfW: 1.4, height: 2.0, cx: 1.6 } }; // covers the near post
  const aim = { x: 0.6, y: 1.3 };
  const straight = P.simulateAimed(aim, 26, 0, world);
  ok("straight ball hits the WALL", straight.outcome.type === "wall", `(${straight.outcome.type})`);
  const curled = P.simulateAimed(aim, 26, -0.7, world);
  ok("curl bends the same shot around the wall => GOAL", curled.outcome.type === "goal",
     `(${curled.outcome.type} @ x=${r2(curled.outcome.point.x)} y=${r2(curled.outcome.point.y)})`);
}

/* 4 — power gates distance */
{
  const weak = P.simulateAimed({ x: 0, y: 1.2 }, 12, 0, {});
  ok("weak power falls SHORT", weak.outcome.type === "short", `(${weak.outcome.type})`);
}

/* 5 — keeper saves the middle, top corner beats him */
{
  const world = { keeper: { cover: 1.3, reach: 2.7, lowReach: 1.4, height: 1.9, cx: 0 } };
  const central = P.simulateAimed({ x: 0, y: 1.0 }, 26, 0, world);
  ok("central shot is SAVED", central.outcome.type === "save", `(${central.outcome.type})`);
  const topc = P.simulateAimed({ x: 2.95, y: 2.15 }, 27, 0, world);
  ok("top-corner shot beats the keeper => GOAL", topc.outcome.type === "goal",
     `(${topc.outcome.type} @ x=${r2(topc.outcome.point.x)} y=${r2(topc.outcome.point.y)})`);
}

console.log("\n" + (fails === 0 ? "ALL GOOD ✓" : fails + " FAILURE(S) ✗"));
process.exit(fails ? 1 : 0);
