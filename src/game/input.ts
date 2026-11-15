import type { InputState } from './types';

export type TouchActionButton = 'shoot' | 'pass' | 'steal' | 'block' | 'sprint' | 'defend';

export class InputManager {
  private keys = new Set<string>();
  private touchMove = { x: 0, z: 0 };
  private touchButtons = {
    shoot: false,
    pass: false,
    steal: false,
    block: false,
    sprint: false,
    defend: false,
  };

  private prevShoot = false;
  private prevPass = false;
  private prevSteal = false;
  private prevBlock = false;
  private prevSwitch = false;
  private prevPause = false;
  private prevCamera = false;

  private onPauseToggle?: () => void;
  private onCameraCycle?: () => void;

  constructor(callbacks?: { onPauseToggle?: () => void; onCameraCycle?: () => void }) {
    this.onPauseToggle = callbacks?.onPauseToggle;
    this.onCameraCycle = callbacks?.onCameraCycle;
  }

  public bind() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  public unbind() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (
      ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) &&
      document.activeElement === document.body
    ) {
      e.preventDefault();
    }
    if (!this.keys.has(e.code)) {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPauseToggle?.();
      }
      if (e.code === 'KeyC') {
        this.onCameraCycle?.();
      }
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleBlur = () => {
    this.keys.clear();
  };

  public setTouchMove(x: number, z: number) {
    this.touchMove.x = Math.max(-1, Math.min(1, x));
    this.touchMove.z = Math.max(-1, Math.min(1, z));
  }

  public setTouchButton(button: TouchActionButton, pressed: boolean) {
    this.touchButtons[button] = pressed;
  }

  public poll(): InputState {
    let moveX = 0;
    let moveZ = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;

    // Combine touch thumbstick
    if (Math.abs(this.touchMove.x) > 0.05 || Math.abs(this.touchMove.z) > 0.05) {
      moveX = this.touchMove.x;
      moveZ = this.touchMove.z;
    }

    let sprint =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchButtons.sprint;
    let shootHeld = this.keys.has('Space') || this.keys.has('KeyJ') || this.touchButtons.shoot;
    let passHeld = this.keys.has('KeyE') || this.keys.has('KeyK') || this.touchButtons.pass;
    let stealHeld = this.keys.has('KeyQ') || this.keys.has('KeyL') || this.touchButtons.steal;
    let blockHeld = this.keys.has('KeyR') || this.keys.has('KeyU') || this.touchButtons.block;
    let defendHeld = this.keys.has('KeyF') || this.touchButtons.defend;
    let switchHeld = this.keys.has('Tab') || this.keys.has('KeyV');

    // Poll Xbox / Standard Gamepad API
    let gamepadConnected = false;
    let gamepadName: string | null = null;
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (!gp || !gp.connected) continue;
        gamepadConnected = true;
        gamepadName = gp.id;

        const deadzone = 0.16;
        const lx = Math.abs(gp.axes[0] ?? 0) > deadzone ? gp.axes[0] : 0;
        const ly = Math.abs(gp.axes[1] ?? 0) > deadzone ? gp.axes[1] : 0;
        if (Math.abs(lx) > 0 || Math.abs(ly) > 0) {
          moveX = lx;
          moveZ = ly;
        }

        // Standard Xbox Mapping: A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Start=9
        const btn = (idx: number) => Boolean(gp.buttons[idx]?.pressed);
        if (btn(7) || (gp.buttons[7]?.value ?? 0) > 0.35) sprint = true;
        if (btn(6) || (gp.buttons[6]?.value ?? 0) > 0.35) defendHeld = true;
        if (btn(2)) shootHeld = true; // X = Shoot / Steal
        if (btn(0)) passHeld = true; // A = Pass / Switch
        if (btn(1)) stealHeld = true; // B = Crossover / Steal
        if (btn(3)) blockHeld = true; // Y = Block / Rebound
        if (btn(5)) switchHeld = true; // RB = Switch Teammate

        const gpPause = btn(9);
        if (gpPause && !this.prevPause) {
          this.onPauseToggle?.();
        }
        this.prevPause = gpPause;

        const gpCam = btn(4);
        if (gpCam && !this.prevCamera) {
          this.onCameraCycle?.();
        }
        this.prevCamera = gpCam;
        break;
      }
    }

    // Normalize diagonal keyboard input
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 1) {
      moveX /= mag;
      moveZ /= mag;
    }

    const shootJustPressed = shootHeld && !this.prevShoot;
    const shootJustReleased = !shootHeld && this.prevShoot;
    const passPressed = passHeld && !this.prevPass;
    const stealOrCrossPressed = stealHeld && !this.prevSteal;
    const blockOrReboundPressed = blockHeld && !this.prevBlock;
    const switchPlayerPressed = switchHeld && !this.prevSwitch;

    this.prevShoot = shootHeld;
    this.prevPass = passHeld;
    this.prevSteal = stealHeld;
    this.prevBlock = blockHeld;
    this.prevSwitch = switchHeld;

    return {
      moveX,
      moveZ,
      sprint,
      shootHeld,
      shootJustPressed,
      shootJustReleased,
      passPressed,
      stealOrCrossPressed,
      blockOrReboundPressed,
      defendHeld,
      switchPlayerPressed,
      gamepadConnected,
      gamepadName,
    };
  }
}
