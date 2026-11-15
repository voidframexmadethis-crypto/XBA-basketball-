import * as THREE from 'three';
import {
  AWAY_TEAM,
  BACKBOARD_BOTTOM_Y,
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  BACKBOARD_X,
  COURT_LENGTH,
  COURT_WIDTH,
  HALF_COURT_X,
  HALF_COURT_Z,
  HOME_TEAM,
  HOOP_X,
  RIM_HEIGHT,
  RIM_RADIUS,
  RIM_TUBE_RADIUS,
} from './constants';
import {
  createCourtTextures,
  createRibbonBoardTexture,
  createShotClockTexture,
  updateShotClockCanvas,
} from './textures';

export interface HoopRig {
  side: -1 | 1; // -1 = Left Hoop (Home defends, Away attacks), +1 = Right Hoop (Away defends, Home attacks)
  rimCenter: THREE.Vector3;
  backboardX: number;
  netGroup: THREE.Group;
  netMesh: THREE.LineSegments;
  netBasePositions: Float32Array;
  swishTimer: number;
  rimGroup: THREE.Group;
  rimFlexTimer: number;
}

export interface ArenaBuildResult {
  group: THREE.Group;
  hoops: { left: HoopRig; right: HoopRig };
  update: (dt: number, elapsed: number, shotClockSeconds: number, crowdExcitement: number) => void;
  triggerSwish: (side: -1 | 1, withRimFlex?: boolean) => void;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();

export function buildArena(
  scene: THREE.Scene,
  maxAnisotropy: number,
  isSoftwareGl: boolean
): ArenaBuildResult {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Arena Atmosphere & Lighting
  scene.background = new THREE.Color('#090d18');
  scene.fog = new THREE.FogExp2('#090d18', 0.0115);

  const hemiLight = new THREE.HemisphereLight('#b7d3ff', '#1f1712', 0.65);
  hemiLight.position.set(0, 22, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight('#fff4e0', 1.85);
  keyLight.position.set(8, 22, 11);
  keyLight.castShadow = !isSoftwareGl;
  if (keyLight.castShadow) {
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 52;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
  }
  scene.add(keyLight);

  const rimBackLight = new THREE.DirectionalLight('#93c5fd', 0.72);
  rimBackLight.position.set(-10, 16, -14);
  scene.add(rimBackLight);

  // Subtle court overhead point lights for specular hardwood sheen
  const leftCourtSpot = new THREE.PointLight('#fff6e5', 22, 34, 1.6);
  leftCourtSpot.position.set(-7.5, 11.5, 0);
  scene.add(leftCourtSpot);

  const rightCourtSpot = new THREE.PointLight('#fff6e5', 22, 34, 1.6);
  rightCourtSpot.position.set(7.5, 11.5, 0);
  scene.add(rightCourtSpot);

  // 2. Hardwood Court + Apron
  const { colorMap: courtColor, roughnessMap: courtRough } = createCourtTextures(maxAnisotropy);
  disposables.push(courtColor, courtRough);

  const totalLen = COURT_LENGTH + 5.2;
  const totalWid = COURT_WIDTH + 4.8;
  const courtGeo = new THREE.PlaneGeometry(totalLen, totalWid);
  courtGeo.rotateX(-Math.PI / 2);
  disposables.push(courtGeo);

  const courtMat = new THREE.MeshPhysicalMaterial({
    map: courtColor,
    roughnessMap: courtRough,
    roughness: 0.48,
    metalness: 0.04,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.85,
  });
  disposables.push(courtMat);

  const courtMesh = new THREE.Mesh(courtGeo, courtMat);
  courtMesh.receiveShadow = !isSoftwareGl;
  courtMesh.position.y = 0;
  group.add(courtMesh);

  // Outer Arena Concourse Floor
  const concourseGeo = new THREE.PlaneGeometry(86, 68);
  concourseGeo.rotateX(-Math.PI / 2);
  const concourseMat = new THREE.MeshStandardMaterial({
    color: '#0e131f',
    roughness: 0.88,
    metalness: 0.08,
  });
  disposables.push(concourseGeo, concourseMat);
  const concourseMesh = new THREE.Mesh(concourseGeo, concourseMat);
  concourseMesh.position.y = -0.03;
  concourseMesh.receiveShadow = !isSoftwareGl;
  group.add(concourseMesh);

  // 3. Shot Clock Shared Canvas Texture
  const shotClockTex = createShotClockTexture(24);
  disposables.push(shotClockTex.texture);

  // 4. Build Both Regulation Hoops (Left -1 & Right +1)
  const buildHoop = (side: -1 | 1): HoopRig => {
    const hoopRoot = new THREE.Group();
    const dirToCenter = -side; // +1 for left hoop, -1 for right hoop

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: '#18181b',
      roughness: 0.35,
      metalness: 0.82,
    });
    const padMat = new THREE.MeshStandardMaterial({
      color: side === -1 ? HOME_TEAM.secondaryColor : AWAY_TEAM.secondaryColor,
      roughness: 0.65,
      metalness: 0.05,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.25,
      metalness: 0.85,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#ea580c',
      roughness: 0.28,
      metalness: 0.65,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#e0f2fe',
      roughness: 0.05,
      metalness: 0.0,
      transmission: isSoftwareGl ? 0 : 0.86,
      thickness: 0.12,
      ior: 1.52,
      transparent: true,
      opacity: isSoftwareGl ? 0.35 : 1.0,
      clearcoat: 1.0,
      depthWrite: false,
    });
    disposables.push(darkSteelMat, padMat, frameMat, rimMat, glassMat);

    // Base anchored behind baseline
    const baseX = side * (HALF_COURT_X + 1.85);
    const baseGeo = new THREE.BoxGeometry(1.45, 0.85, 1.15);
    const baseMesh = new THREE.Mesh(baseGeo, padMat);
    baseMesh.position.set(baseX, 0.425, 0);
    baseMesh.castShadow = !isSoftwareGl;
    hoopRoot.add(baseMesh);
    disposables.push(baseGeo);

    // Vertical main stanchion post
    const postGeo = new THREE.BoxGeometry(0.28, 3.2, 0.28);
    const postMesh = new THREE.Mesh(postGeo, darkSteelMat);
    postMesh.position.set(baseX, 1.85, 0);
    postMesh.castShadow = !isSoftwareGl;
    hoopRoot.add(postMesh);
    disposables.push(postGeo);

    // Padded front column guard
    const frontPadGeo = new THREE.BoxGeometry(0.36, 2.05, 0.36);
    const frontPad = new THREE.Mesh(frontPadGeo, padMat);
    frontPad.position.set(baseX + dirToCenter * 0.16, 1.15, 0);
    hoopRoot.add(frontPad);
    disposables.push(frontPadGeo);

    // Horizontal overhead extension arm reaching to backboard
    const bbX = side * BACKBOARD_X;
    const armLen = Math.abs(baseX - bbX);
    const armGeo = new THREE.BoxGeometry(armLen, 0.22, 0.24);
    const armMesh = new THREE.Mesh(armGeo, darkSteelMat);
    armMesh.position.set((baseX + bbX) / 2, 3.36, 0);
    armMesh.castShadow = !isSoftwareGl;
    hoopRoot.add(armMesh);
    disposables.push(armGeo);

    // Diagonal brace strut
    const braceLen = Math.hypot(armLen * 0.75, 1.35);
    const braceGeo = new THREE.CylinderGeometry(0.055, 0.055, braceLen, 10);
    const braceMesh = new THREE.Mesh(braceGeo, darkSteelMat);
    braceMesh.position.set((baseX + bbX) / 2, 2.75, 0);
    braceMesh.rotation.z = side * Math.atan2(armLen * 0.75, 1.35);
    hoopRoot.add(braceMesh);
    disposables.push(braceGeo);

    // Backboard center Y
    const bbCenterY = BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT / 2;

    // Tempered Glass Backboard
    const bbGeo = new THREE.BoxGeometry(0.035, BACKBOARD_HEIGHT, BACKBOARD_WIDTH);
    const bbMesh = new THREE.Mesh(bbGeo, glassMat);
    bbMesh.position.set(bbX, bbCenterY, 0);
    bbMesh.renderOrder = 4;
    hoopRoot.add(bbMesh);
    disposables.push(bbGeo);

    // Backboard outer padding + shooter's square (LineSegments / crisp bars)
    const borderThick = 0.045;
    const topBarGeo = new THREE.BoxGeometry(0.05, borderThick, BACKBOARD_WIDTH + borderThick);
    const sideBarGeo = new THREE.BoxGeometry(0.05, BACKBOARD_HEIGHT, borderThick);
    const topBar = new THREE.Mesh(topBarGeo, frameMat);
    topBar.position.set(bbX, BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT, 0);
    const botBar = new THREE.Mesh(topBarGeo, padMat);
    botBar.position.set(bbX, BACKBOARD_BOTTOM_Y, 0);
    const leftBar = new THREE.Mesh(sideBarGeo, frameMat);
    leftBar.position.set(bbX, bbCenterY, -BACKBOARD_WIDTH / 2);
    const rightBar = new THREE.Mesh(sideBarGeo, frameMat);
    rightBar.position.set(bbX, bbCenterY, BACKBOARD_WIDTH / 2);
    hoopRoot.add(topBar, botBar, leftBar, rightBar);
    disposables.push(topBarGeo, sideBarGeo);

    // Shooter's Square (inner white/red box)
    const sqW = 0.61;
    const sqH = 0.46;
    const sqBottom = RIM_HEIGHT + 0.04;
    const sqPts = [
      new THREE.Vector3(0, sqBottom, -sqW / 2),
      new THREE.Vector3(0, sqBottom, sqW / 2),
      new THREE.Vector3(0, sqBottom, sqW / 2),
      new THREE.Vector3(0, sqBottom + sqH, sqW / 2),
      new THREE.Vector3(0, sqBottom + sqH, sqW / 2),
      new THREE.Vector3(0, sqBottom + sqH, -sqW / 2),
      new THREE.Vector3(0, sqBottom + sqH, -sqW / 2),
      new THREE.Vector3(0, sqBottom, -sqW / 2),
    ];
    const sqGeo = new THREE.BufferGeometry().setFromPoints(sqPts);
    const sqMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
    const sqLines = new THREE.LineSegments(sqGeo, sqMat);
    sqLines.position.x = bbX + dirToCenter * 0.022;
    hoopRoot.add(sqLines);
    disposables.push(sqGeo, sqMat);

    // Top-mounted 3D Shot Clock Housing
    const clockBoxGeo = new THREE.BoxGeometry(0.22, 0.34, 0.62);
    const clockBoxMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      roughness: 0.4,
      metalness: 0.6,
    });
    const clockFaceMat = new THREE.MeshBasicMaterial({ map: shotClockTex.texture });
    const clockMaterials = [
      side === -1 ? clockFaceMat : clockBoxMat,
      side === 1 ? clockFaceMat : clockBoxMat,
      clockBoxMat,
      clockBoxMat,
      clockFaceMat,
      clockFaceMat,
    ];
    const clockMesh = new THREE.Mesh(clockBoxGeo, clockMaterials);
    clockMesh.position.set(bbX, BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT + 0.25, 0);
    hoopRoot.add(clockMesh);
    disposables.push(clockBoxGeo, clockBoxMat, clockFaceMat);

    // Rim & Support Flange
    const rimX = side * HOOP_X;
    const rimGroup = new THREE.Group();
    rimGroup.position.set(rimX, RIM_HEIGHT, 0);

    const flangeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.16);
    const flange = new THREE.Mesh(flangeGeo, rimMat);
    flange.position.set(-dirToCenter * (RIM_RADIUS + 0.06), -0.01, 0);
    rimGroup.add(flange);

    const rimGeo = new THREE.TorusGeometry(RIM_RADIUS, RIM_TUBE_RADIUS, 12, 32);
    rimGeo.rotateX(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.castShadow = !isSoftwareGl;
    rimGroup.add(rimMesh);
    hoopRoot.add(rimGroup);
    disposables.push(flangeGeo, rimGeo);

    // Woven Nylon Net (12-node diamond lattice)
    const netGroup = new THREE.Group();
    netGroup.position.set(rimX, RIM_HEIGHT, 0);

    const rings = 5;
    const radialNodes = 12;
    const netHeight = 0.44;
    const ringPoints: THREE.Vector3[][] = [];

    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1);
      const y = -t * netHeight;
      // Taper inward near bottom, flare slightly at very bottom tip
      const radius = RIM_RADIUS * (1 - 0.38 * Math.sin(t * Math.PI * 0.85));
      const twist = (r % 2) * (Math.PI / radialNodes);
      const row: THREE.Vector3[] = [];
      for (let i = 0; i < radialNodes; i++) {
        const angle = (i / radialNodes) * Math.PI * 2 + twist;
        row.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
      }
      ringPoints.push(row);
    }

    const netVerts: number[] = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let i = 0; i < radialNodes; i++) {
        const curr = ringPoints[r][i];
        const next1 = ringPoints[r + 1][i];
        const next2 = ringPoints[r + 1][(i + (r % 2 === 0 ? radialNodes - 1 : 1)) % radialNodes];
        netVerts.push(curr.x, curr.y, curr.z, next1.x, next1.y, next1.z);
        netVerts.push(curr.x, curr.y, curr.z, next2.x, next2.y, next2.z);
      }
    }

    const netBasePositions = new Float32Array(netVerts);
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(netVerts), 3));
    const netMat = new THREE.LineBasicMaterial({
      color: '#f8fafc',
      transparent: true,
      opacity: 0.92,
    });
    const netMesh = new THREE.LineSegments(netGeo, netMat);
    netGroup.add(netMesh);
    hoopRoot.add(netGroup);
    disposables.push(netGeo, netMat);

    group.add(hoopRoot);

    return {
      side,
      rimCenter: new THREE.Vector3(rimX, RIM_HEIGHT, 0),
      backboardX: bbX,
      netGroup,
      netMesh,
      netBasePositions,
      swishTimer: 0,
      rimGroup,
      rimFlexTimer: 0,
    };
  };

  const leftHoop = buildHoop(-1);
  const rightHoop = buildHoop(1);

  // 5. Scorer's Table, LED Courtside Ribbon Boards & Team Benches (Far Sideline -Z)
  const ribbonTex = createRibbonBoardTexture();
  disposables.push(ribbonTex);

  const ribbonMat = new THREE.MeshStandardMaterial({
    map: ribbonTex,
    emissive: '#ffffff',
    emissiveMap: ribbonTex,
    emissiveIntensity: 0.55,
    roughness: 0.35,
  });
  disposables.push(ribbonMat);

  // Center Scorer's Table
  const tableGeo = new THREE.BoxGeometry(6.8, 0.84, 0.85);
  const tableMesh = new THREE.Mesh(tableGeo, ribbonMat);
  tableMesh.position.set(0, 0.42, -(HALF_COURT_Z + 1.55));
  group.add(tableMesh);
  disposables.push(tableGeo);

  // Baseline LED Ribbon Boards behind hoops
  const baseLedGeo = new THREE.BoxGeometry(0.32, 0.82, COURT_WIDTH + 1.6);
  const leftLed = new THREE.Mesh(baseLedGeo, ribbonMat);
  leftLed.position.set(-(HALF_COURT_X + 2.8), 0.41, 0);
  const rightLed = new THREE.Mesh(baseLedGeo, ribbonMat);
  rightLed.position.set(HALF_COURT_X + 2.8, 0.41, 0);
  group.add(leftLed, rightLed);
  disposables.push(baseLedGeo);

  // Team Benches (Left = Home Bench, Right = Away Bench on -Z sideline)
  const buildBench = (startX: number, teamColor: string, accentColor: string) => {
    const chairSeatGeo = new THREE.BoxGeometry(0.46, 0.08, 0.46);
    const chairBackGeo = new THREE.BoxGeometry(0.46, 0.46, 0.07);
    const frameGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6);
    const seatMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55 });
    const metalMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 });
    disposables.push(chairSeatGeo, chairBackGeo, frameGeo, seatMat, metalMat);

    const benchZ = -(HALF_COURT_Z + 1.48);
    for (let i = 0; i < 8; i++) {
      const cx = startX + i * 0.62;
      const seat = new THREE.Mesh(chairSeatGeo, seatMat);
      seat.position.set(cx, 0.44, benchZ);
      const back = new THREE.Mesh(chairBackGeo, seatMat);
      back.position.set(cx, 0.68, benchZ - 0.21);
      const legL = new THREE.Mesh(frameGeo, metalMat);
      legL.position.set(cx - 0.18, 0.22, benchZ);
      const legR = new THREE.Mesh(frameGeo, metalMat);
      legR.position.set(cx + 0.18, 0.22, benchZ);
      group.add(seat, back, legL, legR);
    }

    // Hydration cooler
    const coolerGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.52, 14);
    const coolerMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4 });
    const cooler = new THREE.Mesh(coolerGeo, coolerMat);
    cooler.position.set(startX - 0.65, 0.26, benchZ);
    group.add(cooler);
    disposables.push(coolerGeo, coolerMat);
  };

  buildBench(-9.6, HOME_TEAM.secondaryColor, HOME_TEAM.accentColor);
  buildBench(4.9, AWAY_TEAM.secondaryColor, AWAY_TEAM.accentColor);

  // 6. Tiered Spectator Bowl + Instanced Animated Crowd
  const standMat = new THREE.MeshStandardMaterial({
    color: '#141a29',
    roughness: 0.85,
    metalness: 0.1,
  });
  const seatTierMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.7,
    metalness: 0.15,
  });
  disposables.push(standMat, seatTierMat);

  const crowdPositions: Array<{ x: number; y: number; z: number; rotY: number; phase: number; color: THREE.Color }> = [];
  const homeCol = new THREE.Color(HOME_TEAM.secondaryColor);
  const homeGold = new THREE.Color(HOME_TEAM.accentColor);
  const awayCol = new THREE.Color(AWAY_TEAM.secondaryColor);
  const neutralCols = [
    new THREE.Color('#cbd5e1'),
    new THREE.Color('#475569'),
    new THREE.Color('#334155'),
    new THREE.Color('#f8fafc'),
  ];

  const pickCrowdColor = (idx: number): THREE.Color => {
    const r = ((idx * 37) % 100) / 100;
    if (r < 0.42) return homeCol;
    if (r < 0.58) return homeGold;
    if (r < 0.72) return awayCol;
    return neutralCols[idx % neutralCols.length];
  };

  // Build 10 stepped rows on North (-Z) and South (+Z), 8 rows on East/West baselines
  const numSideRows = 10;
  const sideStartZ = HALF_COURT_Z + 3.2;
  for (let row = 0; row < numSideRows; row++) {
    const y = 0.75 + row * 0.58;
    const zOffset = sideStartZ + row * 0.92;
    const riserGeo = new THREE.BoxGeometry(36 + row * 1.4, 0.58, 0.92);
    disposables.push(riserGeo);

    // North Stand (-Z)
    const northRiser = new THREE.Mesh(riserGeo, row % 2 === 0 ? standMat : seatTierMat);
    northRiser.position.set(0, y - 0.29, -zOffset);
    group.add(northRiser);

    // South Stand (+Z)
    const southRiser = new THREE.Mesh(riserGeo, row % 2 === 0 ? standMat : seatTierMat);
    southRiser.position.set(0, y - 0.29, zOffset);
    group.add(southRiser);

    // Populate spectator instances along each row
    const span = 34 + row * 1.1;
    const step = 1.05;
    for (let x = -span / 2; x <= span / 2; x += step) {
      // Leave small aisle gaps
      if (Math.abs(x) < 0.7 || Math.abs(Math.abs(x) - 9.5) < 0.55) continue;
      const jitterX = (((x * 13 + row * 7) % 10) / 10 - 0.5) * 0.16;
      crowdPositions.push({
        x: x + jitterX,
        y,
        z: -zOffset,
        rotY: 0,
        phase: (x * 0.7 + row * 1.3) % (Math.PI * 2),
        color: pickCrowdColor(crowdPositions.length),
      });
      crowdPositions.push({
        x: x - jitterX,
        y,
        z: zOffset,
        rotY: Math.PI,
        phase: (x * 0.9 + row * 1.7) % (Math.PI * 2),
        color: pickCrowdColor(crowdPositions.length),
      });
    }
  }

  const numEndRows = 8;
  const endStartX = HALF_COURT_X + 4.1;
  for (let row = 0; row < numEndRows; row++) {
    const y = 0.85 + row * 0.58;
    const xOffset = endStartX + row * 0.92;
    const riserGeo = new THREE.BoxGeometry(0.92, 0.58, 22 + row * 1.1);
    disposables.push(riserGeo);

    const westRiser = new THREE.Mesh(riserGeo, row % 2 === 0 ? standMat : seatTierMat);
    westRiser.position.set(-xOffset, y - 0.29, 0);
    const eastRiser = new THREE.Mesh(riserGeo, row % 2 === 0 ? standMat : seatTierMat);
    eastRiser.position.set(xOffset, y - 0.29, 0);
    group.add(westRiser, eastRiser);

    const span = 19 + row * 0.9;
    for (let z = -span / 2; z <= span / 2; z += 1.05) {
      if (Math.abs(z) < 0.7) continue;
      crowdPositions.push({
        x: -xOffset,
        y,
        z,
        rotY: Math.PI / 2,
        phase: (z * 0.8 + row * 1.1) % (Math.PI * 2),
        color: pickCrowdColor(crowdPositions.length),
      });
      crowdPositions.push({
        x: xOffset,
        y,
        z,
        rotY: -Math.PI / 2,
        phase: (z * 1.1 + row * 0.6) % (Math.PI * 2),
        color: pickCrowdColor(crowdPositions.length),
      });
    }
  }

  // InstancedMesh for Crowd Spectators (Torso + Head combined via merged or single sculpted capsule-silhouette)
  const spectatorGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.72, 7);
  spectatorGeo.translate(0, 0.36, 0);
  const spectatorMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.75,
    metalness: 0.05,
  });
  disposables.push(spectatorGeo, spectatorMat);

  const crowdTorsoInst = new THREE.InstancedMesh(spectatorGeo, spectatorMat, crowdPositions.length);
  crowdTorsoInst.frustumCulled = false;

  const headGeo = new THREE.SphereGeometry(0.13, 7, 6);
  headGeo.translate(0, 0.84, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: '#d49a6a', roughness: 0.65 });
  disposables.push(headGeo, headMat);
  const crowdHeadInst = new THREE.InstancedMesh(headGeo, headMat, crowdPositions.length);
  crowdHeadInst.frustumCulled = false;

  const headPalette = [
    new THREE.Color('#8d5524'),
    new THREE.Color('#c68642'),
    new THREE.Color('#e0ac69'),
    new THREE.Color('#f1c27d'),
    new THREE.Color('#5a321a'),
  ];

  crowdPositions.forEach((p, idx) => {
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(0, p.rotY, 0);
    const scaleY = 0.92 + ((idx * 17) % 15) * 0.012;
    _dummy.scale.set(1, scaleY, 1);
    _dummy.updateMatrix();
    crowdTorsoInst.setMatrixAt(idx, _dummy.matrix);
    crowdTorsoInst.setColorAt(idx, p.color);
    crowdHeadInst.setMatrixAt(idx, _dummy.matrix);
    crowdHeadInst.setColorAt(idx, headPalette[idx % headPalette.length]);
  });

  crowdTorsoInst.instanceMatrix.needsUpdate = true;
  if (crowdTorsoInst.instanceColor) crowdTorsoInst.instanceColor.needsUpdate = true;
  crowdHeadInst.instanceMatrix.needsUpdate = true;
  if (crowdHeadInst.instanceColor) crowdHeadInst.instanceColor.needsUpdate = true;

  group.add(crowdTorsoInst, crowdHeadInst);

  // 7. Overhead Arena Roof Truss, Light Banks & Center-Hung Jumbotron
  const trussMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.78,
    roughness: 0.35,
  });
  const lightFixtureMat = new THREE.MeshBasicMaterial({ color: '#fffbeb' });
  disposables.push(trussMat, lightFixtureMat);

  const trussBeamGeo = new THREE.BoxGeometry(34, 0.45, 0.45);
  const lampStripGeo = new THREE.BoxGeometry(4.2, 0.14, 0.65);
  disposables.push(trussBeamGeo, lampStripGeo);

  [-8, 0, 8].forEach((zPos) => {
    const beam = new THREE.Mesh(trussBeamGeo, trussMat);
    beam.position.set(0, 14.5, zPos);
    group.add(beam);

    [-9, 0, 9].forEach((xPos) => {
      if (zPos === 0 && xPos === 0) return; // Jumbotron hangs here
      const lamp = new THREE.Mesh(lampStripGeo, lightFixtureMat);
      lamp.position.set(xPos, 14.22, zPos);
      group.add(lamp);
    });
  });

  // Center-Hung 4-Sided Jumbotron
  const jumboGroup = new THREE.Group();
  jumboGroup.position.set(0, 11.4, 0);
  const jumboBodyGeo = new THREE.BoxGeometry(4.6, 2.3, 4.6);
  const jumboBody = new THREE.Mesh(jumboBodyGeo, trussMat);
  jumboGroup.add(jumboBody);

  const screenGeo = new THREE.PlaneGeometry(3.9, 1.75);
  const screenMat = new THREE.MeshBasicMaterial({ map: ribbonTex });
  [
    [0, 0, 2.31, 0],
    [0, 0, -2.31, Math.PI],
    [2.31, 0, 0, Math.PI / 2],
    [-2.31, 0, 0, -Math.PI / 2],
  ].forEach(([sx, sy, sz, ry]) => {
    const scr = new THREE.Mesh(screenGeo, screenMat);
    scr.position.set(sx, sy, sz);
    scr.rotation.y = ry;
    jumboGroup.add(scr);
  });
  group.add(jumboGroup);
  disposables.push(jumboBodyGeo, screenGeo, screenMat);

  scene.add(group);

  let lastShotClockDisplay = -1;

  const updateNetRig = (hoop: HoopRig, dt: number) => {
    if (hoop.swishTimer > 0) {
      hoop.swishTimer = Math.max(0, hoop.swishTimer - dt);
      const t = 1 - hoop.swishTimer / 0.65;
      const wave = Math.sin(t * Math.PI * 3.5) * Math.exp(-t * 2.8);
      const posAttr = hoop.netMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = hoop.netBasePositions;
      for (let i = 0; i < arr.length; i += 3) {
        const y = base[i + 1];
        const depthFactor = Math.min(1, Math.abs(y) / 0.44);
        const radialExpand = 1 + wave * 0.42 * depthFactor;
        arr[i] = base[i] * radialExpand;
        arr[i + 1] = y + Math.abs(wave) * 0.08 * depthFactor;
        arr[i + 2] = base[i + 2] * radialExpand;
      }
      posAttr.needsUpdate = true;
    }

    if (hoop.rimFlexTimer > 0) {
      hoop.rimFlexTimer = Math.max(0, hoop.rimFlexTimer - dt);
      const t = 1 - hoop.rimFlexTimer / 0.45;
      const flex = -Math.sin(t * Math.PI * 3) * Math.exp(-t * 4) * 0.09;
      hoop.rimGroup.rotation.z = hoop.side * flex;
    } else {
      hoop.rimGroup.rotation.z = 0;
    }
  };

  const update = (dt: number, elapsed: number, shotClockSeconds: number, crowdExcitement: number) => {
    // Scroll LED ribbon boards smoothly
    ribbonTex.offset.x = (elapsed * 0.06) % 1;

    // Update 3D Shot Clock canvas only when display string changes
    const quantized = shotClockSeconds < 5 ? Math.round(shotClockSeconds * 10) : Math.ceil(shotClockSeconds) * 10;
    if (quantized !== lastShotClockDisplay) {
      lastShotClockDisplay = quantized;
      updateShotClockCanvas(shotClockTex.ctx, shotClockTex.texture, shotClockSeconds);
    }

    // Animate Swishing Nets & Rim Flex
    updateNetRig(leftHoop, dt);
    updateNetRig(rightHoop, dt);

    // Animate Crowd Wave / Cheering (zero-GC)
    const amp = 0.03 + crowdExcitement * 0.16;
    const freq = 2.4 + crowdExcitement * 5.2;
    for (let i = 0; i < crowdPositions.length; i++) {
      const p = crowdPositions[i];
      const bounce = Math.max(0, Math.sin(elapsed * freq + p.phase)) * amp;
      _dummy.position.set(p.x, p.y + bounce, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      crowdTorsoInst.setMatrixAt(i, _dummy.matrix);
      crowdHeadInst.setMatrixAt(i, _dummy.matrix);
    }
    crowdTorsoInst.instanceMatrix.needsUpdate = true;
    crowdHeadInst.instanceMatrix.needsUpdate = true;
  };

  const triggerSwish = (side: -1 | 1, withRimFlex = false) => {
    const hoop = side === -1 ? leftHoop : rightHoop;
    hoop.swishTimer = 0.65;
    if (withRimFlex) {
      hoop.rimFlexTimer = 0.45;
    }
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
    scene.remove(group);
  };

  return {
    group,
    hoops: { left: leftHoop, right: rightHoop },
    update,
    triggerSwish,
    dispose,
  };
}
