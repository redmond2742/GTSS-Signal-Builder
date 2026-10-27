import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COORDINATION_ENTITIES,
  summarizeIssues,
  useGTSSStore,
  type CoordinationIssue,
  type CoordinationKey,
} from "gtss";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useCoordinationIssues } from "@/hooks/use-coordination-issues";

/** A list of issues, errors in red and warnings in amber. */
export function IssueList({ issues }: { issues: readonly CoordinationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        No problems found.
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue.id} className="flex items-start gap-2 text-xs">
          <AlertTriangle
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
              issue.level === "error" ? "text-red-600" : "text-amber-600"
            }`}
          />
          <span className={issue.level === "error" ? "text-red-700" : "text-grey-700"}>
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface CoordinationValidationProps {
  /** Go to a file's page in Coordination. */
  onOpenFile?: (key: CoordinationKey) => void;
}

/**
 * Everything validation finds in the coordination files, grouped by file in the
 * order they're listed, each with a way to go and fix it.
 */
export default function CoordinationValidation({ onOpenFile }: CoordinationValidationProps) {
  const { coordination } = useGTSSStore();
  const issues = useCoordinationIssues();
  const { errors, warnings } = summarizeIssues(issues);
  const totalRows = COORDINATION_ENTITIES.reduce(
    (sum, e) => sum + (coordination[e.key]?.length ?? 0),
    0,
  );

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-grey-800">
          <ShieldCheck className="h-4 w-4 text-primary-600" />
          Coordination files
          <span className="text-xs font-normal text-grey-500">
            {totalRows === 0
              ? "nothing imported yet"
              : errors + warnings === 0
                ? "no problems found"
                : [
                    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
                    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
                  ]
                    .filter(Boolean)
                    .join(", ")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {totalRows === 0 ? (
          <p className="text-sm text-grey-500">
            Import coordination files (Import tab) to check them here.
          </p>
        ) : issues.length === 0 ? (
          <IssueList issues={issues} />
        ) : (
          COORDINATION_ENTITIES.map((entity) => {
            const own = issues.filter((i) => i.scope === entity.key);
            if (own.length === 0) return null;
            return (
              <section key={entity.key} aria-label={entity.filename} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-grey-800">
                    {entity.filename}
                    <span className="ml-1.5 text-xs font-normal text-grey-500">
                      {own.length} to check
                    </span>
                  </h3>
                  {onOpenFile && (
                    <Button
                      variant="outline"
                      onClick={() => onOpenFile(entity.key)}
                      className="h-7 px-2 text-xs"
                    >
                      Open {entity.filename}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </div>
                <IssueList issues={own} />
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
