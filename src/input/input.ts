import type { CameraMode, InputFrame } from '../simulation/types';

export interface InputCallbacks {
  onLook(yawDelta: number, pitchDelta: number): void;
  onMode(mode: CameraMode): void;
  onPause(paused: boolean): void;
  onReset(): void;
  onInteract?(): void;
  onLookControl(control: 'captured' | 'drag'): void;
  isPaused(): boolean;
  getMode(): CameraMode;
}

export function createInput(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
  const keys = new Set<string>();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let jumpPending = false;
  let dragLook = false;
  let drag: { id: number; x: number; y: number } | null = null;
  let starting = false;
  let startVersion = 0;
  let wasLocked = document.pointerLockElement === canvas;
  const modes: Record<string, CameraMode> = { Digit1: 'third-person', Digit2: 'first-person', Digit3: 'free', Digit4: 'eagle-eye' };
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);
  const endDrag = () => {
    const pointer = drag;
    drag = null;
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
  };
  const clear = () => { keys.clear(); jumpPending = false; endDrag(); };
  const pause = () => {
    startVersion++;
    clear();
    callbacks.onPause(true);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  async function start() {
    if (starting || abort.signal.aborted) return false;
    starting = true;
    const version = startVersion;
    canvas.focus({ preventScroll: true });
    try {
      if (callbacks.getMode() !== 'eagle-eye' && !dragLook && document.pointerLockElement !== canvas) {
        try {
          await canvas.requestPointerLock();
          // A resolved request alone must never be treated as acquired capture.
          if (document.pointerLockElement !== canvas) throw new Error('Mouse capture unavailable');
        } catch {
          // Embedded browsers can reject capture. Keep the same playable world
          // available through an ordinary button-held drag, without retry loops.
          if (abort.signal.aborted) return false;
          dragLook = true;
          callbacks.onLookControl('drag');
        }
      }
      if (version !== startVersion || abort.signal.aborted) {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        return false;
      }
      callbacks.onLookControl(dragLook ? 'drag' : 'captured');
      callbacks.onPause(false);
      return true;
    } finally { starting = false; }
  }
  canvas.addEventListener('pointerdown', event => {
    if (!dragLook || event.button !== 0 || !event.isPrimary || callbacks.isPaused() || callbacks.getMode() === 'eagle-eye') return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || callbacks.isPaused()) return;
    if (!(event.buttons & 1) || callbacks.getMode() === 'eagle-eye') { endDrag(); return; }
    callbacks.onLook(-(event.clientX - drag.x) * 0.0022, -(event.clientY - drag.y) * 0.0022);
    drag.x = event.clientX; drag.y = event.clientY;
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endDrag, options);
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
    if (event.code === 'KeyF') { event.preventDefault(); callbacks.onInteract?.(); return; }
    keys.add(event.code);
    if (event.code === 'Space') jumpPending = true;
  }, options);
  document.addEventListener('keyup', event => { keys.delete(event.code); }, options);
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas || callbacks.isPaused() || callbacks.getMode() === 'eagle-eye') return;
    callbacks.onLook(-event.movementX * 0.0022, -event.movementY * 0.0022);
  }, options);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    const lostLock = wasLocked && !locked;
    wasLocked = locked;
    if (lostLock) pause();
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
    clear, start,
    dispose() { abort.abort(); clear(); if (document.pointerLockElement === canvas) document.exitPointerLock(); },
  };
}
