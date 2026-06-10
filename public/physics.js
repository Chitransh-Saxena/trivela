/* ============================================================
   trivela — pure ball-flight physics (Magnus curl)
   No deps. Runs in the browser (window.TrivelaPhysics) and in
   Node (require) so the core sim is unit-testable.

   Coordinates (metres, seconds):
     x — lateral   (+ right)
     y — height    (+ up,  ground = 0)
     z — forward   (+ toward goal, ball starts at 0, goal at D)
   ============================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TrivelaPhysics = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* tuned for an arcadey-but-believable free kick */
  const CONFIG = {
    g: 10.5,        // gravity m/s^2
    dt: 1 / 120,    // sim step
    maxT: 5,        // safety cap (s)
    magnus: 0.42,   // sidespin -> lateral acceleration coefficient
    magnusDip: 0.05,// hard spin adds a little downward "dip" into the corner
    drag: 0.07,     // linear air drag
  };

  /* default pitch geometry (metres) — real goal is 7.32 x 2.44 */
  const WORLD = {
    D: 22,          // ball -> goal distance
    goalHalf: 3.66, // half goal width
    goalHeight: 2.44,
    wall: null,     // { z, halfW, height, cx }
    keeper: null,   // { cover, reach, lowReach, height, cx }
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makeLaunch(v0, yaw, elev, spin) {
    const ce = Math.cos(elev), se = Math.sin(elev);
    return {
      x: 0, y: 0, z: 0,
      vx: v0 * ce * Math.sin(yaw),
      vy: v0 * se,
      vz: v0 * ce * Math.cos(yaw),
      spin: spin,
    };
  }

  /* integrate a single shot; returns { path:[{x,y,z,t}], outcome } */
  function simulate(launch, world, cfg) {
    world = Object.assign({}, WORLD, world);
    cfg = Object.assign({}, CONFIG, cfg);
    const { g, dt, maxT, magnus, magnusDip, drag } = cfg;

    let { x, y, z, vx, vy, vz, spin } = launch;
    const path = [{ x, y, z, t: 0 }];
    let t = 0, outcome = null;

    while (t < maxT) {
      const px = x, py = y, pz = z;

      const ax = magnus * spin * vz - drag * vx;
      const ay = -g - drag * vy - magnusDip * Math.abs(spin) * Math.max(0, vz);
      const az = -drag * vz;

      vx += ax * dt; vy += ay * dt; vz += az * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      t += dt;
      path.push({ x, y, z, t });

      /* wall plane */
      if (world.wall && pz < world.wall.z && z >= world.wall.z) {
        const f = (world.wall.z - pz) / (z - pz);
        const wx = lerp(px, x, f), wy = lerp(py, y, f);
        if (Math.abs(wx - (world.wall.cx || 0)) <= world.wall.halfW && wy >= 0 && wy <= world.wall.height) {
          outcome = { type: "wall", point: { x: wx, y: wy, z: world.wall.z } };
          break;
        }
      }

      /* goal plane */
      if (pz < world.D && z >= world.D) {
        const f = (world.D - pz) / (z - pz);
        outcome = resolveGoal(lerp(px, x, f), lerp(py, y, f), world);
        break;
      }

      /* hit the deck before reaching the goal */
      if (y <= 0 && vy < 0) {
        outcome = { type: "short", point: { x, y: 0, z } };
        break;
      }
      if (vz <= 0.1) { outcome = { type: "short", point: { x, y, z } }; break; }
    }
    if (!outcome) {
      const last = path[path.length - 1];
      outcome = { type: "short", point: { x: last.x, y: last.y, z: last.z } };
    }
    return { path, outcome };
  }

  function resolveGoal(gx, gy, world) {
    const pt = { x: gx, y: gy, z: world.D };
    if (gy > world.goalHeight) return { type: "over", point: pt };
    if (Math.abs(gx) > world.goalHalf) return { type: "wide", point: pt };
    if (gy < 0) return { type: "short", point: { x: gx, y: 0, z: world.D } };
    if (world.keeper && isSaved(gx, gy, world.keeper)) return { type: "save", point: pt };
    const topCorner = gy > world.goalHeight * 0.6 && Math.abs(gx) > world.goalHalf * 0.55;
    return { type: "goal", point: pt, topCorner };
  }

  /* keeper guards a central band, can dive low to "reach", but the top
     corners are always open — beat him upstairs. */
  function isSaved(gx, gy, k) {
    const dx = Math.abs(gx - (k.cx || 0));
    if (gy > (k.height || 1.9)) return false;               // over the keeper
    if (dx <= (k.cover || 1.3)) return true;                // central
    if (dx <= (k.reach || 2.6) && gy <= (k.lowReach || 1.4)) return true; // diving low
    return false;
  }

  function findGoalCrossing(path, D) {
    for (let i = 1; i < path.length; i++) {
      if (path[i - 1].z < D && path[i].z >= D) {
        const f = (D - path[i - 1].z) / (path[i].z - path[i - 1].z);
        return { x: lerp(path[i - 1].x, path[i].x, f), y: lerp(path[i - 1].y, path[i].y, f), reached: true };
      }
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, reached: false };
  }

  /* numerically solve launch angles so a SPIN-FREE shot would strike `target`
     (x,y at the goal plane). The real shot then adds spin and curls off this
     aim line — which is the whole skill. */
  function solveAimAngles(target, v0, world, spin) {
    world = Object.assign({}, WORLD, world);
    spin = spin || 0;
    // Solve on an OPEN field (no wall/keeper) so collisions can't corrupt the aim,
    // and INCLUDE the spin so the curled ball actually lands on the target.
    const open = { D: world.D, goalHalf: world.goalHalf, goalHeight: world.goalHeight };
    let yaw = Math.atan2(target.x, world.D);
    let elev = Math.atan2(target.y + 0.6, world.D) + 0.14;
    for (let i = 0; i < 12; i++) {
      const sim = simulate(makeLaunch(v0, yaw, elev, spin), open);
      const c = findGoalCrossing(sim.path, world.D);
      const ex = target.x - c.x, ey = target.y - c.y;
      if (Math.abs(ex) < 0.02 && Math.abs(ey) < 0.02) break;
      yaw += Math.atan2(ex, world.D) * 0.95;
      elev += (ey / world.D) * 0.95;
      yaw = clamp(yaw, -0.95, 0.95);
      elev = clamp(elev, -0.15, 1.3);
    }
    return { yaw, elev };
  }

  /* Aim at a goal-plane target with given power + spin. The ball LANDS on the
     target (solved on an open field); the real shot below may still meet a
     wall or keeper — which is the whole game on later levels. */
  function simulateAimed(target, v0, spin, world) {
    const { yaw, elev } = solveAimAngles(target, v0, world, spin);
    return simulate(makeLaunch(v0, yaw, elev, spin), world);
  }

  return { CONFIG, WORLD, makeLaunch, simulate, resolveGoal, isSaved, findGoalCrossing, solveAimAngles, simulateAimed };
});
