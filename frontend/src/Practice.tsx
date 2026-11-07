import { useState,useEffect } from "react";
import { Button } from "@/components/ui/button";

// missed answers have extra fields (picked, correct) but we only need these two
type Card = { prompt: string; answer: string };

export default function Practice({
  cards,
  onClose,
}: {
  cards: Card[];
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];


  const next = () => {
    setFlipped(false);
    setI(i + 1);
  };

  useEffect(() => {
    if (!card) return; 

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault(); 
        setFlipped((f) => !f);
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && flipped) {
        e.preventDefault();
        next();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown",onKey); 
  }, [card, flipped, i]);



  if (!card)
    return (
      <div className="flex flex-col gap-3">
        <p>Done! You went through all {cards.length} cards.</p>
        <Button className="self-start" onClick={onClose}>
          Back
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Card {i + 1}/{cards.length}
      </p>
      <button
        type="button"
        onClick={() => setFlipped(!flipped)}
        className="rounded border p-6 text-left text-lg"
      >
        {flipped ? card.answer : card.prompt}
      </button>
      <p className="text-xs text-muted-foreground">Click the card or press Space to flip it · Enter or → for next</p>
      {/* only let them move on after they've seen the answer */}
      {flipped && (
        <Button className="self-start" onClick={next}>
          Next
        </Button>
      )}
    </div>
  );
}
