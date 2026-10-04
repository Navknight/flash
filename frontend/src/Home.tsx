import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useUser } from "./firebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Deck = {
  id: number;
  title: string;
  subject: string;
  owner: string;
  cards: number;
};

const Home = () => {
  const user = useUser();
  const [decks, setDecks] = useState<Deck[]>([]);

  useEffect(() => {
    fetch("/api/decks")
      .then((r) => r.json())
      .then(setDecks);
  }, []);

  return (
    <div className="mx-auto mt-10 max-w-5xl px-4">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Decks</h1>
          <p className="text-muted-foreground">
            Pick a deck and race other students through it.
          </p>
        </div>
        {user && <Button render={<Link to="/upload" />}>Upload a deck</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Cards</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {decks.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                <Link to={`/room/${d.id}`} className="hover:underline">
                  {d.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{d.subject}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{d.cards}</TableCell>
              <TableCell className="text-muted-foreground">{d.owner}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default Home;
