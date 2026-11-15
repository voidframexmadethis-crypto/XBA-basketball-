import * as THREE from 'three';
import {
  HALF_COURT_X,
  HALF_COURT_Z,
  HOOP_X,
  PLAYER_BASE_SPEED,
  PLAYER_DEFEND_SPEED,
  PLAYER_SPRINT_SPEED,
} from './constants';
import type { PlayerActionState, TeamId } from './types';

export interface SimPlayer {
  id: string;
  team: TeamId;
  roleIndex: number; // 0..4 (PG, SG, SF, PF, C)
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  facingYaw: number;
  verticalVel: number;
  action: PlayerActionState;
  actionTimer: number;
  stamina: number;
  stealCooldown: number;
  aiShootTimer: number;
  aiPassTimer: number;
  aiCutTimer: number;
  aiScreenTimer: number;
  aiHoldTime: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  heightMeters: number;
}

export interface AiMoveIntent {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  defend: boolean;
  wantsShoot: boolean;
  wantsPass: boolean;
  passTargetId?: string;
  wantsSteal: boolean;
  wantsBlock: boolean;
}

export interface PassEvaluation {
  target: SimPlayer | null;
  score: number;
  openness: number;
  laneClearance: number;
  targetDistToHoop: number;
}

const _desired = new THREE.Vector3();

// Minimum distance from point (px, pz) to segment (ax, az) -> (bx, bz) in XZ plane
export function distancePointToSegmentXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 0.0001) {
    return Math.hypot(px - ax, pz - az);
  }
  const apx = px - ax;
  const apz = pz - az;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

function nearestOpponentDist(
  x: number,
  z: number,
  team: TeamId,
  allPlayers: SimPlayer[]
): number {
  let minD = Infinity;
  for (let i = 0; i < allPlayers.length; i++) {
    const other = allPlayers[i];
    if (other.team === team) continue;
    const d = Math.hypot(other.position.x - x, other.position.z - z);
    if (d < minD) minD = d;
  }
  return minD;
}

