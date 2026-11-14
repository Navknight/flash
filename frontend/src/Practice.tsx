import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

// missed answers have extra fields (picked, correct) but we only need these two
type Card = { prompt: string; answer: string };

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Practice({
  cards,
  onClose,
}: {
  cards: Card[];
  onClose: () => void;
}) {
  const [deck, setDeck] = useState(() => shuffle(cards));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [repeats, setRepeats] = useState(0);
  const card = deck[i];

  const goTo = (n: number) => {
    setFlipped(false);
    setI(n);
  };

  const next = () => goTo(i + 1);

  const prev = () => {
    if (i > 0) goTo(i - 1);
  };

  const missed = () => {
    setDeck((d) => [...d, card]);
    setRepeats((r) => r + 1);
    next();
  };

  const reshuffle = () => {
    setDeck((d) => [...d.slice(0, i), ...shuffle(d.slice(i))]);
    setFlipped(false);
  };

  const restart = () => {
    setDeck(shuffle(cards));
    setRepeats(0);
    goTo(0);
  };

  useEffect(() => {
    if (!card) return;

    const onKey = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && e.target instanceof HTMLButtonElement) return;

      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && flipped) {
        e.preventDefault();
        next();
      } else if (e.key.toLowerCase() === "m" && flipped) {
        e.preventDefault();
        missed();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, i, deck]);

  if (!card)
    return (
      <div className="flex flex-col gap-3">
        <p>
          Done! You went through all {cards.length} cards
          {repeats > 0 && ` (${repeats} repeat${repeats === 1 ? "" : "s"})`}.
        </p>
        <div className="flex gap-2">
          <Button onClick={restart}>Practice again</Button>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Card {i + 1}/{deck.length}
        </p>
        <Button variant="ghost" size="sm" onClick={reshuffle}>
          Shuffle
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setFlipped(!flipped)}
        className="h-48 [perspective:1000px]"
      >
        <div
          key={i + card.prompt}
          className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-xl border bg-card p-6 text-lg transition-opacity delay-250 duration-0 [backface-visibility:hidden] ${flipped ? "opacity-0" : ""}`}
          >
            {card.prompt}
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-xl border bg-primary/10 p-6 text-lg transition-opacity delay-250 duration-0 [backface-visibility:hidden] [transform:rotateY(180deg)] ${flipped ? "" : "opacity-0"}`}
          >
            {card.answer}
          </div>
        </div>
      </button>

      <p className="text-xs text-muted-foreground">
        Space to flip · ← previous · Enter or → got it · M missed it
      </p>
      <div className="flex gap-2">
        {i > 0 && (
          <Button variant="outline" onClick={prev}>
            Previous
          </Button>
        )}
        {/* only let them move on after they've seen the answer */}
        {flipped && (
          <>
            <Button variant="outline" onClick={missed}>
              Missed it
            </Button>
            <Button onClick={next}>Got it</Button>
          </>
        )}
      </div>
    </div>
  );
}
