import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { auth } from "./firebase";
import { parseDeck } from "./parseDeck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Upload() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File;
    try {
      const cards = parseDeck(file.name, await file.text());
      const token = await auth.currentUser?.getIdToken();
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
      if (!res.ok) return setError((await res.json()).message);
      navigate("/");
    } catch {
      setError("Could not read that file");
    }
  };

  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardHeader>
        <CardTitle>Upload a deck</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input name="title" placeholder="Title" required />
          <Input
            name="subject"
            placeholder="Subject (e.g. Operating Systems)"
            required
          />
          <Input name="file" type="file" accept=".json,.csv,.txt" required />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit">Upload</Button>
        </form>
      </CardContent>
    </Card>
  );
}
