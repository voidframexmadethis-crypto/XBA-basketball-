'use client';

import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Check,
  Gamepad2,
  HelpCircle,
  Pause,
  Play,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { CameraMode, GameMode, GameSnapshot, TeamId } from '@/src/game/types';

interface ControlDockProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: GameSnapshot;
  touchEnabled: boolean;
  onToggleTouch: () => void;
  onTogglePause: () => void;
  onCallTimeout: () => void;
  onCameraChange: (mode: CameraMode) => void;
  onModeChange: (mode: GameMode) => void;
  onToggleMute: () => void;
  onSelectTeam: (team: TeamId) => void;
  onSelectStarter: (slotIndex: number) => void;
  onSwapLineup: (slotA: number, slotB: number) => void;
}

const SLOT_LABELS_5V5 = ['PG', 'SG', 'SF', 'PF', 'C'];
const SLOT_LABELS_3V3 = ['G', 'F', 'C'];
const SLOT_LABELS_PRAC = ['G', 'C'];

export default function ControlDock({
  isOpen,
  onClose,
  snapshot,
  touchEnabled,
  onToggleTouch,
  onTogglePause,
  onCallTimeout,
  onCameraChange,
  onModeChange,
  onToggleMute,
  onSelectTeam,
  onSelectStarter,
  onSwapLineup,
}: ControlDockProps) {
  const [view, setView] = useState<'menu' | 'lineup' | 'controls'>('menu');
  const [swapSourceSlot, setSwapSourceSlot] = useState<number | null>(null);

  if (!isOpen) return null;

  const cameraModes: Array<{ id: CameraMode; label: string }> = [
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'follow', label: 'Follow' },
    { id: 'courtside', label: 'Courtside' },
    { id: 'orbit', label: 'Orbit' },
  ];

  const gameModes: Array<{ id: GameMode; label: string }> = [
    { id: '5v5', label: '5v5' },
    { id: '3v3', label: '3v3' },
    { id: 'shootaround', label: 'Practice' },
  ];

  const userTimeouts =
    snapshot.userTeam === 'home' ? snapshot.homeTimeouts : snapshot.awayTimeouts;

  const slotLabels =
    snapshot.gameMode === '5v5'
      ? SLOT_LABELS_5V5
      : snapshot.gameMode === '3v3'
      ? SLOT_LABELS_3V3
      : SLOT_LABELS_PRAC;

  const starters = snapshot.userLineup.filter((p) => p.isStarter);
  const bench = snapshot.userLineup.filter((p) => !p.isStarter);

  const handleClose = () => {
    setView('menu');
    setSwapSourceSlot(null);
    onClose();
  };

  const handleSwapClick = (slotIndex: number) => {
    if (swapSourceSlot === null) {
      setSwapSourceSlot(slotIndex);
      return;
    }
    if (swapSourceSlot === slotIndex) {
      setSwapSourceSlot(null);
      return;
    }
    onSwapLineup(swapSourceSlot, slotIndex);
    setSwapSourceSlot(null);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{
        top: 'calc(max(8px, env(safe-area-inset-top)) + 52px)',
      }}
    >
      <div className="pointer-events-auto max-h-[60dvh] w-full max-w-[440px] overflow-y-auto rounded-xl border border-white/15 bg-[#0b0f19]/96 p-2.5 shadow-2xl sm:max-w-[560px] sm:p-3">
        {/* Header Row */}
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
          {view !== 'menu' ? (
            <button
              type="button"
              onClick={() => {
                setView('menu');
                setSwapSourceSlot(null);
              }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Menu</span>
            </button>
          ) : (
            <span className="font-display text-sm font-bold tracking-wide text-white">
              GAME MENU
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {view === 'menu' && (
              <>
                <button
                  type="button"
                  onClick={() => setView('lineup')}
                  className="flex items-center gap-1 rounded-md border border-blue-400/35 bg-blue-950/60 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-900/60 whitespace-nowrap"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Team &amp; Lineup</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('controls')}
                  className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-white/10 whitespace-nowrap"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>Controls</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close menu"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {view === 'menu' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center sm:gap-3">
            {/* Primary Actions (Pause, Timeout, Touch Pad, Sound) */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onTogglePause();
                  handleClose();
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
              >
                {snapshot.isPaused ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
                <span>{snapshot.isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onCallTimeout();
                  handleClose();
                }}
                disabled={snapshot.gameMode === 'shootaround' || userTimeouts <= 0}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-xs font-medium text-slate-100 hover:bg-white/10 disabled:opacity-40 whitespace-nowrap"
              >
                <Timer className="h-3.5 w-3.5 text-amber-400" />
                <span>Timeout ({userTimeouts})</span>
              </button>

              <button
                type="button"
                onClick={onToggleTouch}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium whitespace-nowrap ${
                  touchEnabled
                    ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-200'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>{touchEnabled ? 'Touch On' : 'Touch Off'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-xs font-medium text-slate-100 hover:bg-white/10 whitespace-nowrap"
              >
                {snapshot.soundMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>{snapshot.soundMuted ? 'Muted' : 'Sound'}</span>
              </button>
            </div>

            {/* Match Mode & Camera Selectors */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Mode
                </span>
                <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
                  {gameModes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onModeChange(m.id);
                        handleClose();
                      }}
                      className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        snapshot.gameMode === m.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="flex w-8 shrink-0 items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Camera className="h-3 w-3" />
                  Cam
                </span>
                <div className="grid flex-1 grid-cols-4 gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
                  {cameraModes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onCameraChange(c.id)}
                      className={`rounded-md py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        snapshot.cameraMode === c.id
                          ? 'bg-slate-200 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : view === 'lineup' ? (
          <div className="space-y-2.5 text-xs">
            {/* Team Selector */}
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Select Your Team
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSwapSourceSlot(null);
                    onSelectTeam('home');
                  }}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    snapshot.userTeam === 'home'
                      ? 'border-blue-400 bg-blue-600/35 text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-xs font-bold">
                      {snapshot.homeTeam.name}
                    </div>
                    <div className="text-[10px] text-slate-300">HOME · {snapshot.homeTeam.shortName}</div>
                  </div>
                  {snapshot.userTeam === 'home' && <Check className="h-3.5 w-3.5 shrink-0 text-blue-300" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSwapSourceSlot(null);
                    onSelectTeam('away');
                  }}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    snapshot.userTeam === 'away'
                      ? 'border-red-400 bg-red-600/35 text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-xs font-bold">
                      {snapshot.awayTeam.name}
                    </div>
                    <div className="text-[10px] text-slate-300">AWAY · {snapshot.awayTeam.shortName}</div>
                  </div>
                  {snapshot.userTeam === 'away' && <Check className="h-3.5 w-3.5 shrink-0 text-red-300" />}
                </button>
              </div>
            </div>

            {/* Active Starting Lineup */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Starting Lineup ({starters.length} Active · 1 You + {Math.max(0, starters.length - 1)} AI)</span>
                {swapSourceSlot !== null && (
                  <span className="text-amber-300">Select target slot to swap</span>
                )}
              </div>
              <div className="space-y-1">
                {starters.map((player, idx) => {
                  const isSwapSource = swapSourceSlot === player.slotIndex;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 ${
                        player.isHumanControlled
                          ? 'border-amber-400/50 bg-amber-500/12'
                          : isSwapSource
                          ? 'border-blue-400/60 bg-blue-500/15'
                          : 'border-white/10 bg-white/4'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-6 shrink-0 rounded bg-black/50 py-0.5 text-center font-mono text-[10px] font-bold text-slate-300">
                          {slotLabels[idx] ?? player.position}
                        </span>
                        <span className="w-6 shrink-0 font-display text-xs font-bold text-amber-400 tabular-nums">
                          #{player.number}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">
                            {player.name}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums">
                            {player.position} · {player.points} PTS · {player.rebounds} REB
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectStarter(idx)}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition-colors whitespace-nowrap ${
                            player.isHumanControlled
                              ? 'bg-amber-500 text-slate-950'
                              : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          {player.isHumanControlled ? 'YOU' : 'Play As'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwapClick(player.slotIndex)}
                          className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                            isSwapSource
                              ? 'border-blue-400 bg-blue-600 text-white'
                              : swapSourceSlot !== null
                              ? 'border-emerald-400/50 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800/60'
                              : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          <span>{isSwapSource ? 'Cancel' : swapSourceSlot !== null ? 'Here' : 'Swap'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bench Reserves */}
            {bench.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Bench Reserves
                </div>
                <div className="space-y-1">
                  {bench.map((player) => {
                    const isSwapSource = swapSourceSlot === player.slotIndex;
                    return (
                      <div
                        key={player.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 ${
                          isSwapSource
                            ? 'border-blue-400/60 bg-blue-500/15'
                            : 'border-white/10 bg-black/30'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-6 shrink-0 rounded bg-white/5 py-0.5 text-center font-mono text-[10px] font-semibold text-slate-400">
                            BN
                          </span>
                          <span className="w-6 shrink-0 font-display text-xs font-bold text-slate-300 tabular-nums">
                            #{player.number}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-slate-200">
                              {player.name}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {player.position} · {player.points} PTS · {player.rebounds} REB
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSwapClick(player.slotIndex)}
                          className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                            isSwapSource
                              ? 'border-blue-400 bg-blue-600 text-white'
                              : swapSourceSlot !== null
                              ? 'border-emerald-400/50 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800/60'
                              : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          <span>{isSwapSource ? 'Cancel' : swapSourceSlot !== null ? 'Sub In' : 'Swap'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 text-[10px] leading-snug text-slate-300 sm:grid-cols-3 sm:text-[11px]">
            <div>
              <div className="mb-1 font-semibold text-emerald-300">Touchscreen</div>
              <div className="space-y-0.5">
                <div>Left Stick · Move</div>
                <div>SHOOT · Shoot / Dunk</div>
                <div>PASS · Pass / Call Pass</div>
                <div>SWITCH · Nearest Def</div>
                <div>BLOCK · Block / Reb</div>
                <div>STEAL / CROSS · Action</div>
                <div>SPRINT · Speed Boost</div>
              </div>
            </div>
            <div>
              <div className="mb-1 font-semibold text-amber-400">Keyboard</div>
              <div className="space-y-0.5">
                <div>WASD / Arrows · Move</div>
                <div>Shift · Sprint</div>
                <div>Space / J · Shoot</div>
                <div>E / K · Pass / Call / Def</div>
                <div>Tab / V · Switch Player</div>
                <div>Q / L · Cross / Steal</div>
                <div>R · Block · F · Guard · C · Cam</div>
              </div>
            </div>
            <div className="col-span-2 border-t border-white/10 pt-1.5 sm:col-span-1 sm:border-t-0 sm:pt-0">
              <div className="mb-1 font-semibold text-blue-300">Xbox Controller</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-1">
                <div>Left Stick · Move</div>
                <div>RT / LT · Sprint / Guard</div>
                <div>X · Shoot / Dunk</div>
                <div>A · Pass / Call Pass</div>
                <div>RB · Switch Player</div>
                <div>B · Cross / Steal</div>
                <div>Y · Block · LB · Cam</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

