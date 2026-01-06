import { useState } from "react";
import { Approach } from "@shared/schema";
import { useGTSSStore } from "@/store/gtss-store";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SortField = "signalId" | "approachId" | "streetName" | "compassBearing" | "postedSpeed";
type SortDirection = "asc" | "desc";

export default function ApproachesTable() {
  const [sortField, setSortField] = useState<SortField>("signalId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { approaches, signals } = useGTSSStore();

  const orphanApproaches = approaches.filter(
    (approach) => !signals.some((signal) => signal.signalId === approach.signalId)
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortedApproaches = () => {
    return [...approaches].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case "signalId":
          aValue = a.signalId;
          bValue = b.signalId;
          break;
        case "approachId":
          aValue = a.approachId;
          bValue = b.approachId;
          break;
        case "streetName":
          aValue = a.streetName;
          bValue = b.streetName;
          break;
        case "compassBearing":
          aValue = a.compassBearing;
          bValue = b.compassBearing;
          break;
        case "postedSpeed":
          aValue = a.postedSpeed ?? 0;
          bValue = b.postedSpeed ?? 0;
          break;
        default:
          aValue = a.signalId;
          bValue = b.signalId;
      }

      if (sortDirection === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    });
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="text-xs font-medium text-grey-500 uppercase tracking-wider cursor-pointer hover:bg-grey-100 transition-colors py-1.5 px-2"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        {children}
        <div className="flex flex-col ml-1">
          <ChevronUp
            className={`w-2 h-2 ${sortField === field && sortDirection === "asc" ? "text-primary-600" : "text-grey-300"}`}
          />
          <ChevronDown
            className={`w-2 h-2 -mt-0.5 ${sortField === field && sortDirection === "desc" ? "text-primary-600" : "text-grey-300"}`}
          />
        </div>
      </div>
    </TableHead>
  );

  return (
    <div className="max-w-6xl">
      <Card>
        <CardContent className="p-0">
          {orphanApproaches.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-xs font-medium">Orphaned approaches detected</p>
                  <p className="text-xs text-amber-700">
                    {orphanApproaches.length} approach{orphanApproaches.length > 1 ? "es" : ""} reference deleted signals.
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs text-amber-800 bg-amber-100">
                Review Needed
              </Badge>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <SortableHeader field="signalId">Signal ID</SortableHeader>
                  <SortableHeader field="approachId">Approach ID</SortableHeader>
                  <SortableHeader field="streetName">Street Name</SortableHeader>
                  <SortableHeader field="compassBearing">Bearing</SortableHeader>
                  <SortableHeader field="postedSpeed">Posted Speed</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approaches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-grey-500">
                      <div className="flex flex-col items-center space-y-2">
                        <AlertTriangle className="w-6 h-6 text-grey-300" />
                        <p>No approaches configured</p>
                        <p className="text-grey-400">Import or add approaches to see them listed here.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedApproaches().map((approach) => {
                    const isOrphan = orphanApproaches.some((item) => item.id === approach.id);
                    return (
                      <TableRow
                        key={approach.id}
                        className={`transition-colors ${isOrphan ? "bg-amber-50/40" : "hover:bg-grey-50"}`}
                      >
                        <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">
                          {approach.signalId}
                          {isOrphan && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-200 text-amber-700">
                              Orphaned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">{approach.approachId}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">{approach.streetName}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">{approach.compassBearing}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                          {approach.postedSpeed ? `${approach.postedSpeed} mph` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
