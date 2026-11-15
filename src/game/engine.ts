import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeAiIntent, getPlayerMoveSpeed, selectBestPassTarget, type SimPlayer } from './ai';
import { ArenaAudio } from './audio';
import { buildArena, type ArenaBuildResult } from './arena';
import {
  AWAY_ROSTER,
  AWAY_TEAM,
  BALL_RADIUS,
  FREE_THROW_LINE_X,
  GRAVITY,
  HALF_COURT_X,
  HALF_COURT_Z,
  HOME_ROSTER,
  HOME_TEAM,
  HOOP_X,
  MAX_TIMEOUTS,
  PLAYER_DUNK_JUMP_VELOCITY,
  PLAYER_JUMP_VELOCITY,
  QUARTER_DURATION_SECONDS,
  RIM_HEIGHT,
  SHOT_CLOCK_SECONDS,
} from './constants';
import { InputManager, type TouchActionButton } from './input';
import { BasketballPhysics, isThreePointShot } from './physics';
import { updatePlayerAnimation, type PlayerAnimState } from './playerAnimation';
import { createPlayerRig, type PlayerRig } from './playerModel';
import { createContactShadowTexture } from './textures';
import type {
  CameraMode,
  GameCallout,
  GameMode,
  GameSnapshot,
  InputState,
  LineupSlotSummary,
  PlayerAppearance,
  ShotMeterSnapshot,
  TeamId,
} from './types';

interface FullPlayer extends SimPlayer {
  appearance: PlayerAppearance;
  rig: PlayerRig;
  anim: PlayerAnimState;
}

