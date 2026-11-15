import type { PlayerAppearance, TeamConfig } from './types';

// Regulation Pro Court Dimensions (Meters: 94ft x 50ft = 28.65m x 15.24m)
export const COURT_LENGTH = 28.65;
export const COURT_WIDTH = 15.24;
export const HALF_COURT_X = COURT_LENGTH / 2; // 14.325
export const HALF_COURT_Z = COURT_WIDTH / 2; // 7.62

// Hoop & Backboard Regulation Geometry
export const RIM_HEIGHT = 3.05; // 10 feet
export const RIM_RADIUS = 0.235; // Slightly generous vs 0.2286m for crisp video-game physics
export const RIM_TUBE_RADIUS = 0.016;
export const BACKBOARD_OFFSET_FROM_BASELINE = 1.22; // 4ft inside baseline
export const HOOP_CENTER_OFFSET_FROM_BASELINE = 1.575; // 5ft 2in
export const HOOP_X = HALF_COURT_X - HOOP_CENTER_OFFSET_FROM_BASELINE; // 12.75m
export const BACKBOARD_X = HALF_COURT_X - BACKBOARD_OFFSET_FROM_BASELINE; // 13.105m
export const BACKBOARD_WIDTH = 1.83; // 6ft
export const BACKBOARD_HEIGHT = 1.07; // 3.5ft
export const BACKBOARD_BOTTOM_Y = 2.9;

// Three-point & Paint Geometry
export const THREE_POINT_RADIUS = 7.24; // NBA 23ft 9in
export const THREE_POINT_CORNER_Z = 6.7; // 22ft corner three
export const KEY_WIDTH = 4.88; // 16ft NBA key
export const KEY_LENGTH = 5.79; // 19ft baseline to FT line
export const FREE_THROW_LINE_X = HALF_COURT_X - KEY_LENGTH; // 8.535m
export const CENTER_CIRCLE_RADIUS = 1.83;

// Ball Physics
export const BALL_RADIUS = 0.121; // Size 7 regulation ~24.2cm diameter
export const GRAVITY = 15.8; // Slightly snappier than 9.81 for realistic arcade-sim feel
export const BALL_BOUNCE_RESTITUTION = 0.76;
export const FLOOR_FRICTION = 0.985;

// Player Physics
export const PLAYER_BASE_SPEED = 5.6;
export const PLAYER_SPRINT_SPEED = 7.9;
export const PLAYER_DEFEND_SPEED = 4.9;
export const PLAYER_JUMP_VELOCITY = 6.85;
export const PLAYER_DUNK_JUMP_VELOCITY = 7.8;

// Game Rules
export const QUARTER_DURATION_SECONDS = 180; // 3:00 crisp playable quarters
export const SHOT_CLOCK_SECONDS = 24;
export const MAX_TIMEOUTS = 4;

export const HOME_TEAM: TeamConfig = {
  id: 'home',
  city: 'Metropolitan',
  name: 'Royals',
  shortName: 'MET',
  primaryColor: '#f8fafc',
  secondaryColor: '#1d4ed8',
  accentColor: '#eab308',
  jerseyTextColor: '#0f172a',
};

export const AWAY_TEAM: TeamConfig = {
  id: 'away',
  city: 'Pacific',
  name: 'Blaze',
  shortName: 'PAC',
  primaryColor: '#18181b',
  secondaryColor: '#dc2626',
  accentColor: '#f97316',
  jerseyTextColor: '#f8fafc',
};

export const HOME_ROSTER: PlayerAppearance[] = [
  {
    name: 'M. Vance',
    jerseyNumber: 3,
    position: 'PG',
    heightMeters: 1.91,
    skinColor: '#8d5524',
    hairColor: '#111111',
    hairStyle: 'fade',
    headband: true,
    shoeColor: '#1d4ed8',
  },
  {
    name: 'D. Mercer',
    jerseyNumber: 11,
    position: 'SG',
    heightMeters: 1.96,
    skinColor: '#c68642',
    hairColor: '#1a1a1a',
    hairStyle: 'braids',
    headband: false,
    shoeColor: '#eab308',
  },
  {
    name: 'K. Sterling',
    jerseyNumber: 24,
    position: 'SF',
    heightMeters: 2.02,
    skinColor: '#6b3e26',
    hairColor: '#121212',
    hairStyle: 'afro',
    headband: true,
    shoeColor: '#f8fafc',
  },
  {
    name: 'J. Thorne',
    jerseyNumber: 32,
    position: 'PF',
    heightMeters: 2.06,
    skinColor: '#e0ac69',
    hairColor: '#2c1e16',
    hairStyle: 'buzz',
    headband: false,
    shoeColor: '#1d4ed8',
  },
  {
    name: 'T. Okafor',
    jerseyNumber: 55,
    position: 'C',
    heightMeters: 2.13,
    skinColor: '#523018',
    hairColor: '#0e0e0e',
    hairStyle: 'fade',
    headband: false,
    shoeColor: '#eab308',
  },
  {
    name: 'J. Morales',
    jerseyNumber: 8,
    position: 'PG',
    heightMeters: 1.88,
    skinColor: '#c68642',
    hairColor: '#181414',
    hairStyle: 'buzz',
    headband: false,
    shoeColor: '#1d4ed8',
  },
  {
    name: 'D. Kowalski',
    jerseyNumber: 41,
    position: 'PF',
    heightMeters: 2.09,
    skinColor: '#f1c27d',
    hairColor: '#3a2719',
    hairStyle: 'fade',
    headband: false,
    shoeColor: '#f8fafc',
  },
];

export const AWAY_ROSTER: PlayerAppearance[] = [
  {
    name: 'R. Navarro',
    jerseyNumber: 1,
    position: 'PG',
    heightMeters: 1.89,
    skinColor: '#d49a6a',
    hairColor: '#191414',
    hairStyle: 'fade',
    headband: false,
    shoeColor: '#dc2626',
  },
  {
    name: 'C. Holloway',
    jerseyNumber: 7,
    position: 'SG',
    heightMeters: 1.97,
    skinColor: '#7b4827',
    hairColor: '#0f0f0f',
    hairStyle: 'braids',
    headband: true,
    shoeColor: '#f97316',
  },
  {
    name: 'A. Petrovic',
    jerseyNumber: 15,
    position: 'SF',
    heightMeters: 2.03,
    skinColor: '#f1c27d',
    hairColor: '#3b281c',
    hairStyle: 'buzz',
    headband: false,
    shoeColor: '#dc2626',
  },
  {
    name: 'L. Brooks',
    jerseyNumber: 21,
    position: 'PF',
    heightMeters: 2.07,
    skinColor: '#693c20',
    hairColor: '#111111',
    hairStyle: 'afro',
    headband: false,
    shoeColor: '#18181b',
  },
  {
    name: 'B. Diallo',
    jerseyNumber: 44,
    position: 'C',
    heightMeters: 2.14,
    skinColor: '#4a2915',
    hairColor: '#0c0c0c',
    hairStyle: 'fade',
    headband: true,
    shoeColor: '#dc2626',
  },
  {
    name: 'T. Lin',
    jerseyNumber: 12,
    position: 'SG',
    heightMeters: 1.94,
    skinColor: '#e5b887',
    hairColor: '#121212',
    hairStyle: 'fade',
    headband: false,
    shoeColor: '#f97316',
  },
  {
    name: 'M. Carter',
    jerseyNumber: 34,
    position: 'PF',
    heightMeters: 2.08,
    skinColor: '#7b4827',
    hairColor: '#111111',
    hairStyle: 'braids',
    headband: false,
    shoeColor: '#18181b',
  },
];
