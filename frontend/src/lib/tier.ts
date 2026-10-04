const TIERS = [
  { min: 1550, name: "Master", color: "text-fuchsia-400" },
  { min: 1400, name: "Diamond", color: "text-cyan-400" },
  { min: 1250, name: "Gold", color: "text-yellow-400" },
  { min: 1100, name: "Silver", color: "text-zinc-300" },
  { min: 0, name: "Bronze", color: "text-orange-400" },
];
export const tier = (elo: number) => TIERS.find((t) => elo >= t.min)!;
