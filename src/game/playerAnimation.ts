import * as THREE from 'three';
import type { PlayerRig } from './playerModel';
import type { PlayerActionState } from './types';

export interface PlayerAnimState {
  stridePhase: number;
  dribblePhase: number;
  dribbleHand: 'right' | 'left';
  actionTimer: number;
}

export function updatePlayerAnimation(
  rig: PlayerRig,
  anim: PlayerAnimState,
  action: PlayerActionState,
  speed: number,
  heightOffGround: number,
  hasBall: boolean,
  isDefending: boolean,
  dt: number
) {
  const damp = (curr: number, target: number, lambda: number) =>
    THREE.MathUtils.damp(curr, target, lambda, dt);

  // Scale contact shadow cleanly with jump height so player never looks disconnected
  const shadowScale = Math.max(0.55, 1 - heightOffGround * 0.25);
  rig.contactShadow.scale.setScalar(shadowScale);
  (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
    0.18,
    0.52 - heightOffGround * 0.22
  );

  // Advance gait cycle proportionally to speed
  if (heightOffGround < 0.06 && speed > 0.25) {
    anim.stridePhase += dt * (3.8 + speed * 1.45);
  } else {
    // Gently settle stride phase back to neutral
    anim.stridePhase += dt * 0.4;
  }

  anim.dribblePhase += dt * (7.2 + speed * 0.35);

  const isRunning = speed > 0.35 && heightOffGround < 0.06;
  const runWeight = THREE.MathUtils.clamp(speed / 6.5, 0, 1);

  // Target joint angles
  let pelvisY = 0.96;
  let torsoLeanX = 0;
  let torsoTwistY = 0;

  let lHipX = 0;
  let lKneeX = 0;
  let rHipX = 0;
  let rKneeX = 0;

  let lShX = 0;
  let lShZ = 0.14;
  let lElbX = -0.35;

  let rShX = 0;
  let rShZ = -0.14;
  let rElbX = -0.35;

  if (action === 'shoot' || action === 'jump') {
    // Athletic jump shot release posture
    pelvisY = 0.98;
    torsoLeanX = -0.06;
    lHipX = -0.18;
    lKneeX = 0.35;
    rHipX = -0.12;
    rKneeX = 0.28;

    // Shooting arms raised high with wrist follow-through
    rShX = -2.55;
    rShZ = -0.08;
    rElbX = -0.35;
    lShX = -2.25;
    lShZ = 0.18;
    lElbX = -0.55;
  } else if (action === 'layup') {
    pelvisY = 0.98;
    torsoLeanX = 0.12;
    lHipX = -0.65;
    lKneeX = 1.05;
    rHipX = 0.25;
    rKneeX = 0.2;

    rShX = -2.75;
    rElbX = -0.15;
    lShX = -0.8;
    lElbX = -0.7;
  } else if (action === 'dunk') {
    pelvisY = 0.99;
    torsoLeanX = 0.18;
    lHipX = -0.45;
    lKneeX = 0.95;
    rHipX = -0.35;
    rKneeX = 0.85;

    rShX = -2.95;
    rShZ = -0.05;
    rElbX = -0.1;
    lShX = -2.85;
    lShZ = 0.05;
    lElbX = -0.15;
  } else if (action === 'block') {
    pelvisY = 0.98;
    lHipX = -0.15;
    lKneeX = 0.25;
    rHipX = -0.15;
    rKneeX = 0.25;
    rShX = -2.9;
    lShX = -2.9;
    rElbX = -0.1;
    lElbX = -0.1;
  } else if (action === 'steal') {
    pelvisY = 0.86;
    torsoLeanX = 0.34;
    torsoTwistY = 0.4;
    lHipX = -0.45;
    lKneeX = 0.65;
    rHipX = 0.25;
    rKneeX = 0.35;
    rShX = -1.35;
    rElbX = -0.15;
    lShX = 0.35;
    lElbX = -0.8;
  } else if (action === 'pass') {
    pelvisY = 0.91;
    torsoLeanX = 0.14;
    rShX = -1.45;
    rElbX = -0.15;
    lShX = -1.45;
    lElbX = -0.15;
  } else if (isRunning) {
    // Full athletic run / defensive slide
    const s = Math.sin(anim.stridePhase);
    const c = Math.cos(anim.stridePhase);

    if (isDefending) {
      pelvisY = 0.84 + Math.abs(c) * 0.03;
      torsoLeanX = 0.24;
      lHipX = -0.45 + s * 0.42;
      rHipX = -0.45 - s * 0.42;
      lKneeX = 0.72 + Math.max(0, -c) * 0.45;
      rKneeX = 0.72 + Math.max(0, c) * 0.45;
      lShX = -0.85;
      lShZ = 0.58;
      lElbX = -0.95;
      rShX = -0.85;
      rShZ = -0.58;
      rElbX = -0.95;
    } else {
      pelvisY = 0.93 + Math.abs(c) * 0.04 * runWeight;
      torsoLeanX = 0.14 * runWeight;
      torsoTwistY = -s * 0.16 * runWeight;

      const legAmp = 0.45 + 0.48 * runWeight;
      lHipX = s * legAmp;
      rHipX = -s * legAmp;
      lKneeX = Math.max(0.12, -c * 0.85 * runWeight + 0.25);
      rKneeX = Math.max(0.12, c * 0.85 * runWeight + 0.25);

      // Arm swing (override dribbling hand if holding ball)
      const armAmp = 0.4 + 0.52 * runWeight;
      lShX = -s * armAmp;
      rShX = s * armAmp;
      lElbX = -0.75 - Math.max(0, -s) * 0.45;
      rElbX = -0.75 - Math.max(0, s) * 0.45;
    }
  } else {
    // Idle / Triple-Threat / Defensive Ready Stance
    const breath = Math.sin(anim.dribblePhase * 0.35) * 0.015;
    if (isDefending) {
      pelvisY = 0.85 + breath;
      torsoLeanX = 0.22;
      lHipX = -0.35;
      lKneeX = 0.65;
      rHipX = -0.35;
      rKneeX = 0.65;
      lShX = -0.85;
      lShZ = 0.62;
      lElbX = -1.0;
      rShX = -0.85;
      rShZ = -0.62;
      rElbX = -1.0;
    } else {
      pelvisY = 0.95 + breath;
      torsoLeanX = 0.06;
      lHipX = -0.1;
      lKneeX = 0.2;
      rHipX = -0.06;
      rKneeX = 0.16;
      lShX = -0.12;
      lElbX = -0.45;
      rShX = -0.12;
      rElbX = -0.45;
    }
  }

  // Active Dribble Override on dribbling arm when on ground with ball
  if (hasBall && heightOffGround < 0.08 && action !== 'pass' && action !== 'shoot') {
    const dribbleBeat = Math.sin(anim.dribblePhase);
    if (anim.dribbleHand === 'right') {
      rShX = -0.75 + dribbleBeat * 0.26;
      rShZ = -0.24;
      rElbX = -0.85 - dribbleBeat * 0.35;
    } else {
      lShX = -0.75 + dribbleBeat * 0.26;
      lShZ = 0.24;
      lElbX = -0.85 - dribbleBeat * 0.35;
    }
  }

  const lambda = 16;
  rig.pelvis.position.y = damp(rig.pelvis.position.y, pelvisY, lambda);
  rig.torso.rotation.x = damp(rig.torso.rotation.x, torsoLeanX, lambda);
  rig.torso.rotation.y = damp(rig.torso.rotation.y, torsoTwistY, lambda);

  rig.leftHip.rotation.x = damp(rig.leftHip.rotation.x, lHipX, lambda);
  rig.leftKnee.rotation.x = damp(rig.leftKnee.rotation.x, lKneeX, lambda);
  rig.rightHip.rotation.x = damp(rig.rightHip.rotation.x, rHipX, lambda);
  rig.rightKnee.rotation.x = damp(rig.rightKnee.rotation.x, rKneeX, lambda);

  rig.leftShoulder.rotation.x = damp(rig.leftShoulder.rotation.x, lShX, lambda);
  rig.leftShoulder.rotation.z = damp(rig.leftShoulder.rotation.z, lShZ, lambda);
  rig.leftElbow.rotation.x = damp(rig.leftElbow.rotation.x, lElbX, lambda);

  rig.rightShoulder.rotation.x = damp(rig.rightShoulder.rotation.x, rShX, lambda);
  rig.rightShoulder.rotation.z = damp(rig.rightShoulder.rotation.z, rShZ, lambda);
  rig.rightElbow.rotation.x = damp(rig.rightElbow.rotation.x, rElbX, lambda);
}