const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _handPos = new THREE.Vector3();

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class BasketballEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private isSoftwareGl: boolean;

  private arena: ArenaBuildResult;
  private ball: BasketballPhysics;
  private shadowTexture: THREE.Texture;
  private audio = new ArenaAudio();
  private input: InputManager;

  private players: FullPlayer[] = [];
  private userTeam: TeamId = 'home';
  private homeLineupOrder: number[] = [0, 1, 2, 3, 4, 5, 6];
  private awayLineupOrder: number[] = [0, 1, 2, 3, 4, 5, 6];
  private selectedStarterSlot = 0;
  private playerStatsCache = new Map<
    string,
    { points: number; rebounds: number; assists: number; steals: number; blocks: number }
  >();
  private controlledPlayerId = '';
  private ballState: 'held' | 'free' | 'pass' | 'shot' = 'held';
  private ballHandlerId: string | null = null;
  private passTargetId: string | null = null;
  private lastPasserId: string | null = null;
  private lastShooterId: string | null = null;
  private lastShotTeam: TeamId = 'home';
  private lastShotWasThree = false;
  private lastShotIsFreeThrow = false;
  private lastTouchTeam: TeamId = 'home';
  private shotScoredThisAttempt = false;
  private ballPickupCooldown = 0;

  // Match State
  private gameMode: GameMode = '5v5';
  private cameraMode: CameraMode = 'broadcast';
  private homeScore = 0;
  private awayScore = 0;
  private homeFouls = 0;
  private awayFouls = 0;
  private homeTimeouts = MAX_TIMEOUTS;
  private awayTimeouts = MAX_TIMEOUTS;
  private quarter = 1;
  private gameClockSeconds = QUARTER_DURATION_SECONDS;
  private shotClockSeconds = SHOT_CLOCK_SECONDS;
  private possession: TeamId = 'home';
  private isPaused = false;
  private isQuarterBreak = false;
  private isGameOver = false;

  // Shot Meter, Dunk Target, Dead-ball Inbound & Free Throws
  private isChargingShot = false;
  private shotCharge = 0;
  private activeDunkTarget: {
    playerId: string;
    hoopSide: -1 | 1;
    startPos: THREE.Vector3;
    timer: number;
    duration: number;
    isDunk: boolean;
    foulChecked?: boolean;
  } | null = null;
  private pendingInbound: {
    team: TeamId;
    timer: number;
  } | null = null;
  private activeFreeThrow: {
    shooterId: string;
    team: TeamId;
    hoopSide: -1 | 1;
    shotsRemaining: number;
    totalShots: number;
    phase: 'aim' | 'flight';
    timer: number;
  } | null = null;

  // Crowd & Callouts
  private crowdExcitement = 0.15;
  private callout: GameCallout | null = null;
  private calloutIdCounter = 1;
  private calloutTimer = 0;

  // Loop
  private frameId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private hudThrottle = 0;
  private disposed = false;
  private onSnapshot: (snap: GameSnapshot) => void;

  constructor(container: HTMLElement, onSnapshot: (snap: GameSnapshot) => void) {
    this.container = container;
    this.onSnapshot = onSnapshot;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Mandatory Procedural Studio Reflection Environment
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.25, 180);
    this.camera.position.set(0, 11.5, 20.5);
    this.camera.lookAt(0, 1.2, 0);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = !this.isSoftwareGl;
    this.orbitControls.dampingFactor = 0.06;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.orbitControls.minDistance = 4;
    this.orbitControls.maxDistance = 42;
    this.orbitControls.enabled = false;

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.shadowTexture = createContactShadowTexture();
    this.arena = buildArena(this.scene, maxAnisotropy, this.isSoftwareGl);
    this.ball = new BasketballPhysics(this.scene, maxAnisotropy, this.shadowTexture, this.isSoftwareGl);

    this.input = new InputManager({
      onPauseToggle: () => this.togglePause(),
      onCameraCycle: () => this.cycleCameraMode(),
    });
    this.input.bind();

    this.spawnMatchPlayers('5v5');
    this.resetPossession('home', 'TIP-OFF');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerUnlock);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.emitSnapshot();
    this.lastTime = performance.now();
    this.tick();
  }

  private handlePointerUnlock = () => {
    this.audio.unlock();
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private clearPlayers() {
    this.players.forEach((p) => {
      this.scene.remove(p.rig.root);
      p.rig.dispose();
    });
    this.players = [];
  }

  private saveCurrentPlayerStats() {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      this.playerStatsCache.set(p.id, {
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        steals: p.steals,
        blocks: p.blocks,
      });
    }
  }

  private getSelectedUserPlayerId(): string {
    const userPlayers = this.players.filter((p) => p.team === this.userTeam);
    if (userPlayers.length === 0) return this.players[0]?.id ?? '';
    const clampedSlot = Math.max(0, Math.min(this.selectedStarterSlot, userPlayers.length - 1));
    this.selectedStarterSlot = clampedSlot;
    return userPlayers[clampedSlot].id;
  }

  private spawnMatchPlayers(mode: GameMode, preserveStats = false) {
    if (preserveStats) {
      this.saveCurrentPlayerStats();
    } else {
      this.playerStatsCache.clear();
    }
    this.clearPlayers();
    this.gameMode = mode;

    const slotMap =
      mode === '5v5'
        ? [
            { orderIdx: 0, roleIndex: 0 },
            { orderIdx: 1, roleIndex: 1 },
            { orderIdx: 2, roleIndex: 2 },
            { orderIdx: 3, roleIndex: 3 },
            { orderIdx: 4, roleIndex: 4 },
          ]
        : mode === '3v3'
        ? [
            { orderIdx: 0, roleIndex: 0 },
            { orderIdx: 1, roleIndex: 2 },
            { orderIdx: 2, roleIndex: 4 },
          ]
        : [
            { orderIdx: 0, roleIndex: 0 },
            { orderIdx: 1, roleIndex: 4 },
          ];

    const spawnTeam = (team: TeamId) => {
      if (mode === 'shootaround' && team !== this.userTeam) return;
      const roster = team === 'home' ? HOME_ROSTER : AWAY_ROSTER;
      const order = team === 'home' ? this.homeLineupOrder : this.awayLineupOrder;
      const teamConfig = team === 'home' ? HOME_TEAM : AWAY_TEAM;
      const dir = team === 'home' ? 1 : -1;

      slotMap.forEach(({ orderIdx, roleIndex }, activeIdx) => {
        const rosterIdx = order[orderIdx] ?? orderIdx;
        const app = roster[rosterIdx] ?? roster[0];
        const id = `${team}-${rosterIdx}`;
        const saved = preserveStats ? this.playerStatsCache.get(id) : undefined;
        const rig = createPlayerRig(app, teamConfig, this.shadowTexture, this.isSoftwareGl);
        this.scene.add(rig.root);
        this.players.push({
          id,
          team,
          roleIndex,
          appearance: app,
          heightMeters: app.heightMeters,
          rig,
          anim: {
            stridePhase: Math.random() * Math.PI * 2,
            dribblePhase: 0,
            dribbleHand: 'right',
            actionTimer: 0,
          },
          position: new THREE.Vector3(-dir * (4 + activeIdx * 1.1), 0, (activeIdx - 2) * 1.6),
          velocity: new THREE.Vector3(),
          facingYaw: dir === 1 ? Math.PI / 2 : -Math.PI / 2,
          verticalVel: 0,
          action: 'idle',
          actionTimer: 0,
          stamina: 100,
          stealCooldown: 0,
          aiShootTimer: 0.7 + Math.random() * 0.6,
          aiPassTimer: 0.9 + Math.random() * 0.8,
          aiCutTimer: 1.5 + roleIndex * 0.7,
          aiScreenTimer: 1.2 + Math.random(),
          aiHoldTime: 0,
          points: saved?.points ?? 0,
          rebounds: saved?.rebounds ?? 0,
          assists: saved?.assists ?? 0,
          steals: saved?.steals ?? 0,
          blocks: saved?.blocks ?? 0,
        });
      });
    };

    spawnTeam('home');
    spawnTeam('away');
    this.controlledPlayerId = this.getSelectedUserPlayerId();
  }

  private resetPossession(team: TeamId, banner?: string) {
    const activeTeam = this.gameMode === 'shootaround' ? this.userTeam : team;
    this.possession = activeTeam;
    this.lastTouchTeam = activeTeam;
    this.shotClockSeconds = SHOT_CLOCK_SECONDS;
    this.isChargingShot = false;
    this.shotCharge = 0;
    this.activeDunkTarget = null;
    this.pendingInbound = null;
    this.activeFreeThrow = null;
    this.shotScoredThisAttempt = false;
    this.lastShotIsFreeThrow = false;
    this.ballPickupCooldown = 0.25;
    this.passTargetId = null;
    this.lastPasserId = null;

    const dir = activeTeam === 'home' ? 1 : -1;
    const homePlayers = this.players.filter((p) => p.team === 'home');
    const awayPlayers = this.players.filter((p) => p.team === 'away');
    const userPlayers = this.userTeam === 'home' ? homePlayers : awayPlayers;

    this.controlledPlayerId = this.getSelectedUserPlayerId();

    if (this.gameMode === 'shootaround') {
      const shooter = userPlayers.find((p) => p.id === this.controlledPlayerId) ?? userPlayers[0];
      const partner = userPlayers.find((p) => p.id !== shooter?.id);
      if (shooter) {
        shooter.position.set(dir * 4.5, 0, 0);
        shooter.facingYaw = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        shooter.velocity.set(0, 0, 0);
        shooter.action = 'idle';
        this.ballHandlerId = shooter.id;
        this.controlledPlayerId = shooter.id;
      }
      if (partner) {
        partner.position.set(dir * 11.4, 0, -2.4);
        partner.facingYaw = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        partner.velocity.set(0, 0, 0);
      }
      this.ballState = 'held';
      if (banner) this.pushCallout(banner, 'Open Court Practice', this.userTeam);
      return;
    }

    // Standard full-court inbound formation
    const offPlayers = activeTeam === 'home' ? homePlayers : awayPlayers;
    const defPlayers = activeTeam === 'home' ? awayPlayers : homePlayers;

    offPlayers.forEach((p, idx) => {
      const x = idx === 0 ? -dir * 8.2 : -dir * (3.5 - idx * 1.4);
      const z = idx === 0 ? 0 : (idx % 2 === 0 ? 1 : -1) * (2.1 + idx * 0.9);
      p.position.set(
        THREE.MathUtils.clamp(x, -HALF_COURT_X + 1.5, HALF_COURT_X - 1.5),
        0,
        THREE.MathUtils.clamp(z, -HALF_COURT_Z + 1.2, HALF_COURT_Z - 1.2)
      );
      p.velocity.set(0, 0, 0);
      p.verticalVel = 0;
      p.action = 'idle';
      p.facingYaw = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      p.aiShootTimer = 0.7 + Math.random() * 0.7;
      p.aiPassTimer = 0.9 + Math.random() * 0.8;
      p.aiCutTimer = 1.4 + idx * 0.6;
      p.aiScreenTimer = 1.2 + Math.random();
      p.aiHoldTime = 0;
    });

    defPlayers.forEach((p, idx) => {
      const x = dir * (2.2 + idx * 1.5);
      const z = idx === 0 ? 0 : (idx % 2 === 0 ? 1 : -1) * (1.8 + idx * 0.8);
      p.position.set(
        THREE.MathUtils.clamp(x, -HALF_COURT_X + 1.5, HALF_COURT_X - 1.5),
        0,
        THREE.MathUtils.clamp(z, -HALF_COURT_Z + 1.2, HALF_COURT_Z - 1.2)
      );
      p.velocity.set(0, 0, 0);
      p.verticalVel = 0;
      p.action = 'idle';
      p.facingYaw = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      p.aiHoldTime = 0;
    });

    const pg = offPlayers[0];
    if (pg) {
      this.ballHandlerId = pg.id;
      this.ballState = 'held';
    }

    if (banner) {
      this.pushCallout(banner, `${activeTeam === 'home' ? HOME_TEAM.name : AWAY_TEAM.name} Ball`, activeTeam);
    }
  }

  private pushCallout(text: string, subtext: string | undefined, tone: GameCallout['tone']) {
    this.callout = {
      id: this.calloutIdCounter++,
      text,
      subtext,
      tone,
      timestamp: performance.now(),
    };
    this.calloutTimer = 2.4;
  }

  // Public Controls API for React HUD & Touch Controls
  public setGameMode(mode: GameMode) {
    this.audio.unlock();
    this.homeScore = 0;
    this.awayScore = 0;
    this.homeFouls = 0;
    this.awayFouls = 0;
    this.homeTimeouts = MAX_TIMEOUTS;
    this.awayTimeouts = MAX_TIMEOUTS;
    this.quarter = 1;
    this.gameClockSeconds = QUARTER_DURATION_SECONDS;
    this.isGameOver = false;
    this.isQuarterBreak = false;
    this.isPaused = false;
    this.spawnMatchPlayers(mode, false);
    this.resetPossession(
      this.userTeam,
      mode === 'shootaround' ? 'SHOOTAROUND' : `${mode.toUpperCase()} TIP-OFF`
    );
    this.emitSnapshot();
  }

  public setUserTeam(team: TeamId) {
    this.audio.unlock();
    if (team === this.userTeam) return;
    this.userTeam = team;
    this.isChargingShot = false;
    this.shotCharge = 0;
    this.selectedStarterSlot = 0;

    if (this.gameMode === 'shootaround') {
      this.spawnMatchPlayers('shootaround', true);
      this.resetPossession(team, 'SHOOTAROUND');
    } else {
      this.controlledPlayerId = this.getSelectedUserPlayerId();
      const teamName = team === 'home' ? HOME_TEAM.name : AWAY_TEAM.name;
      this.pushCallout('TEAM SELECTED', `Playing as ${teamName}`, team);
    }
    this.emitSnapshot();
  }

  public selectControlledStarter(slotIndex: number) {
    this.audio.unlock();
    const userPlayers = this.players.filter((p) => p.team === this.userTeam);
    if (userPlayers.length === 0) return;
    const clamped = Math.max(0, Math.min(slotIndex, userPlayers.length - 1));
    this.selectedStarterSlot = clamped;
    this.isChargingShot = false;
    this.shotCharge = 0;
    this.controlledPlayerId = userPlayers[clamped].id;
    const target = userPlayers[clamped];
    this.pushCallout(
      'PLAYER SELECTED',
      `#${target.appearance.jerseyNumber} ${target.appearance.name} (${target.appearance.position})`,
      this.userTeam
    );
    this.emitSnapshot();
  }

  public swapLineupSlots(slotA: number, slotB: number) {
    this.audio.unlock();
    const order = this.userTeam === 'home' ? this.homeLineupOrder : this.awayLineupOrder;
    if (
      slotA < 0 ||
      slotB < 0 ||
      slotA >= order.length ||
      slotB >= order.length ||
      slotA === slotB
    ) {
      return;
    }
    if (this.activeDunkTarget || this.activeFreeThrow) {
      this.pushCallout('PLAY IN PROGRESS', 'Complete current play before substituting', 'neutral');
      this.emitSnapshot();
      return;
    }

    // Preserve active court slots' positions and ball handler slot
    const prevControlledId = this.controlledPlayerId;
    const prevUserPlayers = this.players.filter((p) => p.team === this.userTeam);
    const prevSlots = prevUserPlayers.map((p) => ({
      position: p.position.clone(),
      velocity: p.velocity.clone(),
      facingYaw: p.facingYaw,
      verticalVel: p.verticalVel,
      action: p.action,
      hadBall: p.id === this.ballHandlerId,
    }));

    const tmp = order[slotA];
    order[slotA] = order[slotB];
    order[slotB] = tmp;

    // Also preserve other team's current transforms so nobody teleports
    const otherTeam: TeamId = this.userTeam === 'home' ? 'away' : 'home';
    const prevOtherPlayers = this.players.filter((p) => p.team === otherTeam);
    const prevOtherSlots = prevOtherPlayers.map((p) => ({
      position: p.position.clone(),
      velocity: p.velocity.clone(),
      facingYaw: p.facingYaw,
      verticalVel: p.verticalVel,
      action: p.action,
    }));

    this.isChargingShot = false;
    this.shotCharge = 0;
    this.spawnMatchPlayers(this.gameMode, true);

    const newUserPlayers = this.players.filter((p) => p.team === this.userTeam);
    newUserPlayers.forEach((p, idx) => {
      const saved = prevSlots[idx];
      if (!saved) return;
      p.position.copy(saved.position);
      p.velocity.copy(saved.velocity);
      p.facingYaw = saved.facingYaw;
      p.verticalVel = saved.verticalVel;
      p.action = saved.action;
      if (saved.hadBall) {
        this.ballHandlerId = p.id;
      }
    });

    const newOtherPlayers = this.players.filter((p) => p.team === otherTeam);
    newOtherPlayers.forEach((p, idx) => {
      const saved = prevOtherSlots[idx];
      if (!saved) return;
      p.position.copy(saved.position);
      p.velocity.copy(saved.velocity);
      p.facingYaw = saved.facingYaw;
      p.verticalVel = saved.verticalVel;
      p.action = saved.action;
    });

    const keptSlot = newUserPlayers.findIndex((p) => p.id === prevControlledId);
    if (keptSlot >= 0) {
      this.selectedStarterSlot = keptSlot;
    }
    this.controlledPlayerId = this.getSelectedUserPlayerId();
    this.pushCallout('LINEUP UPDATED', 'Rotation applied on court', this.userTeam);
    this.emitSnapshot();
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.orbitControls.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      this.orbitControls.target.set(this.ball.position.x * 0.4, 1.4, this.ball.position.z * 0.4);
    }
    this.emitSnapshot();
  }

  public cycleCameraMode() {
    const order: CameraMode[] = ['broadcast', 'follow', 'courtside', 'orbit'];
    const idx = (order.indexOf(this.cameraMode) + 1) % order.length;
    this.setCameraMode(order[idx]);
  }

  public togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    this.emitSnapshot();
  }

  public callTimeout() {
    this.audio.unlock();
    if (this.gameMode === 'shootaround' || this.isGameOver) return;
    const isUserHome = this.userTeam === 'home';
    const remaining = isUserHome ? this.homeTimeouts : this.awayTimeouts;
    const teamName = isUserHome ? HOME_TEAM.name : AWAY_TEAM.name;
    if (remaining <= 0) {
      this.pushCallout('NO TIMEOUTS LEFT', teamName, 'neutral');
      this.emitSnapshot();
      return;
    }
    if (isUserHome) this.homeTimeouts -= 1;
    else this.awayTimeouts -= 1;
    const updatedRemaining = isUserHome ? this.homeTimeouts : this.awayTimeouts;

    this.audio.playWhistle();
    this.players.forEach((p) => {
      if (p.team === this.userTeam) p.stamina = Math.min(100, p.stamina + 35);
    });
    this.shotClockSeconds = Math.max(14, this.shotClockSeconds);
    this.isPaused = true;
    this.pushCallout('TIMEOUT CALLED', `${teamName} · ${updatedRemaining} Remaining`, this.userTeam);
    this.emitSnapshot();
  }

  public toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.isMuted());
    this.emitSnapshot();
  }

  public advanceQuarterOrRestart() {
    this.audio.unlock();
    if (this.isGameOver) {
      this.setGameMode(this.gameMode);
      return;
    }
    if (this.isQuarterBreak) {
      this.quarter += 1;
      this.gameClockSeconds = QUARTER_DURATION_SECONDS;
      this.homeFouls = 0;
      this.awayFouls = 0;
      this.isQuarterBreak = false;
      this.isPaused = false;
      this.resetPossession(this.quarter % 2 === 0 ? 'away' : 'home', `QUARTER ${this.quarter}`);
      this.emitSnapshot();
    }
  }

  public setTouchMove(x: number, z: number) {
    this.audio.unlock();
    this.input.setTouchMove(x, z);
  }

  public setTouchButton(button: TouchActionButton, pressed: boolean) {
    this.audio.unlock();
    this.input.setTouchButton(button, pressed);
  }

  // Main Frame Loop
  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    const inputState = this.input.poll();

    if (!this.isPaused && !this.isQuarterBreak && !this.isGameOver) {
      this.elapsed += dt;
      this.stepSimulation(dt, inputState);
    }

    this.updateCamera(dt);
    this.arena.update(dt, this.elapsed, this.shotClockSeconds, this.crowdExcitement);
    this.crowdExcitement = Math.max(0.12, this.crowdExcitement - dt * 0.25);

    this.renderer.render(this.scene, this.camera);

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.08) {
      this.hudThrottle = 0;
      this.emitSnapshot(inputState);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private stepSimulation(dt: number, input: InputState) {
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.callout = null;
    }
    if (this.ballPickupCooldown > 0) {
      this.ballPickupCooldown -= dt;
    }

    // Brief celebration/dead-ball window after made basket before inbound reset
    if (this.pendingInbound) {
      this.pendingInbound.timer -= dt;
      this.ball.stepFreeFlight(dt);
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.position.y > 0 || p.verticalVel > 0) {
          p.verticalVel -= GRAVITY * dt;
          p.position.y += p.verticalVel * dt;
          if (p.position.y <= 0) {
            p.position.y = 0;
            p.verticalVel = 0;
            p.action = 'idle';
          }
        }
        p.rig.root.position.copy(p.position);
        p.rig.root.rotation.y = p.facingYaw;
        updatePlayerAnimation(p.rig, p.anim, p.action, 0, p.position.y, false, false, dt);
      }
      if (this.pendingInbound.timer <= 0) {
        const nextTeam = this.pendingInbound.team;
        this.pendingInbound = null;
        this.resetPossession(nextTeam);
      }
      return;
    }

    // Active Free Throw sequence (clock stopped)
    if (this.activeFreeThrow) {
      this.stepFreeThrowSequence(dt, input);
      return;
    }

    // Clocks (skip shot/game clock expiry in shootaround)
    if (this.gameMode !== 'shootaround') {
      this.gameClockSeconds -= dt;
      if (this.gameClockSeconds <= 0) {
        this.gameClockSeconds = 0;
        this.audio.playBuzzer();
        if (this.quarter >= 4 && this.homeScore !== this.awayScore) {
          this.isGameOver = true;
          const winner = this.homeScore > this.awayScore ? HOME_TEAM.name : AWAY_TEAM.name;
          this.pushCallout('FINAL BUZZER', `${winner} Win ${this.homeScore}–${this.awayScore}`, 'gold');
        } else {
          this.isQuarterBreak = true;
          this.pushCallout(
            this.quarter >= 4 ? 'OVERTIME AHEAD' : `END OF Q${this.quarter}`,
            `${AWAY_TEAM.shortName} ${this.awayScore} · ${HOME_TEAM.shortName} ${this.homeScore}`,
            'neutral'
          );
        }
        this.emitSnapshot(input);
        return;
      }

      if (this.ballState === 'held' || this.ballState === 'pass') {
        this.shotClockSeconds -= dt;
        if (this.shotClockSeconds <= 0) {
          this.shotClockSeconds = 0;
          this.audio.playBuzzer();
          const nextTeam: TeamId = this.possession === 'home' ? 'away' : 'home';
          this.resetPossession(nextTeam, 'SHOT CLOCK VIOLATION');
          return;
        }
      }
    }

    const ballHandler = this.players.find((p) => p.id === this.ballHandlerId) ?? null;
    this.controlledPlayerId = this.players.some((p) => p.id === this.controlledPlayerId)
      ? this.controlledPlayerId
      : this.getSelectedUserPlayerId();

    // Explicit teammate switch (Tab / V / RB)
    if (input.switchPlayerPressed) {
      this.switchToNextUserTeammate(ballHandler);
    }

    // Off-ball PASS/SWITCH action: Call for Pass on offense, or Switch Defender on defense/loose ball
    if (input.passPressed && ballHandler?.id !== this.controlledPlayerId) {
      if (
        ballHandler &&
        ballHandler.team === this.userTeam &&
        this.ballState === 'held' &&
        ballHandler.position.y <= 0.1
      ) {
        this.executePass(ballHandler, 0, 0, this.controlledPlayerId);
      } else if (!ballHandler || ballHandler.team !== this.userTeam) {
        this.switchToNearestUserDefender();
      }
    }

    // Active Dunk / Layup Animation Sequence
    if (this.activeDunkTarget) {
      this.stepDunkOrLayupSequence(dt);
    }

    // Update every player (Human always controls controlledPlayerId; all 9 others run AI)
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.stealCooldown = Math.max(0, p.stealCooldown - dt);
      if (p.actionTimer > 0) {
        p.actionTimer -= dt;
        if (p.actionTimer <= 0 && p.position.y <= 0.02) {
          p.action = 'idle';
        }
      }

      const isControlled = p.id === this.controlledPlayerId;
      const isDunkingPlayer = this.activeDunkTarget?.playerId === p.id;
      if (isDunkingPlayer) continue;

      if (isControlled) {
        this.stepControlledPlayer(p, input, ballHandler, dt);
      } else {
        this.stepAiPlayer(p, ballHandler, dt);
      }

      // Gravity & Vertical Jump Physics
      if (p.position.y > 0 || p.verticalVel > 0) {
        p.verticalVel -= GRAVITY * dt;
        p.position.y += p.verticalVel * dt;
        if (p.position.y <= 0) {
          p.position.y = 0;
          p.verticalVel = 0;
          if (p.action === 'jump' || p.action === 'shoot' || p.action === 'block') {
            p.action = 'idle';
          }
        }
      }

      // Court boundary clamping
      p.position.x = THREE.MathUtils.clamp(p.position.x, -HALF_COURT_X + 0.35, HALF_COURT_X - 0.35);
      p.position.z = THREE.MathUtils.clamp(p.position.z, -HALF_COURT_Z + 0.35, HALF_COURT_Z - 0.35);

      // Soft player-to-player collision separation
      for (let j = i + 1; j < this.players.length; j++) {
        const other = this.players[j];
        const dx = p.position.x - other.position.x;
        const dz = p.position.z - other.position.z;
        const dist = Math.hypot(dx, dz);
        const minSep = 0.72;
        if (dist < minSep && dist > 0.0001) {
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          p.position.x += nx * push;
          p.position.z += nz * push;
          other.position.x -= nx * push;
          other.position.z -= nz * push;
        }
      }

      // Sync 3D Rig & Animation
      p.rig.root.position.copy(p.position);
      p.rig.root.rotation.y = p.facingYaw;
      p.rig.selectionRing.visible = isControlled;

      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      const hasBall = this.ballState === 'held' && this.ballHandlerId === p.id;
      const isDefending =
        p.action === 'defend' ||
        (p.team !== this.possession && speed > 0.2 && (isControlled ? input.defendHeld : true));

      updatePlayerAnimation(p.rig, p.anim, p.action, speed, p.position.y, hasBall, isDefending, dt);
    }

    // Update Ball Position & Physics
    this.stepBall(dt);
  }

  private stepControlledPlayer(
    p: FullPlayer,
    input: InputState,
    ballHandler: FullPlayer | null,
    dt: number
  ) {
    const attackSide: -1 | 1 = p.team === 'home' ? 1 : -1;
    const hasBall = this.ballState === 'held' && ballHandler?.id === p.id;
    const isDefending = !hasBall && input.defendHeld;
    const moveSpeed = getPlayerMoveSpeed(input.sprint && !this.isChargingShot, isDefending, p.stamina);

    // Camera-aligned movement: Broadcast looks toward -Z, Follow looks toward attacking basket
    let worldMoveX = input.moveX;
    let worldMoveZ = input.moveZ;
    if (this.cameraMode === 'follow') {
      const followDir = this.userTeam === 'home' ? 1 : -1;
      worldMoveX = -input.moveZ * followDir;
      worldMoveZ = input.moveX * followDir;
    }

    const moveMag = Math.hypot(worldMoveX, worldMoveZ);
    const targetVx = moveMag > 0.05 ? worldMoveX * moveSpeed : 0;
    const targetVz = moveMag > 0.05 ? worldMoveZ * moveSpeed : 0;

    p.velocity.x = THREE.MathUtils.damp(p.velocity.x, targetVx, 14, dt);
    p.velocity.z = THREE.MathUtils.damp(p.velocity.z, targetVz, 14, dt);
    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;

    // Stamina drain/recover
    if (input.sprint && moveMag > 0.2) {
      p.stamina = Math.max(0, p.stamina - dt * 14);
    } else {
      p.stamina = Math.min(100, p.stamina + dt * 9);
    }

    if (moveMag > 0.5 && input.sprint && Math.random() < 0.015) {
      this.audio.playSqueak();
    }

    // Facing Yaw
    if (isDefending && ballHandler) {
      const targetYaw = Math.atan2(ballHandler.position.x - p.position.x, ballHandler.position.z - p.position.z);
      p.facingYaw = dampAngle(p.facingYaw, targetYaw, 14, dt);
    } else if (this.isChargingShot) {
      const hoopX = attackSide * HOOP_X;
      const targetYaw = Math.atan2(hoopX - p.position.x, -p.position.z);
      p.facingYaw = dampAngle(p.facingYaw, targetYaw, 18, dt);
    } else if (moveMag > 0.1) {
      const targetYaw = Math.atan2(worldMoveX, worldMoveZ);
      p.facingYaw = dampAngle(p.facingYaw, targetYaw, 14, dt);
    }

    if (p.position.y <= 0.02 && p.actionTimer <= 0) {
      p.action = isDefending ? 'defend' : moveMag > 0.15 ? (input.sprint ? 'run' : 'walk') : 'idle';
    }

    // Offensive Actions
    if (hasBall) {
      // Crossover / Drive move
      if (input.stealOrCrossPressed && p.position.y <= 0.05) {
        p.anim.dribbleHand = p.anim.dribbleHand === 'right' ? 'left' : 'right';
        const burstDir = p.anim.dribbleHand === 'right' ? 1 : -1;
        p.position.z += burstDir * 0.42;
        this.audio.playSqueak();
      }

      // Pass
      if (input.passPressed) {
        this.isChargingShot = false;
        this.shotCharge = 0;
        this.executePass(p, worldMoveX, worldMoveZ);
        return;
      }

      // Hold-and-release Shot / Layup / Dunk
      const distToHoop = Math.hypot(attackSide * HOOP_X - p.position.x, p.position.z);
      if (input.shootJustPressed && p.position.y <= 0.05) {
        // Check immediate Slam Dunk / Layup drive
        if (distToHoop < 2.25 && input.sprint && p.stamina > 12) {
          this.startDunkOrLayup(p, attackSide, true);
          return;
        }
        if (distToHoop < 3.45 && moveMag > 0.35) {
          this.startDunkOrLayup(p, attackSide, false);
          return;
        }
        this.isChargingShot = true;
        this.shotCharge = 0.05;
      }

      if (this.isChargingShot) {
        this.shotCharge = Math.min(1.0, this.shotCharge + dt * 1.32);
        if (input.shootJustReleased || this.shotCharge >= 0.99) {
          this.isChargingShot = false;
          this.executeJumpShot(p, attackSide, this.shotCharge);
          this.shotCharge = 0;
        }
      }
    } else {
      // Defensive / Off-ball Actions
      if (input.stealOrCrossPressed && p.stealCooldown <= 0 && p.position.y <= 0.05) {
        this.executeStealAttempt(p);
      }
      if ((input.blockOrReboundPressed || input.shootJustPressed) && p.position.y <= 0.05) {
        p.verticalVel = PLAYER_JUMP_VELOCITY;
        p.action = 'block';
        p.actionTimer = 0.55;
      }
    }
  }

  private stepAiPlayer(p: FullPlayer, ballHandler: FullPlayer | null, dt: number) {
    const intent = computeAiIntent(
      p,
      this.players,
      this.ball.position,
      this.ballState,
      ballHandler,
      this.possession,
      this.shotClockSeconds,
      dt,
      this.lastPasserId,
      this.passTargetId,
      this.controlledPlayerId
    );

    const speed = getPlayerMoveSpeed(intent.sprint, intent.defend, p.stamina);
    p.velocity.x = THREE.MathUtils.damp(p.velocity.x, intent.moveX * speed, 11, dt);
    p.velocity.z = THREE.MathUtils.damp(p.velocity.z, intent.moveZ * speed, 11, dt);
    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;

    const moveMag = Math.hypot(p.velocity.x, p.velocity.z);
    if (intent.sprint && moveMag > 0.6) {
      p.stamina = Math.max(0, p.stamina - dt * 11);
    } else {
      p.stamina = Math.min(100, p.stamina + dt * 9);
    }

    if (intent.defend && ballHandler) {
      const yaw = Math.atan2(ballHandler.position.x - p.position.x, ballHandler.position.z - p.position.z);
      p.facingYaw = dampAngle(p.facingYaw, yaw, 12, dt);
    } else if (moveMag > 0.25) {
      const yaw = Math.atan2(p.velocity.x, p.velocity.z);
      p.facingYaw = dampAngle(p.facingYaw, yaw, 12, dt);
    }

    if (p.position.y <= 0.02 && p.actionTimer <= 0) {
      p.action = intent.defend ? 'defend' : moveMag > 0.25 ? (intent.sprint ? 'run' : 'walk') : 'idle';
    }

    const hasBall = this.ballState === 'held' && ballHandler?.id === p.id;
    const attackSide: -1 | 1 = p.team === 'home' ? 1 : -1;

    if (hasBall) {
      if (intent.wantsPass) {
        this.executePass(p, 0, 0, intent.passTargetId);
      } else if (intent.wantsShoot) {
        const distToHoop = Math.hypot(attackSide * HOOP_X - p.position.x, p.position.z);
        if (distToHoop < 2.2) {
          this.startDunkOrLayup(p, attackSide, true);
        } else if (distToHoop < 3.4) {
          this.startDunkOrLayup(p, attackSide, false);
        } else {
          // AI shot release accuracy (~0.66..0.92 centered on 0.79 for realistic FG% & rebounds)
          this.executeJumpShot(p, attackSide, 0.66 + Math.random() * 0.26);
        }
      }
    } else {
      if (intent.wantsSteal && p.stealCooldown <= 0 && p.position.y <= 0.05) {
        this.executeStealAttempt(p);
      }
      if (intent.wantsBlock && p.position.y <= 0.05) {
        p.verticalVel = PLAYER_JUMP_VELOCITY;
        p.action = 'block';
        p.actionTimer = 0.55;
      }
    }
  }

  private switchToNearestUserDefender() {
    const userPlayers = this.players.filter((p) => p.team === this.userTeam);
    if (userPlayers.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < userPlayers.length; i++) {
      const up = userPlayers[i];
      const d = Math.hypot(up.position.x - this.ball.position.x, up.position.z - this.ball.position.z);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    this.isChargingShot = false;
    this.shotCharge = 0;
    this.selectedStarterSlot = bestIdx;
    this.controlledPlayerId = userPlayers[bestIdx].id;
  }

  private switchToNextUserTeammate(ballHandler: FullPlayer | null) {
    const userPlayers = this.players.filter((p) => p.team === this.userTeam);
    if (userPlayers.length <= 1) return;

    this.isChargingShot = false;
    this.shotCharge = 0;

    // If an AI teammate holds the ball, jump straight to them for immediate control
    if (ballHandler && ballHandler.team === this.userTeam && ballHandler.id !== this.controlledPlayerId) {
      const bhIdx = userPlayers.findIndex((p) => p.id === ballHandler.id);
      if (bhIdx >= 0) {
        this.selectedStarterSlot = bhIdx;
        this.controlledPlayerId = ballHandler.id;
        return;
      }
    }

    const curIdx = userPlayers.findIndex((p) => p.id === this.controlledPlayerId);
    const nextIdx = (curIdx + 1) % userPlayers.length;
    this.selectedStarterSlot = nextIdx;
    this.controlledPlayerId = userPlayers[nextIdx].id;
  }

  private executePass(passer: FullPlayer, dirX: number, dirZ: number, explicitTargetId?: string) {
    const teammates = this.players.filter((p) => p.team === passer.team && p.id !== passer.id);
    if (teammates.length === 0) return;

    const attackDir: -1 | 1 = passer.team === 'home' ? 1 : -1;
    let bestTarget: FullPlayer | undefined = explicitTargetId
      ? teammates.find((tm) => tm.id === explicitTargetId)
      : undefined;

    if (!bestTarget) {
      const evalRes = selectBestPassTarget(
        passer,
        this.players,
        attackDir,
        this.lastPasserId,
        dirX,
        dirZ,
        this.controlledPlayerId
      );
      bestTarget = (evalRes.target as FullPlayer | null) ?? teammates[0];
    }

    passer.action = 'pass';
    passer.actionTimer = 0.28;
    passer.aiHoldTime = 0;
    passer.facingYaw = Math.atan2(
      bestTarget.position.x - passer.position.x,
      bestTarget.position.z - passer.position.z
    );

    const from = _tmpVec.set(passer.position.x, passer.heightMeters * 0.72, passer.position.z);
    const targetX = THREE.MathUtils.clamp(
      bestTarget.position.x + bestTarget.velocity.x * 0.16,
      -HALF_COURT_X + 0.5,
      HALF_COURT_X - 0.5
    );
    const targetZ = THREE.MathUtils.clamp(
      bestTarget.position.z + bestTarget.velocity.z * 0.16,
      -HALF_COURT_Z + 0.5,
      HALF_COURT_Z - 0.5
    );
    const to = new THREE.Vector3(targetX, bestTarget.heightMeters * 0.68, targetZ);

    this.ball.launchPass(from, to, 16.2);
    this.ballState = 'pass';
    this.ballHandlerId = null;
    this.passTargetId = bestTarget.id;
    this.lastPasserId = passer.id;
    this.lastTouchTeam = passer.team;
    this.ballPickupCooldown = 0.1;
    this.audio.playBounce(0.45);
  }

  private executeJumpShot(shooter: FullPlayer, targetSide: -1 | 1, chargeValue: number) {
    // Evaluate ideal green release window [0.70, 0.88]
    const idealCenter = 0.79;
    const delta = Math.abs(chargeValue - idealCenter);
    const accuracyScore = Math.max(0.18, 1 - delta * 2.15);

    // Evaluate defensive contest
    let contest = 0;
    for (let i = 0; i < this.players.length; i++) {
      const def = this.players[i];
      if (def.team === shooter.team) continue;
      const d = Math.hypot(def.position.x - shooter.position.x, def.position.z - shooter.position.z);
      if (d < 2.2) {
        const jumpBoost = def.action === 'block' || def.position.y > 0.2 ? 1.25 : 0.85;
        contest = Math.max(contest, ((2.2 - d) / 2.2) * jumpBoost);
      }
    }
    contest = Math.min(1, contest);

    shooter.verticalVel = PLAYER_JUMP_VELOCITY;
    shooter.action = 'shoot';
    shooter.actionTimer = 0.55;
    shooter.aiHoldTime = 0;
    shooter.facingYaw = Math.atan2(targetSide * HOOP_X - shooter.position.x, -shooter.position.z);

    this.lastShooterId = shooter.id;
    this.lastShotTeam = shooter.team;
    this.lastTouchTeam = shooter.team;
    this.lastShotWasThree = isThreePointShot(shooter.position, targetSide);
    this.lastShotIsFreeThrow = false;
    this.shotScoredThisAttempt = false;

    const releasePos = _tmpVec.set(shooter.position.x, shooter.heightMeters + 0.35, shooter.position.z);
    this.ball.launchShot(releasePos, targetSide, accuracyScore, contest);
    this.ballState = 'shot';
    this.ballHandlerId = null;
    this.ballPickupCooldown = 0.28;

    if (shooter.id === this.controlledPlayerId && delta < 0.085) {
      this.pushCallout('GREEN RELEASE', this.lastShotWasThree ? '3-PT Attempt' : 'Mid-Range', 'gold');
    }
  }

  private startDunkOrLayup(player: FullPlayer, hoopSide: -1 | 1, isDunk: boolean) {
    player.action = isDunk ? 'dunk' : 'layup';
    player.actionTimer = 0.55;
    player.aiHoldTime = 0;
    player.facingYaw = Math.atan2(hoopSide * HOOP_X - player.position.x, -player.position.z);

    this.activeDunkTarget = {
      playerId: player.id,
      hoopSide,
      startPos: player.position.clone(),
      timer: 0,
      duration: isDunk ? 0.44 : 0.48,
      isDunk,
      foulChecked: false,
    };
    this.lastShooterId = player.id;
    this.lastShotTeam = player.team;
    this.lastTouchTeam = player.team;
    this.lastShotWasThree = false;
    this.lastShotIsFreeThrow = false;
    this.shotScoredThisAttempt = false;
  }

  private stepDunkOrLayupSequence(dt: number) {
    const seq = this.activeDunkTarget;
    if (!seq) return;
    const p = this.players.find((pl) => pl.id === seq.playerId);
    if (!p) {
      this.activeDunkTarget = null;
      return;
    }

    seq.timer += dt;
    const t = Math.min(1, seq.timer / seq.duration);
    const hoopX = seq.hoopSide * HOOP_X;
    const stopX = hoopX - seq.hoopSide * (seq.isDunk ? 0.42 : 0.95);

    p.position.x = THREE.MathUtils.lerp(seq.startPos.x, stopX, t);
    p.position.z = THREE.MathUtils.lerp(seq.startPos.z, 0, t);
    p.position.y = Math.sin(t * Math.PI) * (seq.isDunk ? 1.28 : 0.88);
    p.facingYaw = Math.atan2(hoopX - p.position.x, -p.position.z);

    p.rig.root.position.copy(p.position);
    p.rig.root.rotation.y = p.facingYaw;
    p.rig.selectionRing.visible = p.id === this.controlledPlayerId;
    updatePlayerAnimation(p.rig, p.anim, seq.isDunk ? 'dunk' : 'layup', 5.5, p.position.y, true, false, dt);

    // Keep ball pinned to player's elevated right hand until apex
    p.rig.rightHandAnchor.getWorldPosition(_handPos);
    this.ball.position.copy(_handPos);
    this.ball.syncVisuals(dt);

    // Check for shooting foul by rim contest during layup/dunk drive
    if (!seq.foulChecked && t > 0.35 && t < 0.72 && this.gameMode !== 'shootaround') {
      seq.foulChecked = true;
      for (let i = 0; i < this.players.length; i++) {
        const def = this.players[i];
        if (def.team === p.team) continue;
        const dist = Math.hypot(def.position.x - p.position.x, def.position.z - p.position.z);
        if (dist < 0.92 && (def.action === 'block' || def.action === 'steal') && Math.random() < 0.22) {
          this.audio.playWhistle();
          if (def.team === 'home') this.homeFouls += 1;
          else this.awayFouls += 1;
          this.pushCallout('SHOOTING FOUL', `${def.appearance.name} · 2 Free Throws`, p.team);
          this.startFreeThrows(p, 2);
          return;
        }
      }
    }

    if (t >= 0.78) {
      this.activeDunkTarget = null;
      p.verticalVel = PLAYER_DUNK_JUMP_VELOCITY * 0.15;
      if (seq.isDunk) {
        // Slam straight down through the hoop!
        this.ball.position.set(hoopX, RIM_HEIGHT + 0.15, 0);
        this.ball.prevPosition.set(hoopX, RIM_HEIGHT + 0.35, 0);
        this.ball.velocity.set(0, -6.2, 0);
        this.ballState = 'shot';
        this.ballHandlerId = null;
        this.ballPickupCooldown = 0.35;
        this.arena.triggerSwish(seq.hoopSide, true);
        this.audio.playRimClank(0.95);
      } else {
        // Soft scoop layup drop
        this.ball.launchShot(
          new THREE.Vector3(p.position.x, p.position.y + p.heightMeters + 0.2, p.position.z),
          seq.hoopSide,
          0.92,
          0.1
        );
        this.ballState = 'shot';
        this.ballHandlerId = null;
        this.ballPickupCooldown = 0.3;
      }
    }
  }

  private startFreeThrows(shooter: FullPlayer, totalShots: number) {
    const hoopSide: -1 | 1 = shooter.team === 'home' ? 1 : -1;
    const ftX = hoopSide * FREE_THROW_LINE_X;

    this.isChargingShot = false;
    this.shotCharge = 0;
    this.activeDunkTarget = null;
    this.pendingInbound = null;
    this.possession = shooter.team;
    this.lastTouchTeam = shooter.team;
    this.ballHandlerId = shooter.id;
    this.ballState = 'held';
    this.passTargetId = null;
    this.lastPasserId = null;
    this.shotScoredThisAttempt = false;
    this.lastShotIsFreeThrow = true;
    this.lastShotWasThree = false;
    this.lastShooterId = shooter.id;
    this.lastShotTeam = shooter.team;

    shooter.position.set(ftX, 0, 0);
    shooter.velocity.set(0, 0, 0);
    shooter.verticalVel = 0;
    shooter.action = 'idle';
    shooter.facingYaw = Math.atan2(hoopSide * HOOP_X - ftX, 0);

    // Line up rebounders along the paint lane and guards behind arc
    let laneSlot = 0;
    let arcSlot = 0;
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      if (pl.id === shooter.id) continue;
      pl.velocity.set(0, 0, 0);
      pl.verticalVel = 0;
      pl.action = 'idle';
      if (laneSlot < 4) {
        const sideZ = laneSlot % 2 === 0 ? -2.75 : 2.75;
        const depth = Math.floor(laneSlot / 2);
        pl.position.set(hoopSide * (FREE_THROW_LINE_X + 1.15 + depth * 1.15), 0, sideZ);
        laneSlot += 1;
      } else {
        const sideZ = arcSlot % 2 === 0 ? -3.4 : 3.4;
        pl.position.set(hoopSide * (FREE_THROW_LINE_X - 2.3), 0, sideZ);
        arcSlot += 1;
      }
      pl.facingYaw = Math.atan2(hoopSide * HOOP_X - pl.position.x, -pl.position.z);
    }

    this.activeFreeThrow = {
      shooterId: shooter.id,
      team: shooter.team,
      hoopSide,
      shotsRemaining: totalShots,
      totalShots,
      phase: 'aim',
      timer: 0.72,
    };
  }

  private stepFreeThrowSequence(dt: number, input: InputState) {
    const ft = this.activeFreeThrow;
    if (!ft) return;
    const shooter = this.players.find((p) => p.id === ft.shooterId);
    if (!shooter) {
      this.activeFreeThrow = null;
      return;
    }

    // Sync player rigs statically/idle while at FT line
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      pl.rig.root.position.copy(pl.position);
      pl.rig.root.rotation.y = pl.facingYaw;
      pl.rig.selectionRing.visible = pl.id === this.controlledPlayerId;
      updatePlayerAnimation(pl.rig, pl.anim, pl.action, 0, pl.position.y, pl.id === shooter.id && ft.phase === 'aim', false, dt);
    }

    if (ft.phase === 'aim') {
      ft.timer -= dt;
      shooter.rig.rightHandAnchor.getWorldPosition(_handPos);
      this.ball.position.copy(_handPos);
      this.ball.syncVisuals(dt);

      const isHumanShooter = shooter.id === this.controlledPlayerId;
      let shouldRelease = false;
      let accuracy = 0.88;

      if (isHumanShooter) {
        if (input.shootJustPressed) {
          this.isChargingShot = true;
          this.shotCharge = 0.05;
        }
        if (this.isChargingShot) {
          this.shotCharge = Math.min(1.0, this.shotCharge + dt * 1.32);
          if (input.shootJustReleased || this.shotCharge >= 0.99) {
            this.isChargingShot = false;
            const delta = Math.abs(this.shotCharge - 0.79);
            accuracy = Math.max(0.32, 1 - delta * 1.9);
            this.shotCharge = 0;
            shouldRelease = true;
          }
        }
      } else if (ft.timer <= 0) {
        // AI Free Throw (~80% realistic FT percentage)
        accuracy = Math.random() < 0.8 ? 0.9 : 0.44;
        shouldRelease = true;
      }

      if (shouldRelease) {
        this.shotScoredThisAttempt = false;
        this.lastShotIsFreeThrow = true;
        this.lastShotWasThree = false;
        this.lastShooterId = shooter.id;
        this.lastShotTeam = shooter.team;
        shooter.action = 'shoot';
        shooter.actionTimer = 0.45;
        const releasePos = _tmpVec.set(shooter.position.x, shooter.heightMeters + 0.35, shooter.position.z);
        this.ball.launchShot(releasePos, ft.hoopSide, accuracy, 0);
        this.ballState = 'shot';
        this.ballHandlerId = null;
        ft.phase = 'flight';
        ft.timer = 2.6;
      }
      return;
    }

    // Free Throw Flight
    ft.timer -= dt;
    const events = this.ball.stepFreeFlight(dt);
    if (events.hitRim) this.audio.playRimClank(events.hitRim);
    if (events.hitBackboard) this.audio.playBounce(events.hitBackboard * 0.7);
    if (events.bouncedFloor) this.audio.playBounce(events.bouncedFloor);

    if (events.scoredSide === ft.hoopSide && !this.shotScoredThisAttempt) {
      this.shotScoredThisAttempt = true;
      this.arena.triggerSwish(ft.hoopSide, false);
      this.audio.playSwish();
      this.audio.playCrowdCheer();
      this.crowdExcitement = 0.75;

      if (ft.team === 'home') this.homeScore += 1;
      else this.awayScore += 1;
      shooter.points += 1;

      const shotNum = ft.totalShots - ft.shotsRemaining + 1;
      this.pushCallout('FREE THROW GOOD!', `${shooter.appearance.name} · +1 PT (${shotNum}/${ft.totalShots})`, ft.team);
      ft.shotsRemaining -= 1;

      if (ft.shotsRemaining > 0) {
        ft.phase = 'aim';
        ft.timer = 0.72;
        this.ballHandlerId = shooter.id;
        this.ballState = 'held';
        shooter.action = 'idle';
      } else {
        const nextTeam: TeamId = ft.team === 'home' ? 'away' : 'home';
        this.activeFreeThrow = null;
        this.lastShotIsFreeThrow = false;
        this.pendingInbound = { team: nextTeam, timer: 0.65 };
      }
      return;
    }

    // Missed Free Throw (rim/floor/OOB/timeout)
    if (
      events.bouncedFloor ||
      events.outOfBounds ||
      ft.timer <= 0 ||
      (events.hitRim &&
        this.ball.velocity.y > 0.3 &&
        Math.hypot(this.ball.position.x - ft.hoopSide * HOOP_X, this.ball.position.z) > 0.35)
    ) {
      ft.shotsRemaining -= 1;
      const shotNum = ft.totalShots - ft.shotsRemaining;
      this.pushCallout('FREE THROW MISSED', `${shooter.appearance.name} (${shotNum}/${ft.totalShots})`, 'neutral');

      if (ft.shotsRemaining > 0) {
        ft.phase = 'aim';
        ft.timer = 0.72;
        this.ballHandlerId = shooter.id;
        this.ballState = 'held';
        shooter.action = 'idle';
      } else if (events.outOfBounds) {
        const nextTeam: TeamId = ft.team === 'home' ? 'away' : 'home';
        this.activeFreeThrow = null;
        this.lastShotIsFreeThrow = false;
        this.resetPossession(nextTeam, 'OUT OF BOUNDS');
      } else {
        // Final FT missed -> Live Rebound!
        this.activeFreeThrow = null;
        this.lastShotIsFreeThrow = false;
        this.ballState = 'free';
        this.ballHandlerId = null;
        this.ballPickupCooldown = 0.05;
        this.shotClockSeconds = SHOT_CLOCK_SECONDS;
      }
    }
  }

  private executeStealAttempt(stealer: FullPlayer) {
    stealer.action = 'steal';
    stealer.actionTimer = 0.32;
    stealer.stealCooldown = 0.95;

    const handler = this.players.find((p) => p.id === this.ballHandlerId);
    if (!handler || handler.team === stealer.team) return;

    const dist = Math.hypot(handler.position.x - stealer.position.x, handler.position.z - stealer.position.z);
    if (dist < 1.32) {
      const handlerShooting =
        (handler.id === this.controlledPlayerId && this.isChargingShot) ||
        handler.action === 'shoot' ||
        handler.action === 'layup' ||
        handler.action === 'dunk';

      const roll = Math.random();
      if (roll < 0.34 && !handlerShooting) {
        // Clean Steal!
        stealer.steals += 1;
        this.ballHandlerId = stealer.id;
        this.ballState = 'held';
        this.possession = stealer.team;
        this.lastTouchTeam = stealer.team;
        this.shotClockSeconds = SHOT_CLOCK_SECONDS;
        this.audio.playSqueak();
        this.pushCallout('STEAL!', `${stealer.appearance.name} · ${stealer.steals} STL`, stealer.team);
      } else if (roll < 0.54 && this.gameMode !== 'shootaround') {
        // Foul! Shooting foul -> 2 or 3 FTs; Bonus (>= 5 team fouls) -> 2 FTs
        this.audio.playWhistle();
        let teamFouls = 0;
        if (stealer.team === 'home') {
          this.homeFouls += 1;
          teamFouls = this.homeFouls;
        } else {
          this.awayFouls += 1;
          teamFouls = this.awayFouls;
        }

        if (handlerShooting) {
          const targetSide: -1 | 1 = handler.team === 'home' ? 1 : -1;
          const ftCount = isThreePointShot(handler.position, targetSide) ? 3 : 2;
          this.pushCallout('SHOOTING FOUL', `${stealer.appearance.name} · ${ftCount} Free Throws`, handler.team);
          this.startFreeThrows(handler, ftCount);
        } else if (teamFouls >= 5) {
          this.pushCallout('BONUS FOUL', `${stealer.appearance.name} · 2 Free Throws`, handler.team);
          this.startFreeThrows(handler, 2);
        } else {
          this.shotClockSeconds = Math.max(14, this.shotClockSeconds);
          this.pushCallout('REACH-IN FOUL', `${stealer.appearance.name}`, stealer.team);
        }
      }
    }
  }

  private stepBall(dt: number) {
    if (this.activeDunkTarget) return;

    if (this.ballState === 'held' && this.ballHandlerId) {
      const handler = this.players.find((p) => p.id === this.ballHandlerId);
      if (!handler) {
        this.ballState = 'free';
        return;
      }

      if (this.isChargingShot || handler.position.y > 0.12) {
        handler.rig.rightHandAnchor.getWorldPosition(_handPos);
        this.ball.position.copy(_handPos);
      } else {
        // Authentic dribble bounce synced between hand and hardwood
        const handAnchor =
          handler.anim.dribbleHand === 'right' ? handler.rig.rightHandAnchor : handler.rig.leftHandAnchor;
        handAnchor.getWorldPosition(_handPos);
        const phaseSin = Math.sin(handler.anim.dribblePhase);
        const bounceT = Math.abs(phaseSin); // 0 = floor, 1 = hand
        const floorY = BALL_RADIUS;
        const handY = Math.max(0.75, _handPos.y - 0.08);
        this.ball.position.set(_handPos.x, THREE.MathUtils.lerp(floorY, handY, bounceT), _handPos.z);

        // Trigger soft dribble sound near floor tap
        if (bounceT < 0.08 && Math.cos(handler.anim.dribblePhase) > 0) {
          this.audio.playBounce(0.32);
        }
      }
      this.ball.syncVisuals(dt);
      return;
    }

    // Free flight / Pass / Shot physics
    const events = this.ball.stepFreeFlight(dt);

    if (events.bouncedFloor) {
      this.audio.playBounce(events.bouncedFloor);
      if (this.ballState === 'shot' || this.ballState === 'pass') {
        this.ballState = 'free';
      }
    }
    if (events.hitRim) {
      this.audio.playRimClank(events.hitRim);
      this.shotClockSeconds = Math.max(14, this.shotClockSeconds);
      this.ballState = 'free';
    }
    if (events.hitBackboard) {
      this.audio.playBounce(events.hitBackboard * 0.7);
    }

    // Check Shot Block by airborne defenders
    if (this.ballState === 'shot' && this.ball.velocity.y > -2.5) {
      for (let i = 0; i < this.players.length; i++) {
        const def = this.players[i];
        if (def.team === this.lastShotTeam) continue;
        if (def.action === 'block' && def.position.y > 0.15) {
          const reachY = def.position.y + def.heightMeters + 0.35;
          const distXZ = Math.hypot(def.position.x - this.ball.position.x, def.position.z - this.ball.position.z);
          if (distXZ < 0.85 && Math.abs(this.ball.position.y - reachY) < 0.72) {
            def.blocks += 1;
            this.lastTouchTeam = def.team;
            this.ball.velocity.set(
              (Math.random() - 0.5) * 6,
              2.5,
              (Math.random() - 0.5) * 6
            );
            this.ballState = 'free';
            this.audio.playBounce(0.95);
            this.pushCallout('BLOCKED!', `${def.appearance.name} · ${def.blocks} BLK`, def.team);
            break;
          }
        }
      }
    }

    // Basket Scored! (Guarded against duplicate scoring per attempt)
    if (events.scoredSide && !this.shotScoredThisAttempt) {
      this.handleBasketScored(events.scoredSide);
      return;
    }

    // Out-of-bounds turnover on loose/passed/deflected balls
    if (events.outOfBounds && this.gameMode !== 'shootaround' && !this.shotScoredThisAttempt) {
      this.audio.playWhistle();
      const nextTeam: TeamId = this.lastTouchTeam === 'home' ? 'away' : 'home';
      this.resetPossession(nextTeam, 'OUT OF BOUNDS');
      return;
    }

    // Pass Reception or Loose Ball / Rebound Pickup
    if (this.ballPickupCooldown <= 0) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (this.ballState === 'pass' && p.id === this.lastPasserId) continue;
        // Let the intended teammate receive passes without teammates stealing them mid-flight
        if (
          this.ballState === 'pass' &&
          this.passTargetId &&
          p.team === this.possession &&
          p.id !== this.passTargetId
        ) {
          continue;
        }

        const distXZ = Math.hypot(p.position.x - this.ball.position.x, p.position.z - this.ball.position.z);
        const maxCatchY = p.position.y + p.heightMeters + 0.5;
        const catchRadius =
          this.ballState === 'pass'
            ? p.id === this.passTargetId
              ? 0.95
              : 0.68
            : 0.82;

        if (distXZ < catchRadius && this.ball.position.y <= maxCatchY) {
          const prevPoss = this.possession;
          const wasFree = this.ballState === 'free';
          const wasPass = this.ballState === 'pass';

          this.ballHandlerId = p.id;
          this.ballState = 'held';
          this.possession = p.team;
          this.lastTouchTeam = p.team;
          this.passTargetId = null;
          p.aiHoldTime = 0;

          if (wasPass && p.team !== prevPoss) {
            p.steals += 1;
            this.shotClockSeconds = SHOT_CLOCK_SECONDS;
            this.audio.playSqueak();
            this.pushCallout('INTERCEPTED!', `${p.appearance.name} · ${p.steals} STL`, p.team);
          } else if (wasFree) {
            p.rebounds += 1;
            if (p.team !== prevPoss) {
              this.shotClockSeconds = SHOT_CLOCK_SECONDS;
            } else {
              this.shotClockSeconds = Math.max(14, this.shotClockSeconds);
            }
            this.pushCallout('REBOUND', `${p.appearance.name} · ${p.rebounds} REB`, p.team);
          }
          break;
        }
      }
    }
  }

  private handleBasketScored(hoopSide: -1 | 1) {
    if (this.shotScoredThisAttempt) return;
    this.shotScoredThisAttempt = true;

    this.arena.triggerSwish(hoopSide, false);
    this.audio.playSwish();
    this.audio.playCrowdCheer();
    this.crowdExcitement = 1.0;

    // Right hoop (+1) scores for Home, Left hoop (-1) scores for Away
    const scoringTeam: TeamId = hoopSide === 1 ? 'home' : 'away';
    const pts = this.lastShotIsFreeThrow ? 1 : this.lastShotWasThree ? 3 : 2;

    if (scoringTeam === 'home') this.homeScore += pts;
    else this.awayScore += pts;

    const shooter = this.players.find((p) => p.id === this.lastShooterId && p.team === scoringTeam);
    if (shooter) shooter.points += pts;

    if (this.lastPasserId && this.lastPasserId !== this.lastShooterId) {
      const passer = this.players.find((p) => p.id === this.lastPasserId && p.team === scoringTeam);
      if (passer) passer.assists += 1;
    }

    const label = pts === 3 ? 'THREE POINTER!' : pts === 1 ? 'FREE THROW!' : 'BUCKET!';
    const sub = shooter ? `${shooter.appearance.name} · +${pts} PTS` : `+${pts} PTS`;
    this.pushCallout(label, sub, scoringTeam);

    if (this.gameMode === 'shootaround') {
      // Quick rebound kickout back to shooter in shootaround
      this.shotClockSeconds = SHOT_CLOCK_SECONDS;
      this.ballState = 'free';
      this.ballPickupCooldown = 0.5;
      return;
    }

    // Inbound to opposing team after brief celebration while net swishes
    const nextTeam: TeamId = scoringTeam === 'home' ? 'away' : 'home';
    this.pendingInbound = { team: nextTeam, timer: 0.65 };
  }

  private updateCamera(dt: number) {
    if (this.cameraMode === 'orbit') {
      this.orbitControls.update();
      return;
    }

    const focusX = THREE.MathUtils.clamp(this.ball.position.x * 0.65, -8.8, 8.8);
    const focusZ = THREE.MathUtils.clamp(this.ball.position.z * 0.55, -4.5, 4.5);

    if (this.cameraMode === 'broadcast') {
      _camTarget.set(focusX, 1.35, focusZ * 0.5);
      _camPos.set(focusX * 0.72, 10.6, 18.8 + focusZ * 0.25);
    } else if (this.cameraMode === 'follow') {
      const ctrl = this.players.find((p) => p.id === this.controlledPlayerId);
      const px = ctrl ? ctrl.position.x : focusX;
      const pz = ctrl ? ctrl.position.z : focusZ;
      const dir = this.userTeam === 'home' ? 1 : -1;
      _camTarget.set(px + dir * 3.2, 1.5, pz * 0.6);
      _camPos.set(px - dir * 8.2, 5.4, pz * 0.72);
    } else {
      // Courtside low-angle pro broadcast cam
      _camTarget.set(focusX, 1.45, focusZ * 0.45);
      _camPos.set(focusX * 0.85, 2.85, 11.8);
    }

    const lambda = 5.5;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camPos.x, lambda, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camPos.y, lambda, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camPos.z, lambda, dt);

    this.orbitControls.target.x = THREE.MathUtils.damp(this.orbitControls.target.x, _camTarget.x, lambda, dt);
    this.orbitControls.target.y = THREE.MathUtils.damp(this.orbitControls.target.y, _camTarget.y, lambda, dt);
    this.orbitControls.target.z = THREE.MathUtils.damp(this.orbitControls.target.z, _camTarget.z, lambda, dt);
    this.camera.lookAt(this.orbitControls.target);
  }

  private buildUserLineupSummary(): LineupSlotSummary[] {
    const roster = this.userTeam === 'home' ? HOME_ROSTER : AWAY_ROSTER;
    const order = this.userTeam === 'home' ? this.homeLineupOrder : this.awayLineupOrder;
    const starterCount = this.gameMode === '5v5' ? 5 : this.gameMode === '3v3' ? 3 : 2;

    return order.map((rosterIdx, slotIndex) => {
      const app = roster[rosterIdx] ?? roster[0];
      const id = `${this.userTeam}-${rosterIdx}`;
      const active = this.players.find((p) => p.id === id);
      const cached = this.playerStatsCache.get(id);
      return {
        id,
        rosterIndex: rosterIdx,
        name: app.name,
        number: app.jerseyNumber,
        position: app.position,
        heightMeters: app.heightMeters,
        isStarter: slotIndex < starterCount,
        slotIndex,
        isHumanControlled: id === this.controlledPlayerId,
        points: active ? active.points : cached?.points ?? 0,
        rebounds: active ? active.rebounds : cached?.rebounds ?? 0,
        assists: active ? active.assists : cached?.assists ?? 0,
      };
    });
  }

  private emitSnapshot(input?: InputState) {
    const ctrl =
      this.players.find((p) => p.id === this.controlledPlayerId) ??
      this.players[0];
    const handler = this.players.find((p) => p.id === this.ballHandlerId);

    const shotMeter: ShotMeterSnapshot = {
      active: this.isChargingShot,
      progress: this.shotCharge,
      idealStart: 0.7,
      idealEnd: 0.88,
      label: this.shotCharge >= 0.7 && this.shotCharge <= 0.88 ? 'GREEN WINDOW' : 'RELEASE',
    };

    this.onSnapshot({
      homeTeam: HOME_TEAM,
      awayTeam: AWAY_TEAM,
      userTeam: this.userTeam,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      homeFouls: this.homeFouls,
      awayFouls: this.awayFouls,
      homeTimeouts: this.homeTimeouts,
      awayTimeouts: this.awayTimeouts,
      quarter: this.quarter,
      gameClockSeconds: this.gameClockSeconds,
      shotClockSeconds: this.shotClockSeconds,
      possession: this.possession,
      isPaused: this.isPaused,
      isQuarterBreak: this.isQuarterBreak,
      isGameOver: this.isGameOver,
      gameMode: this.gameMode,
      cameraMode: this.cameraMode,
      controlledPlayer: ctrl
        ? {
            id: ctrl.id,
            name: ctrl.appearance.name,
            number: ctrl.appearance.jerseyNumber,
            position: ctrl.appearance.position,
            stamina: Math.round(ctrl.stamina),
            points: ctrl.points,
            rebounds: ctrl.rebounds,
            assists: ctrl.assists,
            steals: ctrl.steals,
            blocks: ctrl.blocks,
          }
        : {
            id: 'none',
            name: 'Player',
            number: 0,
            position: 'PG',
            stamina: 100,
            points: 0,
            rebounds: 0,
            assists: 0,
            steals: 0,
            blocks: 0,
          },
      userLineup: this.buildUserLineupSummary(),
      ballHandlerName: handler ? handler.appearance.name : null,
      ballHandlerTeam: handler ? handler.team : null,
      shotMeter,
      callout: this.callout,
      gamepadConnected: input?.gamepadConnected ?? false,
      gamepadName: input?.gamepadName ?? null,
      soundMuted: this.audio.isMuted(),
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerUnlock);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.input.unbind();
    this.orbitControls.dispose();
    this.clearPlayers();
    this.ball.dispose(this.scene);
    this.arena.dispose();
    this.shadowTexture.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
