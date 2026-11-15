'use client';

import { Menu, X } from 'lucide-react';
import type { GameSnapshot } from '@/src/game/types';

function formatGameClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  if (clamped < 10) {
    return clamped.toFixed(1);
  }
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatQuarter(q: number): string {
  if (q <= 4) return `Q${q}`;
  return q === 5 ? 'OT' : `${q - 4}OT`;
}

interface ScoreboardHudProps {
  snapshot: GameSnapshot;
  menuOpen: boolean;
  onToggleMenu: () => void;
}

export default function ScoreboardHud({
  snapshot,
  menuOpen,
  onToggleMenu,
}: ScoreboardHudProps) {
  const {
    homeTeam,
    awayTeam,
    userTeam,
    homeScore,
    awayScore,
    homeFouls,
    awayFouls,
    homeTimeouts,
    awayTimeouts,
    quarter,
    gameClockSeconds,
    shotClockSeconds,
    possession,
    gameMode,
    controlledPlayer,
    shotMeter,
    callout,
  } = snapshot;

  const shotClockUrgent = shotClockSeconds <= 5;
  const shotClockDisplay =
    shotClockSeconds < 5 ? shotClockSeconds.toFixed(1) : Math.ceil(shotClockSeconds).toString();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col items-center"
      style={{
        paddingTop: 'max(8px, env(safe-area-inset-top))',
        paddingLeft: 'max(10px, env(safe-area-inset-left))',
        paddingRight: 'max(10px, env(safe-area-inset-right))',
      }}
    >
      {/* Top Row: Compact Broadcast Scorebug + Collapsible Menu Trigger */}
      <div className="flex w-full max-w-[820px] items-center justify-center gap-2">
        <div className="pointer-events-auto flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-white/15 bg-[#0b0f19]/95 shadow-2xl">
          {/* Home Team */}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 px-2.5 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <span
                className="h-7 w-1 shrink-0 rounded-xs sm:h-8 sm:w-1.5"
                style={{ backgroundColor: homeTeam.secondaryColor }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-display text-sm font-bold tracking-wide text-white sm:text-lg">
                    {homeTeam.shortName}
                  </span>
                  {userTeam === 'home' && (
                    <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold tracking-wider text-amber-300">
                      YOU
                    </span>
                  )}
                  {possession === 'home' && gameMode !== 'shootaround' && (
                    <span className="text-[10px] font-semibold text-amber-400" aria-label="Possession">
                      ◀
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 tabular-nums sm:text-[11px]">
                  <span>F{homeFouls}</span>
                  <span aria-hidden="true">·</span>
                  <span>T{homeTimeouts}</span>
                </div>
              </div>
            </div>
            <div className="font-display text-2xl font-extrabold leading-none text-white tabular-nums sm:text-4xl">
              {homeScore}
            </div>
          </div>

          {/* Center Clock Cluster */}
          <div className="flex shrink-0 flex-col items-center justify-center border-x border-white/10 bg-[#060911] px-2.5 py-1 sm:px-5 sm:py-1.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-display text-[11px] font-bold tracking-wider text-amber-400 sm:text-sm">
                {gameMode === 'shootaround' ? 'PRAC' : formatQuarter(quarter)}
              </span>
              <span className="text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-mono text-sm font-bold text-white tabular-nums sm:text-lg">
                {gameMode === 'shootaround' ? '--:--' : formatGameClock(gameClockSeconds)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-slate-400 sm:text-[11px]">
              <span>SHOT</span>
              <span
                className={`font-mono text-xs font-bold tabular-nums sm:text-sm ${
                  shotClockUrgent ? 'text-red-400' : 'text-amber-300'
                }`}
              >
                {gameMode === 'shootaround' ? '24' : shotClockDisplay}
              </span>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 px-2.5 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
            <div className="font-display text-2xl font-extrabold leading-none text-white tabular-nums sm:text-4xl">
              {awayScore}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-right sm:gap-2.5">
              <div className="min-w-0">
                <div className="flex items-center justify-end gap-1">
                  {possession === 'away' && gameMode !== 'shootaround' && (
                    <span className="text-[10px] font-semibold text-amber-400" aria-label="Possession">
                      ▶
                    </span>
                  )}
                  {userTeam === 'away' && (
                    <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold tracking-wider text-amber-300">
                      YOU
                    </span>
                  )}
                  <span className="font-display text-sm font-bold tracking-wide text-white sm:text-lg">
                    {awayTeam.shortName}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 tabular-nums sm:text-[11px]">
                  <span>T{awayTimeouts}</span>
                  <span aria-hidden="true">·</span>
                  <span>F{awayFouls}</span>
                </div>
              </div>
              <span
                className="h-7 w-1 shrink-0 rounded-xs sm:h-8 sm:w-1.5"
                style={{ backgroundColor: awayTeam.secondaryColor }}
              />
            </div>
          </div>
        </div>

        {/* Compact Menu Toggle Button */}
        <button
          type="button"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close game menu' : 'Open game menu'}
          className={`pointer-events-auto flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-2xl transition-colors whitespace-nowrap ${
            menuOpen
              ? 'border-amber-400/60 bg-amber-500 text-slate-950'
              : 'border-white/15 bg-[#0b0f19]/95 text-slate-100 hover:bg-slate-800'
          }`}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span className="hidden sm:inline">{menuOpen ? 'Close' : 'Menu'}</span>
        </button>
      </div>

      {/* Controlled Player Compact Readout (Hidden while menu is open so panel sits neatly below scorebug) */}
      {!menuOpen && (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-white/10 bg-[#0b0f19]/88 px-2.5 py-0.5 text-[11px] text-slate-200 sm:gap-3 sm:px-3 sm:py-1 sm:text-xs">
          <span className="font-display text-xs font-bold tracking-wide text-amber-400 tabular-nums sm:text-sm">
            #{controlledPlayer.number}
          </span>
          <span className="font-semibold text-white">{controlledPlayer.name}</span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-400">{controlledPlayer.position}</span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STA</span>
            <div className="h-1.5 w-11 overflow-hidden rounded-full bg-slate-800 sm:w-14">
              <div
                className={`h-full transition-all duration-150 ${
                  controlledPlayer.stamina > 30 ? 'bg-emerald-400' : 'bg-amber-500'
                }`}
                style={{ width: `${controlledPlayer.stamina}%` }}
              />
            </div>
          </div>
          <span className="hidden text-slate-500 sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden font-mono text-[11px] text-slate-300 tabular-nums sm:inline">
            {controlledPlayer.points} PTS · {controlledPlayer.rebounds} REB · {controlledPlayer.assists} AST
          </span>
        </div>
      )}

      {/* Shot Release Timing Meter */}
      {shotMeter.active && !menuOpen && (
        <div className="mt-2.5 flex flex-col items-center gap-1 rounded-md border border-white/15 bg-[#090d16]/95 px-3.5 py-1.5 shadow-xl">
          <div className="flex w-44 items-center justify-between text-[10px] font-semibold tracking-wider text-slate-300 sm:w-48 sm:text-[11px]">
            <span>SHOT TIMING</span>
            <span
              className={
                shotMeter.progress >= shotMeter.idealStart && shotMeter.progress <= shotMeter.idealEnd
                  ? 'text-emerald-400'
                  : 'text-amber-300'
              }
            >
              {shotMeter.label}
            </span>
          </div>
          <div className="relative h-2.5 w-44 overflow-hidden rounded-sm bg-slate-800 sm:h-3 sm:w-48">
            <div
              className="absolute inset-y-0 bg-emerald-500/45"
              style={{
                left: `${shotMeter.idealStart * 100}%`,
                width: `${(shotMeter.idealEnd - shotMeter.idealStart) * 100}%`,
              }}
            />
            <div
              className="h-full bg-amber-400"
              style={{ width: `${Math.min(100, shotMeter.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Dynamic Play-by-Play Callout */}
      {callout && !menuOpen && (
        <div
          key={callout.id}
          className="mt-2 rounded-md border border-white/15 bg-[#0b0f19]/92 px-3.5 py-1 text-center shadow-lg"
        >
          <div
            className={`font-display text-base font-extrabold tracking-wide sm:text-lg ${
              callout.tone === 'home'
                ? 'text-blue-300'
                : callout.tone === 'away'
                ? 'text-red-300'
                : callout.tone === 'gold'
                ? 'text-amber-300'
                : 'text-white'
            }`}
          >
            {callout.text}
          </div>
          {callout.subtext && (
            <div className="text-[10px] font-medium text-slate-300 sm:text-[11px]">{callout.subtext}</div>
          )}
        </div>
      )}
    </div>
  );
}
