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

/* 2 — spin BOWS the flight (Magnus), but the aim solver still lands it on target */
{
  const aim = { x: 0, y: 1.6 };
  const midX = (s) => { let b = s.path[0], bd = 1e9; for (const pt of s.path) { const d = Math.abs(pt.z - 11); if (d < bd) { bd = d; b = pt; } } return b.x; };
  const st = P.simulateAimed(aim, 26, 0, {});
  const rt = P.simulateAimed(aim, 26, 1, {});
  const lt = P.simulateAimed(aim, 26, -1, {});
  ok("aim solver lands every spin on the target", [st, rt, lt].every((s) => Math.abs(s.outcome.point.x - aim.x) < 0.6),
     `ends ${r2(st.outcome.point.x)} / ${r2(rt.outcome.point.x)} / ${r2(lt.outcome.point.x)}`);
  const spread = Math.abs(midX(rt) - midX(lt));
  ok("spin visibly bows the path mid-flight (Magnus)", spread > 1.5 && spread < 12, `mid-flight bow spread = ${r2(spread)} m`);
}

/* 3 — a near-post wall blocks the direct route; curl bends the SAME shot
       around it. (straight => walled; add curl => goal) */
{
  const world = { wall: { z: 9.15, halfW: 1.4, height: 2.0, cx: 1.6 } }; // covers the near post
  const aim = { x: 0.8, y: 1.0 };
  const straight = P.simulateAimed(aim, 26, 0, world);
  ok("straight ball hits the WALL", straight.outcome.type === "wall", `(${straight.outcome.type})`);
  const curled = P.simulateAimed(aim, 26, 0.5, world);
  ok("curl bows the path around the wall => GOAL on target", curled.outcome.type === "goal",
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
