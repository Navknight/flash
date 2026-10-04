export type Card = {
  prompt: string;
  answer: string;
  choices?: string[];
  imageUrl?: string;
};

const strip = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ??
  "";

export function parseDeck(fileName: string, text: string): Card[] {
  if (fileName.endsWith(".json")) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.cards;
  }
  // CSV / Anki "Notes in Plain Text": front<TAB or ,>back[,wrong1,wrong2,wrong3]
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#")) // Anki header lines start with #
    .map((l) => l.split(l.includes("\t") ? "\t" : ",").map(strip))
    .filter((f) => f[0] && f[1])
    .map(([prompt, answer, ...wrong]) =>
      wrong.length >= 3
        ? { prompt, answer, choices: wrong.slice(0, 3) }
        : { prompt, answer },
    );
}
