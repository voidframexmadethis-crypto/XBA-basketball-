'use client';

import { useRef, useState } from 'react';
import type { TouchActionButton } from '@/src/game/input';

interface TouchControlsOverlayProps {
  visible: boolean;
  onOffense: boolean;
  canCallPass?: boolean;
  onMove: (x: number, z: number) => void;
  onButton: (btn: TouchActionButton, pressed: boolean) => void;
}

function ActionCircleButton({
  label,
  sublabel,
  btn,
  className,
  onButton,
}: {
  label: string;
  sublabel?: string;
  btn: TouchActionButton;
  className: string;
  onButton: (btn: TouchActionButton, pressed: boolean) => void;
}) {
  const [pressed, setPressed] = useState(false);

  const handleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    onButton(btn, true);
  };

  const handleUp = () => {
    setPressed(false);
    onButton(btn, false);
  };

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={`absolute flex touch-none select-none flex-col items-center justify-center rounded-full border text-white shadow-lg transition-transform duration-75 ${
        pressed ? 'scale-90 brightness-110' : 'scale-100'
      } ${className}`}
    >
      <span className="font-display text-[13px] font-extrabold leading-none tracking-wide [@media(min-width:768px)_and_(min-height:540px)]:text-sm">
        {label}
      </span>
      {sublabel && (
        <span className="mt-0.5 text-[9px] font-semibold leading-none tracking-wider text-white/75">
          {sublabel}
        </span>
      )}
    </button>
  );
}

