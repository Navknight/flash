import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RaidRanking } from "./types";

type Props = {
  connected: boolean;
  myUid: string;
  load: () => Promise<RaidRanking[]>;
};

// The top raiders over every finished raid: total boss damage, and raids won.
export default function RaidLeaderboard({ connected, myUid, load }: Props) {
  const [rows, setRows] = useState<RaidRanking[] | null>(null);

  useEffect(() => {
    if (!connected) return;
    load()
      .then(setRows)
      .catch(() => setRows([]));
  }, [connected, load]);

  if (!rows || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top raiders</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {rows.map((r, i) => (
          <div key={r.uid} className="flex items-center justify-between">
            <span>
              {i + 1}. {r.uid === myUid ? "You" : r.name}
            </span>
            <span className="text-muted-foreground">
              <span className="font-mono text-foreground">
                {r.damage.toLocaleString()}
              </span>{" "}
              damage · {r.wins}/{r.raids} won
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}