export function selectBestPassTarget(
  passer: SimPlayer,
  allPlayers: SimPlayer[],
  attackDir: -1 | 1,
  lastPasserId?: string | null,
  preferredDirX = 0,
  preferredDirZ = 0,
  humanPlayerId?: string | null
): PassEvaluation {
  const targetHoopX = attackDir * HOOP_X;
  const hasPrefDir = Math.hypot(preferredDirX, preferredDirZ) > 0.25;
  const passerDistToHoop = Math.hypot(targetHoopX - passer.position.x, passer.position.z);

  let bestTarget: SimPlayer | null = null;
  let bestScore = -Infinity;
  let bestOpenness = 0;
  let bestLane = 0;
  let bestTargetDistToHoop = Infinity;

  for (let i = 0; i < allPlayers.length; i++) {
    const tm = allPlayers[i];
    if (tm.team !== passer.team || tm.id === passer.id) continue;

    const dx = tm.position.x - passer.position.x;
    const dz = tm.position.z - passer.position.z;
    const passDist = Math.hypot(dx, dz);
    if (passDist < 0.8) continue;

    // 1. Passing lane clearance against all defenders
    let minLaneClearance = Infinity;
    for (let j = 0; j < allPlayers.length; j++) {
      const def = allPlayers[j];
      if (def.team === passer.team) continue;
      // Ignore defenders hugging the passer right behind the release or far behind receiver
      const segDist = distancePointToSegmentXZ(
        def.position.x,
        def.position.z,
        passer.position.x,
        passer.position.z,
        tm.position.x,
        tm.position.z
      );
      const distFromPasser = Math.hypot(def.position.x - passer.position.x, def.position.z - passer.position.z);
      if (distFromPasser > 0.9 && segDist < minLaneClearance) {
        minLaneClearance = segDist;
      }
    }

    // 2. Receiver openness
    const tmOpenness = nearestOpponentDist(tm.position.x, tm.position.z, passer.team, allPlayers);
    const tmDistToHoop = Math.hypot(targetHoopX - tm.position.x, tm.position.z);

    let score = 0;

    // Penalize congested passing lanes heavily so AI avoids throwing straight to defenders
    if (minLaneClearance < 0.72) {
      score -= 18;
    } else if (minLaneClearance < 1.15) {
      score -= (1.15 - minLaneClearance) * 8;
    } else {
      score += Math.min(3.0, minLaneClearance * 0.9);
    }

    // Reward open teammates, especially in scoring range
    score += Math.min(4.8, tmOpenness * 1.45);
    if (tmOpenness < 1.25) {
      score -= (1.25 - tmOpenness) * 5.0;
    }

    // Reward rim cuts / paint ducks when open
    if (tmDistToHoop < 3.9 && tmOpenness > 1.45) {
      score += 5.2;
    } else if (tmDistToHoop < 8.4 && tmOpenness > 1.8) {
      // Open perimeter / mid-range shooter
      score += 3.2;
    }

    // Advancement bonus (progressing ball toward attacking basket)
    const advancement = (tm.position.x - passer.position.x) * attackDir;
    score += THREE.MathUtils.clamp(advancement * 0.35, -1.5, 3.8);

    // Prefer teammates in better scoring position than passer
    if (tmDistToHoop < passerDistToHoop - 1.5) {
      score += 1.6;
    }

    // Distance moderation (avoid ultra-long cross-court passes unless wide open ahead)
    score -= Math.max(0, passDist - 8.5) * 0.35;

    // Avoid immediate ping-pong back to the player who just passed to us unless wide open for a shot
    if (lastPasserId && tm.id === lastPasserId && passer.aiHoldTime < 0.95 && tmOpenness < 2.2) {
      score -= 3.2;
    }

    // Recognize and cooperate with open human teammate (especially in frontcourt scoring spots)
    if (humanPlayerId && tm.id === humanPlayerId && tmOpenness > 1.45 && minLaneClearance > 0.72) {
      score += 2.6;
      if (tmDistToHoop < 8.8) {
        score += 1.4;
      }
    }

    // Optional directional hint for human-controlled passes
    if (hasPrefDir) {
      score += ((dx * preferredDirX + dz * preferredDirZ) / passDist) * 10.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = tm;
      bestOpenness = tmOpenness;
      bestLane = minLaneClearance;
      bestTargetDistToHoop = tmDistToHoop;
    }
  }

  return {
    target: bestTarget,
    score: bestScore,
    openness: bestOpenness,
    laneClearance: bestLane,
    targetDistToHoop: bestTargetDistToHoop,
  };
}

function getReboundRank(
  player: SimPlayer,
  allPlayers: SimPlayer[],
  anchorX: number,
  anchorZ: number,
  humanPlayerId?: string | null
): number {
  const myDist = Math.hypot(player.position.x - anchorX, player.position.z - anchorZ);
  let rank = 0;
  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    if (p.team !== player.team || p.id === player.id) continue;
    if (humanPlayerId && p.id === humanPlayerId) continue;
    const d = Math.hypot(p.position.x - anchorX, p.position.z - anchorZ);
    // Bigs (PF/C) get slight priority bias on glass
    const pBias = p.roleIndex >= 3 ? -0.75 : 0;
    const myBias = player.roleIndex >= 3 ? -0.75 : 0;
    if (d + pBias < myDist + myBias) {
      rank += 1;
    }
  }
  return rank;
}

