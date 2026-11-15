export type TeamId = 'home' | 'away';

export type GameMode = '5v5' | '3v3' | 'shootaround';

export type CameraMode = 'broadcast' | 'follow' | 'courtside' | 'orbit';

export type PlayerPositionCode = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type PlayerActionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'defend'
  | 'jump'
  | 'shoot'
  | 'layup'
  | 'dunk'
  | 'pass'
  | 'steal'
  | 'block';

export interface PlayerAppearance {
  skinColor: string;
  hairColor: string;
  hairStyle: 'fade' | 'afro' | 'braids' | 'buzz';
  headband: boolean;
  heightMeters: number;
  shoeColor: string;
  jerseyNumber: number;
  name: string;
  position: PlayerPositionCode;
}

export interface TeamConfig {
  id: TeamId;
  name: string;
  shortName: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  jerseyTextColor: string;
}

export interface InputState {
  moveX: number; // -1..1 screen/camera-relative or world-mapped
  moveZ: number; // -1..1
  sprint: boolean;
  shootHeld: boolean;
  shootJustPressed: boolean;
  shootJustReleased: boolean;
  passPressed: boolean;
  stealOrCrossPressed: boolean;
  blockOrReboundPressed: boolean;
  defendHeld: boolean;
  switchPlayerPressed: boolean;
  gamepadConnected: boolean;
  gamepadName: string | null;
}

export interface ShotMeterSnapshot {
  active: boolean;
  progress: number; // 0..1
  idealStart: number;
  idealEnd: number;
  label: string;
}

export interface GameCallout {
  id: number;
  text: string;
  subtext?: string;
  tone: 'home' | 'away' | 'neutral' | 'gold';
  timestamp: number;
}

export interface PlayerHudSummary {
  id: string;
  name: string;
  number: number;
  position: PlayerPositionCode;
  stamina: number; // 0..100
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

export interface LineupSlotSummary {
  id: string;
  rosterIndex: number;
  name: string;
  number: number;
  position: PlayerPositionCode;
  heightMeters: number;
  isStarter: boolean;
  slotIndex: number;
  isHumanControlled: boolean;
  points: number;
  rebounds: number;
  assists: number;
}

export interface GameSnapshot {
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  userTeam: TeamId;
  homeScore: number;
  awayScore: number;
  homeFouls: number;
  awayFouls: number;
  homeTimeouts: number;
  awayTimeouts: number;
  quarter: number; // 1..4, 5+ OT
  gameClockSeconds: number;
  shotClockSeconds: number;
  possession: TeamId;
  isPaused: boolean;
  isQuarterBreak: boolean;
  isGameOver: boolean;
  gameMode: GameMode;
  cameraMode: CameraMode;
  controlledPlayer: PlayerHudSummary;
  userLineup: LineupSlotSummary[];
  ballHandlerName: string | null;
  ballHandlerTeam: TeamId | null;
  shotMeter: ShotMeterSnapshot;
  callout: GameCallout | null;
  gamepadConnected: boolean;
  gamepadName: string | null;
  soundMuted: boolean;
}
