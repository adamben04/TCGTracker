const OPEN_EVENT = 'tcg:open-command-palette';

export const commandPaletteOpenEvent = OPEN_EVENT;

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}
