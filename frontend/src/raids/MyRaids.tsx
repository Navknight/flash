import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RaidSummary } from "./types";

const LABEL: Record<RaidSummary["status"], { text: string; color: string }> = {
  lobby: { text: "Waiting to start", color: "text-muted-foreground" },
  active: { text: "In progress", color: "text-yellow-500" },
  won: { text: "Victory", color: "text-green-500" },
  lost: { text: "Defeated", color: "text-red-500" },
};

type Props = {
  connected: boolean;
  load: () => Promise<RaidSummary[]>;
  onOpen: (code: string) => void;
};

// Raids I have played. Opening one rejoins it (or shows its results if it is over).
export default function MyRaids({ connected, load, onOpen }: Props) {
  const [raids, setRaids] = useState<RaidSummary[] | null>(null);

  useEffect(() => {
    if (!connected) return;
    load()
      .then(setRaids)
      .catch(() => setRaids([]));
  }, [connected, load]);

  if (!raids || raids.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My raids</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {raids.map((r) => {
          const label = LABEL[r.status];
          return (
            <div
              key={r.code}
              className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.bossName} · {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                  <span className={label.color}>{label.text}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.totalDamage} damage · {r.correct}/{r.answered} correct
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpen(r.code)}>
                {r.status === "won" || r.status === "lost" ? "Results" : "Open"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}