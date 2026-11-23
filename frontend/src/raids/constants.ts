import type { BadgeId } from "./types";

// What each badge looks like and what it is for. The server decides who earns them.
export const BADGES: Record<
  BadgeId,
  { icon: string; name: string; text: string }
> = {
  first_blood: {
    icon: "🗡️",
    name: "First Blood",
    text: "Landed the first hit on the boss",
  },
  mvp: { icon: "👑", name: "MVP", text: "Dealt the most damage" },
  perfect_run: {
    icon: "💎",
    name: "Perfect Run",
    text: "Answered every question correctly",
  },
  slayer: {
    icon: "☠️",
    name: "Slayer",
    text: "Struck the killing blow",
  },
};

// The emoji send in a raid. Must match EMOTES in backend/raidLogic.ts,
export const EMOTES = ["🔥", "👏", "😂", "💪", "😱"];