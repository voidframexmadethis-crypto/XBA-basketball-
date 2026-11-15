import * as THREE from 'three';
import type { PlayerAppearance, TeamConfig } from './types';
import { createJerseyTexture } from './textures';

export interface PlayerRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHandAnchor: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHandAnchor: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  selectionRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  dispose: () => void;
}

export function createPlayerRig(
  appearance: PlayerAppearance,
  team: TeamConfig,
  shadowTexture: THREE.Texture,
  isSoftwareGl: boolean
): PlayerRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const scale = appearance.heightMeters / 1.98;

  const root = new THREE.Group();

  // Materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: appearance.skinColor,
    roughness: 0.58,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: appearance.hairColor,
    roughness: 0.88,
    metalness: 0.02,
  });
  const jerseyTex = createJerseyTexture(
    team.primaryColor,
    team.secondaryColor,
    team.accentColor,
    team.jerseyTextColor,
    appearance.jerseyNumber,
    team.shortName
  );
  const jerseySideMat = new THREE.MeshStandardMaterial({
    color: team.primaryColor,
    roughness: 0.84,
    metalness: 0.02,
  });
  const jerseyFrontBackMat = new THREE.MeshStandardMaterial({
    map: jerseyTex,
    roughness: 0.82,
    metalness: 0.02,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: team.primaryColor,
    roughness: 0.82,
    metalness: 0.02,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: team.secondaryColor,
    roughness: 0.72,
    metalness: 0.05,
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.88,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: appearance.shoeColor,
    roughness: 0.36,
    metalness: 0.08,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: '#f1f5f9',
    roughness: 0.65,
  });

  disposables.push(
    skinMat,
    hairMat,
    jerseyTex,
    jerseySideMat,
    jerseyFrontBackMat,
    shortsMat,
    trimMat,
    sockMat,
    shoeMat,
    soleMat
  );

  const bodyScaleGroup = new THREE.Group();
  bodyScaleGroup.scale.setScalar(scale);
  root.add(bodyScaleGroup);

  // Pelvis / Hips Pivot (center of athletic stance)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.96, 0);
  bodyScaleGroup.add(pelvis);

  const pelvisGeo = new THREE.BoxGeometry(0.32, 0.16, 0.21);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, shortsMat);
  pelvisMesh.castShadow = !isSoftwareGl;
  pelvis.add(pelvisMesh);
  disposables.push(pelvisGeo);

  // Waistband stripe
  const bandGeo = new THREE.BoxGeometry(0.33, 0.045, 0.22);
  const bandMesh = new THREE.Mesh(bandGeo, trimMat);
  bandMesh.position.y = 0.07;
  pelvis.add(bandMesh);
  disposables.push(bandGeo);

  // Torso Pivot
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  pelvis.add(torso);

  // Athletic Tapered Chest / Jersey
  const chestGeo = new THREE.BoxGeometry(0.38, 0.48, 0.22);
  const chestMesh = new THREE.Mesh(chestGeo, [
    jerseySideMat,
    jerseySideMat,
    jerseySideMat,
    jerseySideMat,
    jerseyFrontBackMat,
    jerseyFrontBackMat,
  ]);
  chestMesh.position.y = 0.25;
  chestMesh.castShadow = !isSoftwareGl;
  torso.add(chestMesh);
  disposables.push(chestGeo);

  // Shoulder strap / collar accents
  const collarGeo = new THREE.TorusGeometry(0.095, 0.018, 6, 16);
  collarGeo.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeo, trimMat);
  collar.position.y = 0.49;
  torso.add(collar);
  disposables.push(collarGeo);

  // Neck & Head Group
  const head = new THREE.Group();
  head.position.set(0, 0.51, 0);
  torso.add(head);

  const neckGeo = new THREE.CylinderGeometry(0.055, 0.064, 0.1, 10);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.y = 0.05;
  head.add(neckMesh);

  const craniumGeo = new THREE.SphereGeometry(0.115, 14, 12);
  const craniumMesh = new THREE.Mesh(craniumGeo, skinMat);
  craniumMesh.scale.set(0.92, 1.08, 1.0);
  craniumMesh.position.y = 0.185;
  craniumMesh.castShadow = !isSoftwareGl;
  head.add(craniumMesh);

  const jawGeo = new THREE.BoxGeometry(0.13, 0.09, 0.13);
  const jawMesh = new THREE.Mesh(jawGeo, skinMat);
  jawMesh.position.set(0, 0.13, 0.025);
  head.add(jawMesh);
  disposables.push(neckGeo, craniumGeo, jawGeo);

  // Hair variations
  if (appearance.hairStyle === 'afro') {
    const afroGeo = new THREE.SphereGeometry(0.145, 12, 10);
    const afro = new THREE.Mesh(afroGeo, hairMat);
    afro.position.set(0, 0.23, -0.015);
    head.add(afro);
    disposables.push(afroGeo);
  } else if (appearance.hairStyle === 'braids') {
    const capGeo = new THREE.SphereGeometry(0.118, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.set(0, 0.2, -0.005);
    head.add(cap);
    const braidGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.16, 6);
    for (let i = -2; i <= 2; i++) {
      const braid = new THREE.Mesh(braidGeo, hairMat);
      braid.position.set(i * 0.032, 0.14, -0.105);
      braid.rotation.x = 0.22;
      head.add(braid);
    }
    disposables.push(capGeo, braidGeo);
  } else {
    const capGeo = new THREE.SphereGeometry(0.116, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.set(0, 0.195, -0.005);
    if (appearance.hairStyle === 'fade') {
      cap.scale.set(1.0, 1.15, 1.0);
    }
    head.add(cap);
    disposables.push(capGeo);
  }

  if (appearance.headband) {
    const hbGeo = new THREE.CylinderGeometry(0.118, 0.118, 0.036, 14, 1, true);
    const hb = new THREE.Mesh(hbGeo, trimMat);
    hb.position.set(0, 0.225, 0.002);
    hb.scale.set(0.95, 1, 1.03);
    head.add(hb);
    disposables.push(hbGeo);
  }

  // Arms Helper
  const upperArmGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.28, 9);
  upperArmGeo.translate(0, -0.14, 0);
  const forearmGeo = new THREE.CylinderGeometry(0.042, 0.033, 0.26, 9);
  forearmGeo.translate(0, -0.13, 0);
  const handGeo = new THREE.SphereGeometry(0.042, 8, 8);
  const shoulderCapGeo = new THREE.SphereGeometry(0.058, 8, 8);
  disposables.push(upperArmGeo, forearmGeo, handGeo, shoulderCapGeo);

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.23, 0.44, 0);
    torso.add(shoulder);

    const cap = new THREE.Mesh(shoulderCapGeo, skinMat);
    shoulder.add(cap);

    const upper = new THREE.Mesh(upperArmGeo, skinMat);
    upper.castShadow = !isSoftwareGl;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const fore = new THREE.Mesh(forearmGeo, skinMat);
    fore.castShadow = !isSoftwareGl;
    elbow.add(fore);

    const handAnchor = new THREE.Group();
    handAnchor.position.set(0, -0.26, 0);
    elbow.add(handAnchor);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.scale.set(0.85, 1.15, 0.65);
    handAnchor.add(hand);

    return { shoulder, elbow, handAnchor };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Legs Helper
  const shortsLegGeo = new THREE.CylinderGeometry(0.092, 0.084, 0.26, 10);
  shortsLegGeo.translate(0, -0.13, 0);
  const thighSkinGeo = new THREE.CylinderGeometry(0.072, 0.058, 0.22, 10);
  thighSkinGeo.translate(0, -0.32, 0);
  const calfGeo = new THREE.CylinderGeometry(0.056, 0.044, 0.28, 10);
  calfGeo.translate(0, -0.14, 0);
  const sockGeo = new THREE.CylinderGeometry(0.046, 0.042, 0.14, 10);
  sockGeo.translate(0, -0.34, 0);
  const shoeUpperGeo = new THREE.BoxGeometry(0.11, 0.085, 0.25);
  const shoeSoleGeo = new THREE.BoxGeometry(0.116, 0.03, 0.26);
  disposables.push(shortsLegGeo, thighSkinGeo, calfGeo, sockGeo, shoeUpperGeo, shoeSoleGeo);

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.05, 0);
    pelvis.add(hip);

    const shortsLeg = new THREE.Mesh(shortsLegGeo, shortsMat);
    shortsLeg.castShadow = !isSoftwareGl;
    hip.add(shortsLeg);

    const thighSkin = new THREE.Mesh(thighSkinGeo, skinMat);
    thighSkin.castShadow = !isSoftwareGl;
    hip.add(thighSkin);

    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    hip.add(knee);

    const calf = new THREE.Mesh(calfGeo, skinMat);
    calf.castShadow = !isSoftwareGl;
    knee.add(calf);

    const sock = new THREE.Mesh(sockGeo, sockMat);
    knee.add(sock);

    const shoe = new THREE.Mesh(shoeUpperGeo, shoeMat);
    shoe.position.set(0, -0.42, 0.045);
    shoe.castShadow = !isSoftwareGl;
    knee.add(shoe);

    const sole = new THREE.Mesh(shoeSoleGeo, soleMat);
    sole.position.set(0, -0.465, 0.045);
    knee.add(sole);

    return { hip, knee };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Court Floor Selection Ring
  const ringGeo = new THREE.RingGeometry(0.42, 0.52, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: team.accentColor,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.018;
  selectionRing.visible = false;
  root.add(selectionRing);
  disposables.push(ringGeo, ringMat);

  // Ground Contact Shadow Disc
  const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.012;
  root.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return {
    root,
    pelvis,
    torso,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    leftHandAnchor: leftArm.handAnchor,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    rightHandAnchor: rightArm.handAnchor,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    selectionRing,
    contactShadow,
    dispose,
  };
}
