import type { CameraMode, InputFrame } from '../simulation/types';

export interface InputCallbacks {
  onLook(yawDelta: number, pitchDelta: number): void;
  onMode(mode: CameraMode): void;
  onPause(paused: boolean): void;
  onReset(): void;
  isPaused(): boolean;
  getMode(): CameraMode;
}

export function createInput(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
  const keys = new Set<string>();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let jumpPending = false;
  const modes: Record<string, CameraMode> = { Digit1: 'third-person', Digit2: 'first-person', Digit3: 'free', Digit4: 'eagle-eye' };
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);
  const clear = () => { keys.clear(); jumpPending = false; };
  const pause = () => {
    clear();
    callbacks.onPause(true);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  async function requestPointerLock() {
    if (callbacks.getMode() === 'eagle-eye') { callbacks.onPause(false); return; }
    try {
      await canvas.requestPointerLock();
      callbacks.onPause(false);
    } catch (error) {
      // The menu remains usable if the browser refuses the gesture/lock.
      pause();
      throw error;
    }
  }
  canvas.addEventListener('click', () => { void requestPointerLock().catch(() => {}); }, options);
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (movementKeys.has(event.code)) event.preventDefault();
    if (event.code === 'Escape') { pause(); return; }
    if (event.repeat) return;
    if (modes[event.code]) { clear(); callbacks.onMode(modes[event.code]); return; }
    if (event.code === 'KeyV') {
      clear();
      callbacks.onMode(callbacks.getMode() === 'first-person' ? 'third-person' : 'first-person');
      return;
    }
    if (event.code === 'KeyR') { clear(); callbacks.onReset(); return; }
    if (callbacks.isPaused()) return;
    keys.add(event.code);
    if (event.code === 'Space') jumpPending = true;
  }, options);
  document.addEventListener('keyup', event => { keys.delete(event.code); }, options);
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas || callbacks.isPaused() || callbacks.getMode() === 'eagle-eye') return;
    callbacks.onLook(-event.movementX * 0.0022, -event.movementY * 0.0022);
  }, options);
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) pause();
  }, options);
  window.addEventListener('blur', pause, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, options);
  return {
    read(): InputFrame {
      if (callbacks.isPaused()) { clear(); return { forward: 0, right: 0, ascend: 0, jump: false, run: false }; }
      const frame = {
        forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        right: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        ascend: Number(keys.has('KeyE')) - Number(keys.has('KeyQ')),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpPending,
      };
      jumpPending = false;
      return frame;
    },
    clear, requestPointerLock,
    dispose() { abort.abort(); clear(); if (document.pointerLockElement === canvas) document.exitPointerLock(); },
  };
}
