import type { ReactNode } from "react";

export default function IndexCard({
  corner,
  className = "",
  children,
}: {
  corner?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`index-card flex flex-col ${className}`}>
      <div className="index-card-top">{corner}</div>
      <div className="ruled flex-1 px-6 pt-1 pb-8">{children}</div>
    </div>
  );
}
