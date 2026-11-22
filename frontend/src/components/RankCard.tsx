import { TIERS, tier } from "@/lib/tier";

// each tier is 150 points wide, so the bar goes from 950 to 1700
const LOW = 950;
const HIGH = 1700;

export default function RankCard({ elo }: { elo: number }) {
  const t = tier(elo);
  const next = [...TIERS].reverse().find((x) => x.min > elo);
  const pos = Math.min(1, Math.max(0, (elo - LOW) / (HIGH - LOW)));

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className={`text-xl font-extrabold ${t.color}`}>{t.name}</h2>
        <span className="text-3xl font-light tabular-nums">{elo}</span>
      </div>
      <div className="relative mt-5 mb-2">
        <div className="flex h-1.5 overflow-hidden rounded-sm">
          {[...TIERS].reverse().map((x) => (
            <span key={x.name} className={`flex-1 ${x.bar}`} />
          ))}
        </div>
        <span
          className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-sm bg-foreground"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {[...TIERS].reverse().map((x) => (
          <span key={x.name}>{x.name}</span>
        ))}
      </div>
      {next && (
        <p className="mt-3 text-sm text-muted-foreground">
          {next.name} at {next.min}
        </p>
      )}
    </div>
  );
}
