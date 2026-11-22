import type { ReactNode } from "react";

export default function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      {title && <h2 className="mb-3 text-lg font-extrabold">{title}</h2>}
      {children}
    </div>
  );
}
