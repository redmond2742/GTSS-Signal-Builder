import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";

export type CellType = "text" | "number";

interface CoordinationCellProps {
  value: unknown;
  /** Key columns are the row's address; editing one would relocate it. */
  locked: boolean;
  type: CellType;
  label: string;
  readOnly: boolean;
  onCommit: (next: string | number | null) => void;
}

/**
 * One editable cell.
 *
 * Commits on blur and on Enter rather than on every keystroke: these writes go
 * straight to localStorage, and per-character saves would thrash it and make
 * a half-typed number briefly the stored value. Escape reverts.
 */
export default function CoordinationCell({
  value,
  locked,
  type,
  label,
  readOnly,
  onCommit,
}: CoordinationCellProps) {
  const asText = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(asText);
  const [editing, setEditing] = useState(false);

  // Keep in step when the row changes underneath (import, undo, another edit).
  useEffect(() => {
    if (!editing) setDraft(asText);
  }, [asText, editing]);

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 font-mono text-grey-600">
            {asText || <span className="text-grey-400">&mdash;</span>}
            <Lock className="h-2.5 w-2.5 shrink-0 text-grey-300" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {label} identifies this row. Add or delete a row to change it — editing it here would move
          the row somewhere else.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (readOnly) {
    return <span>{asText || <span className="text-grey-400">&mdash;</span>}</span>;
  }

  const commit = () => {
    setEditing(false);
    if (draft === asText) return;
    if (type === "number") {
      const trimmed = draft.trim();
      if (trimmed === "") return onCommit(null);
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        setDraft(asText); // reject rather than store NaN
        return;
      }
      return onCommit(n);
    }
    onCommit(draft.trim() === "" ? null : draft);
  };

  return (
    <Input
      value={draft}
      type={type === "number" ? "number" : "text"}
      aria-label={label}
      onChange={(e) => {
        setEditing(true);
        setDraft(e.target.value);
      }}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(asText);
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-6 w-full min-w-0 px-1 py-0 text-xs"
    />
  );
}
