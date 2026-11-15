'use client';

import { useEffect, useRef, useState } from 'react';
import { BasketballEngine } from '@/src/game/engine';
import { AWAY_TEAM, HOME_TEAM, MAX_TIMEOUTS, QUARTER_DURATION_SECONDS, SHOT_CLOCK_SECONDS } from '@/src/game/constants';
import type { GameSnapshot } from '@/src/game/types';
import ControlDock from './ControlDock';
import ScoreboardHud from './ScoreboardHud';
import TouchControlsOverlay from './TouchControlsOverlay';

const INITIAL_SNAPSHOT: GameSnapshot = {
  homeTeam: HOME_TEAM,
  awayTeam: AWAY_TEAM,
  userTeam: 'home',
  homeScore: 0,
  awayScore: 0,
  homeFouls: 0,
  awayFouls: 0,
  homeTimeouts: MAX_TIMEOUTS,
  awayTimeouts: MAX_TIMEOUTS,
  quarter: 1,
  gameClockSeconds: QUARTER_DURATION_SECONDS,
  shotClockSeconds: SHOT_CLOCK_SECONDS,
  possession: 'home',
  isPaused: false,
  isQuarterBreak: false,
  isGameOver: false,
  gameMode: '5v5',
  cameraMode: 'broadcast',
  controlledPlayer: {
    id: 'home-0',
    name: 'M. Vance',
    number: 3,
    position: 'PG',
    stamina: 100,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
  },
  userLineup: [],
  ballHandlerName: 'M. Vance',
  ballHandlerTeam: 'home',
  shotMeter: {
    active: false,
    progress: 0,
    idealStart: 0.7,
    idealEnd: 0.88,
    label: 'RELEASE',
  },
  callout: null,
  gamepadConnected: false,
  gamepadName: null,
  soundMuted: false,
};

export default function BasketballGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BasketballEngine | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const isCoarsePointer =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      if (isCoarsePointer) {
        setTouchEnabled(true);
      }
    });

    const container = mountRef.current;
    if (!container) return () => cancelAnimationFrame(rafId);

    const engine = new BasketballEngine(container, (nextSnap) => {
      setSnapshot(nextSnap);
    });
    engineRef.current = engine;

    return () => {
      cancelAnimationFrame(rafId);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const showOverlayModal = snapshot.isPaused || snapshot.isQuarterBreak || snapshot.isGameOver;

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#090d18]">
      {/* Dedicated Isolated WebGL Canvas Container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Broadcast Scoreboard, Menu Toggle & Shot Meter */}
      <ScoreboardHud
        snapshot={snapshot}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
      />

      {/* Collapsible Top Game Menu (never overlaps bottom joystick or action buttons) */}
      <ControlDock
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        snapshot={snapshot}
        touchEnabled={touchEnabled}
        onToggleTouch={() => setTouchEnabled((t) => !t)}
        onTogglePause={() => engineRef.current?.togglePause()}
        onCallTimeout={() => engineRef.current?.callTimeout()}
        onCameraChange={(mode) => engineRef.current?.setCameraMode(mode)}
        onModeChange={(mode) => engineRef.current?.setGameMode(mode)}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onSelectTeam={(team) => engineRef.current?.setUserTeam(team)}
        onSelectStarter={(slot) => engineRef.current?.selectControlledStarter(slot)}
        onSwapLineup={(a, b) => engineRef.current?.swapLineupSlots(a, b)}
      />

      {/* Touchscreen Virtual Joystick & Action Buttons */}
      <TouchControlsOverlay
        visible={touchEnabled && !showOverlayModal}
        onOffense={snapshot.possession === snapshot.userTeam || snapshot.gameMode === 'shootaround'}
        canCallPass={
          snapshot.ballHandlerTeam === snapshot.userTeam &&
          snapshot.ballHandlerName !== null &&
          snapshot.ballHandlerName !== snapshot.controlledPlayer.name
        }
        onMove={(x, z) => engineRef.current?.setTouchMove(x, z)}
        onButton={(btn, pressed) => engineRef.current?.setTouchButton(btn, pressed)}
      />

      {/* Pause / Quarter Break / Final Buzzer Overlay */}
      {showOverlayModal && (
        <div className="fixed inset-0 z-25 flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0b0f19]/96 p-6 text-center shadow-2xl">
            <div className="font-display text-3xl font-extrabold tracking-wide text-white">
              {snapshot.isGameOver
                ? 'FINAL SCORE'
                : snapshot.isQuarterBreak
                ? `END OF QUARTER ${snapshot.quarter}`
                : 'GAME PAUSED'}
            </div>
            <div className="mt-2 flex items-center justify-center gap-6 font-display text-2xl font-bold tabular-nums">
              <span className="text-blue-300">
                {snapshot.homeTeam.shortName} {snapshot.homeScore}
              </span>
              <span className="text-slate-500">–</span>
              <span className="text-red-300">
                {snapshot.awayTeam.shortName} {snapshot.awayScore}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {snapshot.isPaused && !snapshot.isQuarterBreak && !snapshot.isGameOver && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.togglePause()}
                  className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Resume Game
                </button>
              )}
              {(snapshot.isQuarterBreak || snapshot.isGameOver) && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.advanceQuarterOrRestart()}
                  className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  {snapshot.isGameOver
                    ? 'Play New Match'
                    : snapshot.quarter >= 4
                    ? 'Start Overtime'
                    : `Start Quarter ${snapshot.quarter + 1}`}
                </button>
              )}
              <button
                type="button"
                onClick={() => engineRef.current?.setGameMode(snapshot.gameMode)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Restart Match
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
