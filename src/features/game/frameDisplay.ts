import type { FrameSnapshot } from "@/lib/api/schemas";

const PINS_PER_FRAME = 15;

//Show X / accordingly for strikes and spares
export function frameRollSymbols(rolls: number[]): string[] {
  const symbols: string[] = [];
  let standing = PINS_PER_FRAME;
  rolls.forEach((pins, index) => {
    if (pins === standing) {
      symbols.push(index === 0 ? "X" : "/");
      standing = PINS_PER_FRAME;
    } else {
      symbols.push(String(pins));
      standing -= pins;
    }
  });
  return symbols;
}

export function pinsRemainingForFrame(rolls: number[]): number {
  let standing = PINS_PER_FRAME;
  for (const pins of rolls) {
    standing = pins === standing ? PINS_PER_FRAME : standing - pins;
  }
  return standing;
}

//asks backend for the number of pins felled in the last confirmed roll
export function lastConfirmedRollPinsFelled(frames: FrameSnapshot[]): number | null {
  const framesWithRolls = frames.filter((frame) => frame.rolls.length > 0).sort((a, b) => a.number - b.number);
  const lastFrame = framesWithRolls[framesWithRolls.length - 1];
  if (!lastFrame) return null;
  return lastFrame.rolls[lastFrame.rolls.length - 1];
}
