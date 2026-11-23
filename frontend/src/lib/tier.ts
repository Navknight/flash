export const TIERS = [
  {
    min: 1550,
    name: "Master",
    color: "text-fuchsia-700 dark:text-fuchsia-400",
    bar: "bg-fuchsia-500",
  },
  {
    min: 1400,
    name: "Diamond",
    color: "text-cyan-700 dark:text-cyan-400",
    bar: "bg-cyan-500",
  },
  {
    min: 1250,
    name: "Gold",
    color: "text-yellow-700 dark:text-yellow-400",
    bar: "bg-yellow-500",
  },
  {
    min: 1100,
    name: "Silver",
    color: "text-zinc-500 dark:text-zinc-300",
    bar: "bg-zinc-400",
  },
  {
    min: 0,
    name: "Bronze",
    color: "text-orange-700 dark:text-orange-400",
    bar: "bg-orange-700",
  },
];
export const tier = (elo: number) => TIERS.find((t) => elo >= t.min)!;
