import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { auth } from "./firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DeckCard = {
  prompt: string;
  answer: string;
  choices?: string[];
  imageUrl?: string;
};

const strip = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ??
  "";

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function parseDeck(fileName: string, text: string): DeckCard[] {
  if (fileName.endsWith(".json")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("This file is not valid JSON. Check for missing commas or quotes.");
    }
    const cards = Array.isArray(data) ? data : (data as { cards?: unknown })?.cards;
    if (!Array.isArray(cards)) {
      throw new Error(
        'JSON must be a list of cards, or an object with a "cards" list.',
      );
    }
    return cards as DeckCard[];
  }

  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = clean.includes("\t") ? "\t" : ",";
  return parseRows(clean, delimiter)
    .filter((row) => row.some((c) => c.trim()) && !row[0]?.startsWith("#"))
    .map((row) => row.map(strip))
    .filter((f) => f[0] && f[1])
    .map(([prompt, answer, ...wrong]) =>
      wrong.length >= 3
        ? { prompt, answer, choices: wrong.slice(0, 3) }
        : { prompt, answer },
    );
}

function validateCards(cards: DeckCard[]): string[] {
  const problems: string[] = [];

  if (cards.length < 4)
    problems.push(`A deck needs at least 4 cards, this file has ${cards.length}.`);
  if (cards.length > 2000)
    problems.push(`A deck can have at most 2000 cards, this file has ${cards.length}.`);

  cards.forEach((c, i) => {
    const n = i + 1;

    if (typeof c?.prompt !== "string" || !c.prompt.trim())
      problems.push(`Card ${n}: the prompt is missing.`);
    else if (c.prompt.length > 1000)
      problems.push(`Card ${n}: the prompt is over 1000 characters.`);

    if (typeof c?.answer !== "string" || !c.answer.trim())
      problems.push(`Card ${n}: the answer is missing.`);
    else if (c.answer.length > 500)
      problems.push(`Card ${n}: the answer is over 500 characters.`);

    if (c?.choices !== undefined) {
      const ok =
        Array.isArray(c.choices) &&
        c.choices.length === 3 &&
        c.choices.every((x) => typeof x === "string" && x.length <= 500);
      if (!ok)
        problems.push(
          `Card ${n}: choices must be exactly 3 wrong answers, each under 500 characters.`,
        );
    }

    if (c?.imageUrl !== undefined) {
      const ok =
        typeof c.imageUrl === "string" &&
        c.imageUrl.startsWith("https://") &&
        c.imageUrl.length <= 2000;
      if (!ok) problems.push(`Card ${n}: imageUrl must start with https://.`);
    }
  });

  return problems;
}

export default function Upload() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const problems = useMemo(() => (cards ? validateCards(cards) : []), [cards]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError("");
    setCards(null);
    if (!file) return;
    try {
      setCards(parseDeck(file.name, await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cards || problems.length > 0) return;
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("Sign in to upload a deck.");
        return;
      }
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.get("title"),
          subject: form.get("subject"),
          cards,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).message);
        return;
      }
      navigate("/");
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto mt-10 max-w-2xl">
      <CardHeader>
        <CardTitle>Upload a deck</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input name="title" placeholder="Title" maxLength={100} required />
          <Input
            name="subject"
            placeholder="Subject (e.g. Operating Systems)"
            maxLength={50}
            required
          />
          <Input
            name="file"
            type="file"
            accept=".json,.csv,.txt"
            onChange={onFile}
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          {cards && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Found {cards.length} cards. Preview of the first{" "}
                {Math.min(5, cards.length)}:
              </p>

              {problems.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-red-500">
                  {problems.slice(0, 5).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {problems.length > 5 && (
                    <li>and {problems.length - 5} more problems.</li>
                  )}
                </ul>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Answer</TableHead>
                    <TableHead>Wrong options</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.slice(0, 5).map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="max-w-[16rem] truncate">
                          {String(c?.prompt ?? "")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[12rem] truncate">
                          {String(c?.answer ?? "")}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c?.choices?.length ? "Provided" : "Picked automatically"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button
            type="submit"
            disabled={!cards || problems.length > 0 || submitting}
          >
            {submitting ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}