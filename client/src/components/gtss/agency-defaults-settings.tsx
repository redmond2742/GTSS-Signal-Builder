import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useGTSSStore } from "@/store/gtss-store";
import {
  AgencyDefaults,
  DEFAULT_AGENCY_DEFAULTS,
  NEMA_DEFAULTS,
  PhaseDirectionStandard,
  sanitizePhaseDirectionStandard, useAgencyDefaults, validatePhaseDirectionStandard
} from "gtss";
import { Info, RotateCcw, Save, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";

const DIRECTIONS = [
  { key: 'N' as const, label: 'Northbound', abbr: 'NB' },
  { key: 'S' as const, label: 'Southbound', abbr: 'SB' },
  { key: 'E' as const, label: 'Eastbound', abbr: 'EB' },
  { key: 'W' as const, label: 'Westbound', abbr: 'WB' },
];

const PHASE_COUNT_OPTIONS = [2, 4, 6, 8];

/** Parse a comma-separated string of integers into a number array. Returns null if invalid. */
function parsePhaseNumbers(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(',').map((s) => s.trim());
  const nums: number[] = [];
  for (const part of parts) {
    if (!part) continue;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 8) return null;
    nums.push(n);
  }
  return nums;
}

/** Format a phase number array for display in an input. */
function formatPhaseNumbers(nums: number[] | undefined): string {
  if (!nums || nums.length === 0) return '';
  return nums.join(', ');
}

type DirKey = 'N' | 'S' | 'E' | 'W';
type FieldKey = DirKey | `${DirKey}_left`;

interface FormState {
  N: string;
  S: string;
  E: string;
  W: string;
  N_left: string;
  S_left: string;
  E_left: string;
  W_left: string;
}

function standardToForm(standard: PhaseDirectionStandard): FormState {
  return {
    N: formatPhaseNumbers(standard.N),
    S: formatPhaseNumbers(standard.S),
    E: formatPhaseNumbers(standard.E),
    W: formatPhaseNumbers(standard.W),
    N_left: formatPhaseNumbers(standard.N_left),
    S_left: formatPhaseNumbers(standard.S_left),
    E_left: formatPhaseNumbers(standard.E_left),
    W_left: formatPhaseNumbers(standard.W_left),
  };
}

function formToStandard(form: FormState): PhaseDirectionStandard | null {
  const result: PhaseDirectionStandard = {};
  const keys: FieldKey[] = ['N', 'S', 'E', 'W', 'N_left', 'S_left', 'E_left', 'W_left'];
  for (const key of keys) {
    const nums = parsePhaseNumbers(form[key]);
    if (nums === null) return null; // parse error
    if (nums.length > 0) {
      result[key as keyof PhaseDirectionStandard] = nums;
    }
  }
  return result;
}