export function computeAiIntent(
  player: SimPlayer,
  allPlayers: SimPlayer[],
  ballPos: THREE.Vector3,
  ballState: 'held' | 'free' | 'pass' | 'shot',
  ballHandler: SimPlayer | null,
  offenseTeam: TeamId,
  shotClock: number,
  dt: number,
  lastPasserId?: string | null,
  passTargetId?: string | null,
  humanPlayerId?: string | null
): AiMoveIntent {
  const intent: AiMoveIntent = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    defend: false,
    wantsShoot: false,
    wantsPass: false,
    wantsSteal: false,
    wantsBlock: false,
  };

  // Home attacks +X (+HOOP_X), Away attacks -X (-HOOP_X)
  const attackDir: -1 | 1 = player.team === 'home' ? 1 : -1;
  const targetHoopX = attackDir * HOOP_X;
  const ownHoopX = -attackDir * HOOP_X;

  // 0. Incoming Pass Reception: intended receiver comes to meet the pass cleanly
  if (ballState === 'pass' && passTargetId && player.id === passTargetId) {
    const dx = ballPos.x - player.position.x;
    const dz = ballPos.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.2) {
      intent.moveX = dx / dist;
      intent.moveZ = dz / dist;
      intent.sprint = dist > 1.3;
    }
    return intent;
  }

  // 1. Loose Ball / Rebound Crash / Pass Interception
  if (ballState === 'free' || (ballState === 'shot' && ballPos.y < 3.9)) {
    const offAttackDir: -1 | 1 = offenseTeam === 'home' ? 1 : -1;
    const shotHoopX = offAttackDir * HOOP_X;
    // On an airborne shot, target the rebound pocket ~1.35m in front of the rim
    const anchorX =
      ballState === 'shot'
        ? THREE.MathUtils.lerp(ballPos.x, shotHoopX - offAttackDir * 1.35, 0.55)
        : ballPos.x;
    const anchorZ = ballState === 'shot' ? ballPos.z * 0.5 : ballPos.z;

    const maxCrashers = ballState === 'free' ? 2 : 2;
    const rank = getReboundRank(player, allPlayers, anchorX, anchorZ, humanPlayerId);

    if (rank < maxCrashers) {
      const dx = anchorX - player.position.x;
      const dz = anchorZ - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.16) {
        intent.moveX = dx / dist;
        intent.moveZ = dz / dist;
        intent.sprint = dist > 1.8;
      }
      if (
        ballState === 'shot' &&
        player.team !== offenseTeam &&
        Math.hypot(ballPos.x - player.position.x, ballPos.z - player.position.z) < 2.1 &&
        ballPos.y > 1.95 &&
        ballPos.y < 3.45
      ) {
        intent.wantsBlock = true;
      } else if (
        ballState === 'free' &&
        Math.hypot(ballPos.x - player.position.x, ballPos.z - player.position.z) < 1.35 &&
        ballPos.y > 1.75 &&
        ballPos.y < 3.1
      ) {
        intent.wantsBlock = true;
      }
      return intent;
    }

    // Non-crashing teammates: leak out on offense or get back in transition defense
    const retreatX =
      player.team === offenseTeam
        ? THREE.MathUtils.clamp(shotHoopX - offAttackDir * 6.5, -HALF_COURT_X + 2, HALF_COURT_X - 2)
        : THREE.MathUtils.clamp(ownHoopX + attackDir * 5.5, -HALF_COURT_X + 2, HALF_COURT_X - 2);
    const dx = retreatX - player.position.x;
    const dz = THREE.MathUtils.clamp(player.roleIndex % 2 === 0 ? -2.4 : 2.4, -5, 5) - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      intent.moveX = dx / dist;
      intent.moveZ = dz / dist;
      intent.sprint = dist > 3.5;
    }
    return intent;
  }

  // Track ball-handling hold time & timers
  const isBallHandler = ballState === 'held' && ballHandler?.id === player.id;
  if (isBallHandler) {
    player.aiHoldTime += dt;
  } else {
    player.aiHoldTime = 0;
  }

  // 2. Player has the ball (AI Offense Decision Engine)
  if (isBallHandler) {
    const distToHoop = Math.hypot(targetHoopX - player.position.x, player.position.z);
    const dxToHoop = targetHoopX - player.position.x;
    const dzToHoop = -player.position.z;

    // Analyze defensive pressure & driving lane
    let nearestDefDist = Infinity;
    let secondDefDist = Infinity;
    let nearestDef: SimPlayer | null = null;
    let laneBlocker: SimPlayer | null = null;
    let laneBlockerDist = Infinity;

    for (let i = 0; i < allPlayers.length; i++) {
      const def = allPlayers[i];
      if (def.team === player.team) continue;
      const d = Math.hypot(def.position.x - player.position.x, def.position.z - player.position.z);
      if (d < nearestDefDist) {
        secondDefDist = nearestDefDist;
        nearestDefDist = d;
        nearestDef = def;
      } else if (d < secondDefDist) {
        secondDefDist = d;
      }

      // Check if defender is directly between ball handler and hoop
      const defToHoop = Math.hypot(targetHoopX - def.position.x, def.position.z);
      if (defToHoop < distToHoop + 0.3) {
        const laneDist = distancePointToSegmentXZ(
          def.position.x,
          def.position.z,
          player.position.x,
          player.position.z,
          targetHoopX,
          0
        );
        if (laneDist < 1.25 && d < laneBlockerDist) {
          laneBlockerDist = d;
          laneBlocker = def;
        }
      }
    }

    const passEval = selectBestPassTarget(
      player,
      allPlayers,
      attackDir,
      lastPasserId,
      0,
      0,
      humanPlayerId
    );
    const inFrontCourt = attackDir === 1 ? player.position.x > 0.7 : player.position.x < -0.7;

    player.aiPassTimer -= dt;
    player.aiShootTimer -= dt;

    // Backcourt advancement & fast-break outlet pass
    if (!inFrontCourt) {
      if (
        passEval.target &&
        (passEval.target.position.x - player.position.x) * attackDir > 3.2 &&
        passEval.laneClearance > 1.1 &&
        passEval.openness > 1.65 &&
        player.aiHoldTime > 0.35
      ) {
        intent.wantsPass = true;
        intent.passTargetId = passEval.target.id;
        player.aiPassTimer = 1.2 + Math.random() * 0.9;
        return intent;
      }

      // Advance smoothly toward frontcourt, steering around press defender
      let steerZ = -player.position.z * 0.12;
      if (nearestDef && nearestDefDist < 2.6) {
        const dzAway = player.position.z - nearestDef.position.z;
        steerZ += (dzAway >= 0 ? 1 : -1) * 0.55;
      }
      intent.moveX = attackDir;
      intent.moveZ = THREE.MathUtils.clamp(steerZ, -0.7, 0.7);
      intent.sprint = true;
      const mag = Math.hypot(intent.moveX, intent.moveZ);
      intent.moveX /= mag;
      intent.moveZ /= mag;
      return intent;
    }

    // Half-court Shooting Evaluation
    const isWideOpen = nearestDefDist > 2.25;
    const isOpen = nearestDefDist > 1.68;
    const clearRimFinish =
      distToHoop < 2.95 && (!laneBlocker || laneBlockerDist > 1.35 || player.aiHoldTime > 0.45);
    const openJumper = distToHoop < 8.45 && (isWideOpen || (isOpen && player.aiShootTimer <= 0));
    const urgentShot =
      (shotClock < 4.2 && distToHoop < 9.8 && nearestDefDist > 1.0) ||
      (shotClock < 1.9 && distToHoop < 12.2);

    // If driving into heavy paint help while a perimeter shooter is wide open, kick it out!
    const shouldKickOut =
      distToHoop < 5.2 &&
      laneBlocker !== null &&
      laneBlockerDist < 1.85 &&
      passEval.target !== null &&
      passEval.openness > 2.05 &&
      passEval.laneClearance > 0.95 &&
      shotClock > 3.5;

    if (!shouldKickOut && (clearRimFinish || openJumper || urgentShot)) {
      intent.wantsShoot = true;
      player.aiShootTimer = 0.75 + Math.random() * 0.75;
      return intent;
    }

    // Passing Evaluation
    const doubleTeamed = nearestDefDist < 1.55 && secondDefDist < 2.45;
    const heavilyPressured = nearestDefDist < 1.28;
    const openCutter =
      passEval.target !== null &&
      passEval.targetDistToHoop < 4.0 &&
      passEval.openness > 1.55 &&
      passEval.laneClearance > 0.85;
    const openHuman =
      humanPlayerId !== undefined &&
      humanPlayerId !== null &&
      passEval.target?.id === humanPlayerId &&
      passEval.openness > 1.75 &&
      passEval.laneClearance > 0.88 &&
      passEval.targetDistToHoop < 8.8 &&
      player.aiHoldTime > 0.5;
    const swingReady =
      player.aiPassTimer <= 0 && passEval.target !== null && passEval.score > 1.4;
    const holdTooLong =
      player.aiHoldTime > 2.8 && passEval.target !== null && passEval.laneClearance > 0.78;

    if (
      passEval.target &&
      player.aiHoldTime > 0.28 &&
      (shouldKickOut ||
        ((doubleTeamed || heavilyPressured) && passEval.laneClearance > 0.75 && passEval.score > 0.2) ||
        openCutter ||
        openHuman ||
        swingReady ||
        holdTooLong)
    ) {
      intent.wantsPass = true;
      intent.passTargetId = passEval.target.id;
      player.aiPassTimer = 1.15 + Math.random() * 1.1;
      return intent;
    }

    // Attack driving lane around defender toward rim
    const len = Math.max(0.001, Math.hypot(dxToHoop, dzToHoop));
    let dirX = dxToHoop / len;
    let dirZ = dzToHoop / len;

    if (laneBlocker && laneBlockerDist < 3.2) {
      // Angle around the lane blocker toward open side of the floor
      const perpX = -dirZ;
      const perpZ = dirX;
      const sideSign =
        (player.position.z - laneBlocker.position.z) * perpZ >= 0 ? 1 : -1;
      dirX += perpX * sideSign * 0.62;
      dirZ += perpZ * sideSign * 0.62;
    } else if (nearestDef && nearestDefDist < 2.6) {
      const sideSign = player.position.z >= nearestDef.position.z ? 1 : -1;
      dirZ += sideSign * 0.28;
    }

    const driveMag = Math.max(0.001, Math.hypot(dirX, dirZ));
    intent.moveX = dirX / driveMag;
    intent.moveZ = dirZ / driveMag;
    intent.sprint = distToHoop < 7.8 && nearestDefDist > 1.35;
    return intent;
  }

  // 3. Off-ball Offense (Dynamic Spacing, Screens / Pick-and-Roll, Basket Cuts)
  if (player.team === offenseTeam) {
    const ballSide = ballHandler ? (ballHandler.position.z >= 0 ? 1 : -1) : 1;
    const handlerDistToHoop = ballHandler
      ? Math.hypot(targetHoopX - ballHandler.position.x, ballHandler.position.z)
      : 9.0;
    const handlerInFront = ballHandler
      ? attackDir === 1
        ? ballHandler.position.x > 0.4
        : ballHandler.position.x < -0.4
      : false;

    player.aiCutTimer -= dt;
    if (player.aiCutTimer <= -2.4) {
      player.aiCutTimer = 2.6 + Math.random() * 2.4;
    }
    player.aiScreenTimer -= dt;
    if (player.aiScreenTimer <= -2.6) {
      player.aiScreenTimer = 3.2 + Math.random() * 2.0;
    }

    let targetX = targetHoopX - attackDir * 7.5;
    let targetZ = 0;

    // Pick-and-Roll Big (C sets ball screen if perimeter ball handler is probing, then rolls!)
    const isScreenerRole =
      (player.roleIndex === 4 || (player.roleIndex === 3 && ballHandler?.roleIndex === 4)) &&
      ballHandler &&
      ballHandler.id !== player.id;

    if (isScreenerRole && handlerInFront && handlerDistToHoop > 4.6 && handlerDistToHoop < 9.5) {
      // Find ball handler's primary defender to set screen beside them
      let bhDef: SimPlayer | null = null;
      let bhDefDist = Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const d = allPlayers[i];
        if (d.team === player.team) continue;
        const dist = Math.hypot(d.position.x - ballHandler.position.x, d.position.z - ballHandler.position.z);
        if (dist < bhDefDist) {
          bhDefDist = dist;
          bhDef = d;
        }
      }

      if (player.aiScreenTimer > 0.8 && bhDef && bhDefDist < 3.4) {
        // Set ball screen slightly to the middle/rim side of the defender
        const screenSideZ = ballHandler.position.z >= 0 ? -1.15 : 1.15;
        targetX = bhDef.position.x - attackDir * 0.35;
        targetZ = bhDef.position.z + screenSideZ;
      } else {
        // Roll hard to the basket after screening!
        targetX = targetHoopX - attackDir * 2.15;
        targetZ = -ballSide * 0.95;
      }
    } else if (player.roleIndex === 0) {
      // PG: Top / weak-side safety valve & catch-and-shoot arc
      targetX = targetHoopX - attackDir * 7.8;
      targetZ = -ballSide * 1.6;
    } else if (player.roleIndex === 1) {
      // SG: Strong-side wing / corner spacing
      const bhIsWing = ballHandler && Math.abs(ballHandler.position.z) > 3.2 && ballHandler.position.z * ballSide > 0;
      targetX = targetHoopX - attackDir * (bhIsWing ? 2.1 : 6.7);
      targetZ = ballSide * (bhIsWing ? 6.5 : 5.4);
    } else if (player.roleIndex === 2) {
      // SF: Weak-side wing OR timed baseline/backdoor cut
      if (player.aiCutTimer < 0 && player.aiCutTimer > -1.35 && handlerInFront) {
        targetX = targetHoopX - attackDir * 2.05;
        targetZ = -ballSide * 1.15;
      } else {
        targetX = targetHoopX - attackDir * 6.8;
        targetZ = -ballSide * 5.6;
      }
    } else if (player.roleIndex === 3) {
      // PF: Weak-side corner OR flash cut to high-post/rim
      if (player.aiCutTimer < 0 && player.aiCutTimer > -1.45 && handlerInFront) {
        targetX = targetHoopX - attackDir * 3.8;
        targetZ = -ballSide * 1.5;
      } else {
        targetX = targetHoopX - attackDir * 2.25;
        targetZ = -ballSide * 6.35;
      }
    } else {
      // C: Dunker spot / low-post opposite ball
      targetX = targetHoopX - attackDir * 2.35;
      targetZ = -ballSide * 2.05;
    }

    // Anti-crowding separation from teammates so players never fight for the same spot
    for (let i = 0; i < allPlayers.length; i++) {
      const tm = allPlayers[i];
      if (tm.team !== player.team || tm.id === player.id) continue;
      const sdx = targetX - tm.position.x;
      const sdz = targetZ - tm.position.z;
      const sd = Math.hypot(sdx, sdz);
      if (sd < 2.6 && sd > 0.01) {
        targetX += (sdx / sd) * (2.6 - sd);
        targetZ += (sdz / sd) * (2.6 - sd);
      }
    }

    // Relocate slightly away from defender if covered tightly so teammate has an open passing angle
    const myDefDist = nearestOpponentDist(targetX, targetZ, player.team, allPlayers);
    if (myDefDist < 1.35 && !isScreenerRole) {
      for (let i = 0; i < allPlayers.length; i++) {
        const def = allPlayers[i];
        if (def.team === player.team) continue;
        const ddx = targetX - def.position.x;
        const ddz = targetZ - def.position.z;
        const dd = Math.hypot(ddx, ddz);
        if (dd < 1.5 && dd > 0.01) {
          targetX += (ddx / dd) * 1.1;
          targetZ += (ddz / dd) * 1.1;
        }
      }
    }

    targetX = THREE.MathUtils.clamp(targetX, -HALF_COURT_X + 1.0, HALF_COURT_X - 1.0);
    targetZ = THREE.MathUtils.clamp(targetZ, -HALF_COURT_Z + 0.9, HALF_COURT_Z - 0.9);

    _desired.set(targetX, 0, targetZ);
    const dx = _desired.x - player.position.x;
    const dz = _desired.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.38) {
      intent.moveX = dx / dist;
      intent.moveZ = dz / dist;
      intent.sprint = dist > 3.6 || (player.aiCutTimer < 0 && player.aiCutTimer > -1.4);
    }
    return intent;
  }

  // 4. Realistic Defensive AI (On-Ball Containment, Screen Switching, Paint Help, Shot Contest)
  // Identify current on-ball defender (prefer active AI defender if human isn't tightly on-ball)
  let onBallDef: SimPlayer | null = null;
  let onBallDefDist = Infinity;
  if (ballHandler) {
    for (let i = 0; i < allPlayers.length; i++) {
      const def = allPlayers[i];
      if (def.team !== player.team) continue;
      const d = Math.hypot(def.position.x - ballHandler.position.x, def.position.z - ballHandler.position.z);
      if (humanPlayerId && def.id === humanPlayerId && d >= 1.55) continue;
      // Slight tie-break bias toward roleIndex matchup to avoid constant flickering
      const bias = def.roleIndex === ballHandler.roleIndex ? -0.55 : 0;
      if (d + bias < onBallDefDist) {
        onBallDefDist = d + bias;
        onBallDef = def;
      }
    }
  }

  // Determine if this player should play Paint Help Defense (rim protector)
  const bhDistToOwnHoop = ballHandler
    ? Math.hypot(ownHoopX - ballHandler.position.x, ballHandler.position.z)
    : Infinity;
  const bhBeatPrimary =
    ballHandler &&
    onBallDef &&
    Math.hypot(ownHoopX - ballHandler.position.x, ballHandler.position.z) <
      Math.hypot(ownHoopX - onBallDef.position.x, onBallDef.position.z) + 0.4;

  // Pick AI defensive big (highest roleIndex who isn't on-ball defender or human) for help rotation
  let helpBigId: string | null = null;
  let highestRole = -1;
  for (let i = 0; i < allPlayers.length; i++) {
    const def = allPlayers[i];
    if (def.team !== player.team) continue;
    if (humanPlayerId && def.id === humanPlayerId) continue;
    if (onBallDef && def.id === onBallDef.id) continue;
    if (def.roleIndex > highestRole) {
      highestRole = def.roleIndex;
      helpBigId = def.id;
    }
  }

  if (
    ballHandler &&
    player.id === helpBigId &&
    bhDistToOwnHoop < 7.4 &&
    (bhBeatPrimary || bhDistToOwnHoop < 4.5)
  ) {
    // Rotate to protect the paint / meet driver at the rim!
    const helpX = THREE.MathUtils.lerp(ownHoopX + attackDir * 2.1, ballHandler.position.x, 0.25);
    const helpZ = THREE.MathUtils.clamp(ballHandler.position.z * 0.35, -1.6, 1.6);
    const dx = helpX - player.position.x;
    const dz = helpZ - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      intent.moveX = dx / dist;
      intent.moveZ = dz / dist;
      intent.sprint = dist > 2.2 || bhDistToOwnHoop < 4.2;
    }
    intent.defend = dist < 1.6;
    const distToBh = Math.hypot(ballHandler.position.x - player.position.x, ballHandler.position.z - player.position.z);
    if (
      distToBh < 2.25 &&
      (ballHandler.action === 'shoot' ||
        ballHandler.action === 'layup' ||
        ballHandler.action === 'dunk' ||
        ballHandler.verticalVel > 0.6)
    ) {
      intent.wantsBlock = true;
    }
    return intent;
  }

  // Assign matchup: onBallDef guards ballHandler; others guard their roleIndex or cover displaced matchup
  let matchup: SimPlayer | null = null;
  if (onBallDef && onBallDef.id === player.id && ballHandler) {
    matchup = ballHandler;
  } else {
    for (let i = 0; i < allPlayers.length; i++) {
      const other = allPlayers[i];
      if (other.team !== player.team && other.roleIndex === player.roleIndex) {
        matchup = other;
        break;
      }
    }
    // If our natural matchup is guarded by the switched onBallDef, cover the remaining unguarded opponent
    if (matchup && ballHandler && matchup.id === ballHandler.id && onBallDef && onBallDef.id !== player.id) {
      for (let i = 0; i < allPlayers.length; i++) {
        const other = allPlayers[i];
        if (other.team !== player.team && other.roleIndex === onBallDef.roleIndex) {
          matchup = other;
          break;
        }
      }
    }
  }
  if (!matchup) {
    matchup = ballHandler;
  }

  if (matchup) {
    const isGuardingBall = ballHandler?.id === matchup.id;
    const matchupDistToHoop = Math.hypot(ownHoopX - matchup.position.x, matchup.position.z);

    // Lead matchup velocity slightly on-ball to cut off drives instead of trailing
    const leadX = isGuardingBall ? matchup.velocity.x * 0.16 : matchup.velocity.x * 0.08;
    const leadZ = isGuardingBall ? matchup.velocity.z * 0.16 : matchup.velocity.z * 0.08;
    const targetManX = matchup.position.x + leadX;
    const targetManZ = matchup.position.z + leadZ;

    const toOwnX = ownHoopX - targetManX;
    const toOwnZ = -targetManZ;
    const toOwnLen = Math.max(0.001, Math.hypot(toOwnX, toOwnZ));

    const cushion = isGuardingBall
      ? matchupDistToHoop < 8.8
        ? 1.12
        : 1.65
      : matchupDistToHoop < 8.5
      ? 1.55
      : 2.35;

    let guardX = targetManX + (toOwnX / toOwnLen) * cushion;
    let guardZ = targetManZ + (toOwnZ / toOwnLen) * cushion;

    // Off-ball defenders shade slightly toward the ball/paint (help positioning)
    if (!isGuardingBall && ballHandler) {
      const ballDist = Math.hypot(ballHandler.position.x - matchup.position.x, ballHandler.position.z - matchup.position.z);
      const helpShade = THREE.MathUtils.clamp((ballDist - 3.5) * 0.04, 0, 0.28);
      guardX = THREE.MathUtils.lerp(guardX, ownHoopX + attackDir * 2.4, helpShade);
      guardZ = THREE.MathUtils.lerp(guardZ, ballHandler.position.z * 0.3, helpShade);
    }

    guardX = THREE.MathUtils.clamp(guardX, -HALF_COURT_X + 0.6, HALF_COURT_X - 0.6);
    guardZ = THREE.MathUtils.clamp(guardZ, -HALF_COURT_Z + 0.6, HALF_COURT_Z - 0.6);

    const dx = guardX - player.position.x;
    const dz = guardZ - player.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.22) {
      intent.moveX = dx / dist;
      intent.moveZ = dz / dist;
      intent.sprint = dist > 2.5 || (isGuardingBall && dist > 1.45);
    }

    const distToBallHandler = ballHandler
      ? Math.hypot(ballHandler.position.x - player.position.x, ballHandler.position.z - player.position.z)
      : Infinity;

    intent.defend = isGuardingBall && dist < 1.85;

    // Active Shot Contest / Block on Jump Shot, Layup, or Dunk
    if (
      isGuardingBall &&
      ballHandler &&
      distToBallHandler < 2.35 &&
      (ballHandler.action === 'shoot' ||
        ballHandler.action === 'layup' ||
        ballHandler.action === 'dunk' ||
        ballHandler.verticalVel > 0.6)
    ) {
      intent.wantsBlock = true;
    }

    // Smart Steal Attempt when positioned squarely in front of ball handler
    if (
      isGuardingBall &&
      ballHandler &&
      ballHandler.aiHoldTime > 0.6 &&
      distToBallHandler < 1.05 &&
      player.stealCooldown <= 0 &&
      ballHandler.position.y <= 0.1 &&
      Math.random() < 0.008
    ) {
      intent.wantsSteal = true;
    }
  }

  return intent;
}

export function getPlayerMoveSpeed(sprint: boolean, defend: boolean, stamina: number): number {
  if (defend) return PLAYER_DEFEND_SPEED;
  if (sprint && stamina > 8) return PLAYER_SPRINT_SPEED;
  return PLAYER_BASE_SPEED;
}