export default function TouchControlsOverlay({
  visible,
  onOffense,
  canCallPass = false,
  onMove,
  onButton,
}: TouchControlsOverlayProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [stickActive, setStickActive] = useState(false);

  if (!visible) return null;

  const updateStick = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const maxRadius = rect.width * 0.36;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius && dist > 0) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onMove(dx / maxRadius, dy / maxRadius);
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    setStickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <>
      {/* Bottom-Left Corner Virtual Joystick */}
      <div
        className="pointer-events-none fixed z-20"
        style={{
          left: 'max(12px, env(safe-area-inset-left))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          ref={padRef}
          onPointerDown={(e) => {
            pointerIdRef.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            setStickActive(true);
            updateStick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (pointerIdRef.current === e.pointerId) {
              updateStick(e.clientX, e.clientY);
            }
          }}
          onPointerUp={resetStick}
          onPointerCancel={resetStick}
          aria-label="Movement Joystick"
          className="pointer-events-auto relative flex h-24 w-24 touch-none items-center justify-center rounded-full border border-white/25 bg-[#0b0f19]/75 shadow-xl [@media(min-width:768px)_and_(min-height:540px)]:h-32 [@media(min-width:768px)_and_(min-height:540px)]:w-32"
        >
          {/* Inner Guide Ring & Cardinal Ticks */}
          <div className="h-12 w-12 rounded-full border border-white/15 [@media(min-width:768px)_and_(min-height:540px)]:h-16 [@media(min-width:768px)_and_(min-height:540px)]:w-16" />
          <span className="absolute top-1.5 h-1.5 w-0.5 rounded-full bg-white/30" />
          <span className="absolute bottom-1.5 h-1.5 w-0.5 rounded-full bg-white/30" />
          <span className="absolute left-1.5 h-0.5 w-1.5 rounded-full bg-white/30" />
          <span className="absolute right-1.5 h-0.5 w-1.5 rounded-full bg-white/30" />

          {/* Tactile Thumb Cap */}
          <div
            className={`absolute h-10 w-10 rounded-full border shadow-md [@media(min-width:768px)_and_(min-height:540px)]:h-12 [@media(min-width:768px)_and_(min-height:540px)]:w-12 ${
              stickActive
                ? 'border-amber-300 bg-amber-500'
                : 'border-amber-400/75 bg-amber-500/85'
            }`}
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>
      </div>

      {/* Bottom-Right Corner Ergonomic Action Cluster */}
      <div
        className="pointer-events-none fixed z-20"
        style={{
          right: 'max(12px, env(safe-area-inset-right))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="relative h-[138px] w-[196px] [@media(min-width:768px)_and_(min-height:540px)]:h-[164px] [@media(min-width:768px)_and_(min-height:540px)]:w-[232px]">
          {/* Primary SHOOT anchored flush in bottom-right corner */}
          <ActionCircleButton
            label="SHOOT"
            sublabel={onOffense ? 'DUNK' : 'JUMP'}
            btn="shoot"
            onButton={onButton}
            className="right-0 bottom-0 h-[66px] w-[66px] border-amber-300/70 bg-amber-600/95 [@media(min-width:768px)_and_(min-height:540px)]:h-[76px] [@media(min-width:768px)_and_(min-height:540px)]:w-[76px]"
          />

          {/* PASS / CALL / SWITCH immediately left of SHOOT */}
          <ActionCircleButton
            label={onOffense ? (canCallPass ? 'CALL' : 'PASS') : 'SWITCH'}
            sublabel={onOffense && canCallPass ? 'PASS' : undefined}
            btn="pass"
            onButton={onButton}
            className="right-[76px] bottom-[2px] h-[54px] w-[54px] border-blue-400/50 bg-blue-900/90 [@media(min-width:768px)_and_(min-height:540px)]:right-[88px] [@media(min-width:768px)_and_(min-height:540px)]:bottom-[4px] [@media(min-width:768px)_and_(min-height:540px)]:h-[62px] [@media(min-width:768px)_and_(min-height:540px)]:w-[62px]"
          />

          {/* BLOCK directly above SHOOT */}
          <ActionCircleButton
            label="BLOCK"
            sublabel="REB"
            btn="block"
            onButton={onButton}
            className="right-[2px] bottom-[76px] h-[52px] w-[52px] border-sky-400/45 bg-sky-900/90 [@media(min-width:768px)_and_(min-height:540px)]:right-[4px] [@media(min-width:768px)_and_(min-height:540px)]:bottom-[88px] [@media(min-width:768px)_and_(min-height:540px)]:h-[60px] [@media(min-width:768px)_and_(min-height:540px)]:w-[60px]"
          />

          {/* STEAL / CROSS diagonal upper-left of SHOOT */}
          <ActionCircleButton
            label={onOffense ? 'CROSS' : 'STEAL'}
            btn="steal"
            onButton={onButton}
            className="right-[64px] bottom-[66px] h-[52px] w-[52px] border-rose-400/45 bg-rose-950/90 [@media(min-width:768px)_and_(min-height:540px)]:right-[76px] [@media(min-width:768px)_and_(min-height:540px)]:bottom-[76px] [@media(min-width:768px)_and_(min-height:540px)]:h-[60px] [@media(min-width:768px)_and_(min-height:540px)]:w-[60px]"
          />

          {/* SPRINT always accessible in outer upper-left arc */}
          <ActionCircleButton
            label="SPRINT"
            btn="sprint"
            onButton={onButton}
            className="right-[128px] bottom-[58px] h-[50px] w-[50px] border-emerald-400/45 bg-emerald-950/90 [@media(min-width:768px)_and_(min-height:540px)]:right-[150px] [@media(min-width:768px)_and_(min-height:540px)]:bottom-[68px] [@media(min-width:768px)_and_(min-height:540px)]:h-[58px] [@media(min-width:768px)_and_(min-height:540px)]:w-[58px]"
          />

          {/* GUARD / BOX-OUT outer bottom-left of cluster */}
          <ActionCircleButton
            label="GUARD"
            btn="defend"
            onButton={onButton}
            className="right-[142px] bottom-0 h-[48px] w-[48px] border-white/25 bg-zinc-900/90 [@media(min-width:768px)_and_(min-height:540px)]:right-[164px] [@media(min-width:768px)_and_(min-height:540px)]:bottom-[2px] [@media(min-width:768px)_and_(min-height:540px)]:h-[54px] [@media(min-width:768px)_and_(min-height:540px)]:w-[54px]"
          />
        </div>
      </div>
    </>
  );
}
