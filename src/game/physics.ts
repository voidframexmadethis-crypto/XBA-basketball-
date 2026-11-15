import * as THREE from 'three';
import {
  BACKBOARD_BOTTOM_Y,
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  BACKBOARD_X,
  BALL_BOUNCE_RESTITUTION,
  BALL_RADIUS,
  FLOOR_FRICTION,
  GRAVITY,
  HALF_COURT_X,
  HALF_COURT_Z,
  HOOP_X,
  RIM_HEIGHT,
  RIM_RADIUS,
  RIM_TUBE_RADIUS,
  THREE_POINT_CORNER_Z,
  THREE_POINT_RADIUS,
} from './constants';
import { createBasketballTextures } from './textures';

export interface BallEvents {
  bouncedFloor?: number;
  hitRim?: number;
  hitBackboard?: number;
  scoredSide?: -1 | 1;
  outOfBounds?: boolean;
}

const _tmpVec = new THREE.Vector3();

export class BasketballPhysics {
  public mesh: THREE.Mesh;
  public shadowMesh: THREE.Mesh;
  public position = new THREE.Vector3(0, BALL_RADIUS, 0);
  public velocity = new THREE.Vector3(0, 0, 0);
  public prevPosition = new THREE.Vector3(0, BALL_RADIUS, 0);
  public angularVel = new THREE.Vector3(0, 0, 0);

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    scene: THREE.Scene,
    maxAnisotropy: number,
    shadowTexture: THREE.Texture,
    isSoftwareGl: boolean
  ) {
    const { colorMap, bumpMap } = createBasketballTextures(maxAnisotropy);
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 20);
    const mat = new THREE.MeshStandardMaterial({
      map: colorMap,
      bumpMap,
      bumpScale: 0.008,
      roughness: 0.62,
      metalness: 0.03,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = !isSoftwareGl;
    scene.add(this.mesh);

    const shadowGeo = new THREE.PlaneGeometry(0.42, 0.42);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.01;
    scene.add(this.shadowMesh);

    this.disposables.push(colorMap, bumpMap, geo, mat, shadowGeo, shadowMat);
  }

  public syncVisuals(dt: number) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.x += this.angularVel.x * dt;
    this.mesh.rotation.y += this.angularVel.y * dt;
    this.mesh.rotation.z += this.angularVel.z * dt;

    this.shadowMesh.position.x = this.position.x;
    this.shadowMesh.position.z = this.position.z;
    const h = Math.max(0, this.position.y - BALL_RADIUS);
    const s = Math.max(0.42, 1 - h * 0.16);
    this.shadowMesh.scale.setScalar(s);
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.14, 0.55 - h * 0.12);
  }

  public launchShot(
    from: THREE.Vector3,
    targetSide: -1 | 1,
    accuracyScore: number, // 0..1 (1 = dead center swish)
    contestFactor: number // 0..1 (0 = wide open, 1 = heavily contested)
  ) {
    this.position.copy(from);
    this.prevPosition.copy(from);

    const hoopX = targetSide * HOOP_X;
    const dist = Math.hypot(hoopX - from.x, -from.z);

    // Compute realistic error spread based on timing & defense contest
    const missPotential = Math.max(0, 1 - accuracyScore) * 0.65 + contestFactor * 0.36;
    const errAngle = (Math.random() - 0.5) * Math.PI * 2;
    const errMag = missPotential * (0.34 + Math.min(0.52, dist * 0.042));

    const aimX = hoopX + Math.cos(errAngle) * errMag;
    const aimZ = Math.sin(errAngle) * errMag;
    const aimY = RIM_HEIGHT + 0.06;

    // Desired apex above the higher of release or rim
    const apexY = Math.max(from.y + 0.9, RIM_HEIGHT + 1.15 + Math.min(1.65, dist * 0.14));

    const vy0 = Math.sqrt(Math.max(0.5, 2 * GRAVITY * (apexY - from.y)));
    const tUp = vy0 / GRAVITY;
    const tDown = Math.sqrt(Math.max(0.05, (2 * (apexY - aimY)) / GRAVITY));
    const totalTime = tUp + tDown;

    this.velocity.set((aimX - from.x) / totalTime, vy0, (aimZ - from.z) / totalTime);

    // Realistic shooter's backspin
    this.angularVel.set(0, 0, targetSide === 1 ? 11 : -11);
  }

  public launchPass(from: THREE.Vector3, to: THREE.Vector3, speed = 15.5) {
    this.position.copy(from);
    this.prevPosition.copy(from);

    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizDist = Math.hypot(dx, dz);
    const flightTime = Math.max(0.14, horizDist / speed);

    this.velocity.set(
      dx / flightTime,
      (to.y - from.y + 0.5 * GRAVITY * flightTime * flightTime) / flightTime,
      dz / flightTime
    );
    this.angularVel.set(4, 3, -4);
  }

  public stepFreeFlight(dt: number): BallEvents {
    const events: BallEvents = {};
    this.prevPosition.copy(this.position);

    // Integrate gravity
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Floor collision
    if (this.position.y <= BALL_RADIUS) {
      this.position.y = BALL_RADIUS;
      if (Math.abs(this.velocity.y) > 0.85) {
        events.bouncedFloor = Math.min(1, Math.abs(this.velocity.y) / 9);
      }
      this.velocity.y = Math.abs(this.velocity.y) * BALL_BOUNCE_RESTITUTION;
      if (this.velocity.y < 0.45) {
        this.velocity.y = 0;
      }
      this.velocity.x *= FLOOR_FRICTION;
      this.velocity.z *= FLOOR_FRICTION;
      this.angularVel.multiplyScalar(0.92);
    }

    // Detect true out-of-bounds when ball crosses regulation lines near floor height
    if (
      this.position.y <= 1.35 &&
      (Math.abs(this.position.x) > HALF_COURT_X + 0.06 || Math.abs(this.position.z) > HALF_COURT_Z + 0.06)
    ) {
      events.outOfBounds = true;
    }

    // Court out-of-bounds soft containment walls (keeps shootaround/visual ball inside arena)
    const maxX = HALF_COURT_X + 0.8;
    const maxZ = HALF_COURT_Z + 0.8;
    if (this.position.x > maxX) {
      this.position.x = maxX;
      this.velocity.x = -Math.abs(this.velocity.x) * 0.65;
    } else if (this.position.x < -maxX) {
      this.position.x = -maxX;
      this.velocity.x = Math.abs(this.velocity.x) * 0.65;
    }
    if (this.position.z > maxZ) {
      this.position.z = maxZ;
      this.velocity.z = -Math.abs(this.velocity.z) * 0.65;
    } else if (this.position.z < -maxZ) {
      this.position.z = -maxZ;
      this.velocity.z = Math.abs(this.velocity.z) * 0.65;
    }

    // Check both hoops for backboard, rim, and scoring cylinder
    for (const side of [-1, 1] as const) {
      this.collideBackboard(side, events);
      this.collideRim(side, events);
      this.checkScore(side, events);
    }

    this.syncVisuals(dt);
    return events;
  }

  private collideBackboard(side: -1 | 1, events: BallEvents) {
    const bbX = side * BACKBOARD_X;
    const halfW = BACKBOARD_WIDTH / 2;
    const minY = BACKBOARD_BOTTOM_Y;
    const maxY = BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT;

    if (
      this.position.y >= minY - BALL_RADIUS &&
      this.position.y <= maxY + BALL_RADIUS &&
      Math.abs(this.position.z) <= halfW + BALL_RADIUS
    ) {
      const distX = this.position.x - bbX;
      if (Math.abs(distX) < BALL_RADIUS + 0.025) {
        const pushDir = distX >= 0 ? 1 : -1;
        this.position.x = bbX + pushDir * (BALL_RADIUS + 0.026);
        if (this.velocity.x * pushDir < 0) {
          this.velocity.x = -this.velocity.x * 0.68;
          this.velocity.y *= 0.88;
          this.velocity.z *= 0.88;
          events.hitBackboard = Math.min(1, this.velocity.length() / 10);
        }
      }
    }
  }

  private collideRim(side: -1 | 1, events: BallEvents) {
    const rimX = side * HOOP_X;
    const dx = this.position.x - rimX;
    const dz = this.position.z;
    const horizDist = Math.hypot(dx, dz);

    // Closest point on the rim ring circle
    let ringX = rimX + RIM_RADIUS;
    let ringZ = 0;
    if (horizDist > 0.0001) {
      ringX = rimX + (dx / horizDist) * RIM_RADIUS;
      ringZ = (dz / horizDist) * RIM_RADIUS;
    }

    _tmpVec.set(this.position.x - ringX, this.position.y - RIM_HEIGHT, this.position.z - ringZ);
    const distToTube = _tmpVec.length();
    const minSep = BALL_RADIUS + RIM_TUBE_RADIUS;

    if (distToTube < minSep && distToTube > 0.0001) {
      _tmpVec.divideScalar(distToTube); // Normal from rim tube toward ball
      this.position.addScaledVector(_tmpVec, minSep - distToTube);

      const vn = this.velocity.dot(_tmpVec);
      if (vn < 0) {
        this.velocity.addScaledVector(_tmpVec, -1.62 * vn);
        this.velocity.multiplyScalar(0.82);
        events.hitRim = Math.min(1, Math.abs(vn) / 7);
      }
    }
  }

  private checkScore(side: -1 | 1, events: BallEvents) {
    const rimX = side * HOOP_X;
    if (this.prevPosition.y >= RIM_HEIGHT && this.position.y < RIM_HEIGHT) {
      const dist = Math.hypot(this.position.x - rimX, this.position.z);
      if (dist < RIM_RADIUS * 0.92 && this.velocity.y < 0) {
        events.scoredSide = side;
        // Gently dampen ball through net for realistic swish drop
        this.velocity.x *= 0.28;
        this.velocity.z *= 0.28;
        this.velocity.y *= 0.65;
      }
    }
  }

  public dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    scene.remove(this.shadowMesh);
    this.disposables.forEach((d) => d.dispose());
  }
}

export function isThreePointShot(pos: THREE.Vector3, targetSide: -1 | 1): boolean {
  const hoopX = targetSide * HOOP_X;
  const distToHoop = Math.hypot(pos.x - hoopX, pos.z);
  const inCorner =
    (targetSide === 1 && pos.x > HOOP_X - 2.9) || (targetSide === -1 && pos.x < -HOOP_X + 2.9);

  if (inCorner) {
    return Math.abs(pos.z) >= THREE_POINT_CORNER_Z;
  }
  return distToHoop >= THREE_POINT_RADIUS;
}
