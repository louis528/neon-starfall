// Keyboard and pointer input. Held keys give movement axes and a fire flag; one-shot presses
// (start or restart, pause, mute) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. A pointer drag steers the
// ship toward the pointer (the shell turns the offset into axes) and holding the pointer
// down fires.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = { left: false, right: false, up: false, down: false, fire: false };
  let actions = 0;
  let pointer = null; // { x, y, down } in canvas device pixels, or null when untouched

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (event.code === 'Space') {
      held.fire = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (event.code === 'Space') held.fire = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = held.fire = false;
  });

  function setPointer(event) {
    const rect = target.getBoundingClientRect();
    pointer = {
      x: (event.clientX - rect.left) * (target.width / rect.width),
      y: (event.clientY - rect.top) * (target.height / rect.height),
      down: pointer?.down ?? false,
    };
  }
  target.addEventListener('pointerdown', (event) => {
    setPointer(event);
    pointer.down = true;
    actions |= ACTION_CONFIRM;
    target.setPointerCapture?.(event.pointerId);
  });
  target.addEventListener('pointermove', (event) => {
    if (pointer !== null) setPointer(event);
  });
  const release = () => { if (pointer !== null) pointer.down = false; };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);

  return {
    /** Held-key axes, each -1, 0 or 1. */
    axes() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** Whether the fire control (Space or a held pointer) is down. */
    firing() {
      return held.fire || (pointer !== null && pointer.down);
    },
    /** The pointer position in canvas pixels while it is down, else null. */
    pointerTarget() {
      return pointer !== null && pointer.down ? pointer : null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
