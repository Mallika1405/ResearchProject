import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface Props {
  title: string;
  badge?: string;
  badgeColor?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const Section = ({ title, badge, badgeColor = "text-primary", children }: Props) => {
  return (
    <div className="terminal-panel">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
          <ChevronRight className="h-3 w-3 text-primary" />
          <span className="text-foreground">{title}</span>
        </div>
        {badge && <span className={`text-[10px] uppercase ${badgeColor}`}>{badge}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
};