export default function AgencyDefaultsSettings() {
  const { data: agencyDefaults, save: saveAgencyDefaults } = useAgencyDefaults();
  const { agency } = useGTSSStore();
  const { toast } = useToast();

  const current = agencyDefaults ?? DEFAULT_AGENCY_DEFAULTS;

  const [formState, setFormState] = useState<FormState>(
    standardToForm(current.phaseDirectionStandard)
  );
  const [defaultPhaseCount, setDefaultPhaseCount] = useState<number>(current.defaultPhaseCount);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Sync form when agencyDefaults changes externally (e.g., load from storage)
  useEffect(() => {
    const src = agencyDefaults ?? DEFAULT_AGENCY_DEFAULTS;
    setFormState(standardToForm(src.phaseDirectionStandard));
    setDefaultPhaseCount(src.defaultPhaseCount);
    setIsDirty(false);
    setValidationErrors([]);
  }, [agencyDefaults]);

  const handleFieldChange = (key: FieldKey, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setValidationErrors([]);
  };

  const handlePhaseCountChange = (count: number) => {
    setDefaultPhaseCount(count);
    setIsDirty(true);
  };

  const handleResetToNema = () => {
    setFormState(standardToForm(NEMA_DEFAULTS));
    setDefaultPhaseCount(8);
    setIsDirty(true);
    setValidationErrors([]);
    toast({
      title: "Reset to NEMA Defaults",
      description: "Values reset. Click Save to persist.",
    });
  };

  const handleSave = () => {
    const standard = formToStandard(formState);
    if (standard === null) {
      setValidationErrors(['One or more phase number fields contain invalid values. Use integers 1–8, comma-separated.']);
      return;
    }

    const sanitized = sanitizePhaseDirectionStandard(standard);
    const errors = validatePhaseDirectionStandard(sanitized);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const updated: AgencyDefaults = {
      agencyId: agency?.agencyId ?? '',
      phaseDirectionStandard: sanitized,
      defaultPhaseCount,
      updatedAt: new Date().toISOString(),
    };

    saveAgencyDefaults(updated);
    setIsDirty(false);
    setValidationErrors([]);

    toast({
      title: "Agency Defaults Saved",
      description: "Phase direction standards will be used when auto-assigning phases.",
    });
  };

  const handleCancel = () => {
    const src = agencyDefaults ?? DEFAULT_AGENCY_DEFAULTS;
    setFormState(standardToForm(src.phaseDirectionStandard));
    setDefaultPhaseCount(src.defaultPhaseCount);
    setIsDirty(false);
    setValidationErrors([]);
  };

  const savedAt = agencyDefaults?.updatedAt
    ? new Date(agencyDefaults.updatedAt).toLocaleString()
    : null;

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header card */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-grey-600" />
              <CardTitle className="text-sm font-semibold text-grey-800">Agency Defaults</CardTitle>
              {agency?.agencyId && (
                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                  {agency.agencyId}
                </Badge>
              )}
            </div>
            {savedAt && (
              <span className="text-xs text-grey-400">Last saved: {savedAt}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs text-grey-600">
            Configure default phase-to-direction mappings for your agency. These are used to
            auto-populate approach assignments when editing phases in the Bulk Phase editor.
          </p>
          {!agency?.agencyId && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>No agency configured. Go to <strong>Agency Info</strong> to set an Agency ID first.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Direction Standard */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-grey-800">Phase Direction Standard</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetToNema}
              className="h-7 text-xs border-grey-200 text-grey-600 hover:bg-grey-100"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset to NEMA Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs text-grey-500 mb-4">
            Enter phase numbers (1–8) for each direction. Use commas for multiple phases (e.g., <code className="bg-grey-100 px-1 rounded">2, 6</code>).
            Leave blank if not applicable.
          </p>

          {/* Grid header */}
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div className="text-xs font-medium text-grey-600">Direction</div>
            <div className="text-xs font-medium text-grey-600 text-center">Through Phases</div>
            <div className="text-xs font-medium text-grey-600 text-center">Left Turn Phases</div>
          </div>

          {/* Grid rows */}
          <div className="space-y-2">
            {DIRECTIONS.map(({ key, label, abbr }) => (
              <div key={key} className="grid grid-cols-3 gap-3 items-center">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                    {abbr.slice(0, 2)}
                  </span>
                  <span className="text-xs text-grey-700">{label}</span>
                </div>
                <div>
                  <Input
                    value={formState[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={formatPhaseNumbers(NEMA_DEFAULTS[key]) || '—'}
                    className="h-7 text-xs text-center"
                  />
                </div>
                <div>
                  <Input
                    value={formState[`${key}_left` as FieldKey]}
                    onChange={(e) => handleFieldChange(`${key}_left` as FieldKey, e.target.value)}
                    placeholder={formatPhaseNumbers(NEMA_DEFAULTS[`${key}_left` as keyof PhaseDirectionStandard]) || '—'}
                    className="h-7 text-xs text-center"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* NEMA reference legend */}
          <div className="mt-4 p-3 rounded-md bg-grey-50 border border-grey-200">
            <p className="text-xs font-medium text-grey-600 mb-2">NEMA Reference</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-grey-500">
              <span>Phase 2 → EB Through</span>
              <span>Phase 5 → EB Left</span>
              <span>Phase 4 → NB Through</span>
              <span>Phase 7 → NB Left</span>
              <span>Phase 6 → WB Through</span>
              <span>Phase 1 → WB Left</span>
              <span>Phase 8 → SB Through</span>
              <span>Phase 3 → SB Left</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Phase Count */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          <CardTitle className="text-sm font-semibold text-grey-800">Default Phase Count</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs text-grey-500 mb-3">
            Used as the initial phase count when auto-assigning phases in the Bulk Phase editor.
          </p>
          <div className="flex gap-2">
            {PHASE_COUNT_OPTIONS.map((count) => (
              <Button
                key={count}
                variant={defaultPhaseCount === count ? "default" : "outline"}
                size="sm"
                onClick={() => handlePhaseCountChange(count)}
                className={`h-9 w-12 text-sm font-semibold ${defaultPhaseCount === count
                  ? "bg-primary-600 hover:bg-primary-700 text-white"
                  : "border-grey-200 text-grey-700 hover:bg-grey-100"
                  }`}
              >
                {count}
              </Button>
            ))}
          </div>
          <p className="text-xs text-grey-400 mt-2">
            {defaultPhaseCount === 8 && "8 phases: full 4-approach intersection with protected lefts"}
            {defaultPhaseCount === 6 && "6 phases: 4-approach with 2 protected lefts"}
            {defaultPhaseCount === 4 && "4 phases: 4-approach through movements only"}
            {defaultPhaseCount === 2 && "2 phases: simple 2-approach intersection"}
          </p>
        </CardContent>
      </Card>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-700">{err}</p>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between items-center pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={!isDirty}
          className="h-8 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Cancel Changes
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty}
          className="h-8 text-xs bg-primary-600 hover:bg-primary-700"
        >
          <Save className="w-3 h-3 mr-1" />
          Save Defaults
        </Button>
      </div>
    </div>
  );
}
