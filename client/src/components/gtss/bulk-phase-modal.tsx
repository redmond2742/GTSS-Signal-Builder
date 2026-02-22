import { useState, useMemo, useEffect, useRef } from "react";
import { usePhases } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Save, Trash2, Download, ChevronUp, ChevronDown, Wand2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getSignalDisplayName } from "@/lib/utils";
import { guessPhaseDirectionMapping, isTypicallyThroughPhase } from "@/lib/agencyDefaults";

interface PendingPhase {
  id?: string;
  phase: number;
  approachId: string;
  movementType: string;
  numOfLanes: number;
  isPedestrian: boolean;
  isOverlap: boolean;
}

interface BulkPhaseModalProps {
  onClose: () => void;
  preSelectedSignalId?: string;
}

// Phase colors by phase number
const phaseColors: Record<number, string> = {
  1: "#22c55e", // green
  2: "#3b82f6", // blue
  3: "#f97316", // orange
  4: "#8b5cf6", // purple
  5: "#ef4444", // red
  6: "#14b8a6", // teal
  7: "#eab308", // yellow
  8: "#ec4899", // pink
};

// Movement type options
const movementTypes = [
  { value: "Through", label: "Through (T)" },
  { value: "Left Turn", label: "Left Turn (L)" },
  { value: "Left Through Shared", label: "Left Through Shared (LT)" },
  { value: "Permissive Phase", label: "Permissive Phase (TL)" },
  { value: "Flashing Yellow Arrow", label: "Flashing Yellow Arrow (FYA)" },
  { value: "U-Turn", label: "U-Turn (U)" },
  { value: "Right Turn", label: "Right Turn (R)" },
  { value: "Through-Right", label: "Through-Right (TR)" },
  { value: "Pedestrian", label: "Pedestrian (PED)" },
];

// Left turn phase mapping: Through phase -> Left turn phase
const leftTurnMapping: Record<number, number> = { 2: 5, 4: 7, 6: 1, 8: 3 };

// Get cardinal direction from bearing
const getDirectionFromBearing = (bearing: number | null): string => {
  if (bearing === null) return "";
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "NB";
  if (normalized >= 22.5 && normalized < 67.5) return "NEB";
  if (normalized >= 67.5 && normalized < 112.5) return "EB";
  if (normalized >= 112.5 && normalized < 157.5) return "SEB";
  if (normalized >= 157.5 && normalized < 202.5) return "SB";
  if (normalized >= 202.5 && normalized < 247.5) return "SWB";
  if (normalized >= 247.5 && normalized < 292.5) return "WB";
  return "NWB";
};

// SVG Phase Diagram Component
interface PhaseDiagramProps {
  phases: PendingPhase[];
  approaches: { approachId: string; compassBearing: number | null; streetName: string }[];
  intersectionName?: string;
  svgRef?: React.RefObject<SVGSVGElement>;
}

const PhaseDiagram = ({ phases, approaches, intersectionName, svgRef }: PhaseDiagramProps) => {
  const getApproachBearing = (approachId: string): number | null => {
    const approach = approaches.find(a => a.approachId === approachId);
    return approach?.compassBearing ?? null;
  };

  const getMovementType = (movementType: string): 'straight' | 'left' | 'right' | 'uturn' | 'pedestrian' | 'leftThrough' | 'permissive' => {
    switch (movementType) {
      case 'Left Turn':
      case 'Flashing Yellow Arrow':
        return 'left';
      case 'Left Through Shared':
        return 'leftThrough';
      case 'Permissive Phase':
        return 'permissive';
      case 'Right Turn':
        return 'right';
      case 'U-Turn':
        return 'uturn';
      case 'Pedestrian':
        return 'pedestrian';
      default:
        return 'straight';
    }
  };

  // Count phases by approach and movement type to calculate offsets
  // With 180° bearing adjustment, perpAngle points LEFT, so positive = left
  const getPhaseOffset = (phase: PendingPhase, index: number): number => {
    const sameApproachPhases = phases.filter(p => p.approachId === phase.approachId);
    const moveType = getMovementType(phase.movementType);

    // Base offset by movement type - centered gap between left turn and through
    let baseOffset = 0;
    if (moveType === 'left') baseOffset = 7; // Left side of center gap
    else if (moveType === 'right') baseOffset = -18; // Far right side
    else if (moveType === 'straight') baseOffset = -7; // Right side of center gap
    else if (moveType === 'leftThrough') baseOffset = 0; // Centered (shared lane)
    else if (moveType === 'permissive') baseOffset = 0; // Centered (permissive)

    // Additional offset if multiple phases of same type on same approach
    const sameTypeCount = sameApproachPhases.filter(p => getMovementType(p.movementType) === moveType);
    const typeIndex = sameTypeCount.findIndex(p => p.phase === phase.phase);
    if (sameTypeCount.length > 1) {
      baseOffset += (typeIndex - (sameTypeCount.length - 1) / 2) * 8;
    }

    return baseOffset;
  };

  // Render pedestrian dashed line as extension of through arrow direction
  // Lines are offset to form a square pattern (don't intersect in center)
  const renderPedestrianLine = (phase: PendingPhase, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;
    if (!phase.isPedestrian && phase.movementType !== 'Pedestrian') return null;

    // Use bearing directly (no 180° adjustment) so line aligns with its phase arrow
    const angleRad = (bearing - 90) * (Math.PI / 180);

    // Perpendicular angle for offset (to create square pattern)
    const perpAngle = angleRad + Math.PI / 2;

    // Offset to the left of the arrow direction to form square edges
    const offsetDistance = 20; // Distance from center to create square
    const centerX = 150 + offsetDistance * Math.cos(perpAngle);
    const centerY = 150 + offsetDistance * Math.sin(perpAngle);

    // Draw line parallel to arrow direction, spanning across inner circle
    const lineHalfLength = 38;
    const x1 = centerX + lineHalfLength * Math.cos(angleRad);
    const y1 = centerY + lineHalfLength * Math.sin(angleRad);
    const x2 = centerX - lineHalfLength * Math.cos(angleRad);
    const y2 = centerY - lineHalfLength * Math.sin(angleRad);

    const color = phaseColors[phase.phase] || '#6b7280';

    return (
      <line
        key={`ped-${index}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.6"
      />
    );
  };

  // Render an arrow for a phase
  const renderArrow = (phase: PendingPhase, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;

    const moveType = getMovementType(phase.movementType);
    if (moveType === 'pedestrian') return null; // Pedestrians rendered separately

    const color = phaseColors[phase.phase] || '#6b7280';
    const strokeWidth = 3;

    // Add 180° to bearing - arrows show traffic coming FROM opposite direction
    const adjustedBearing = (bearing + 180) % 360;
    // Convert bearing to radians, offset by -90 so 0=North=up
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);

    // Perpendicular angle for offsets
    const perpAngle = angleRad + Math.PI / 2;

    // Base positions - arrow from outer to inner
    const outerRadius = 105;
    const innerRadius = 48;

    // Get offset for this phase
    const lateralOffset = getPhaseOffset(phase, index);

    // Apply lateral offset
    const offsetX = lateralOffset * Math.cos(perpAngle);
    const offsetY = lateralOffset * Math.sin(perpAngle);

    const startX = 150 + outerRadius * Math.cos(angleRad) + offsetX;
    const startY = 150 + outerRadius * Math.sin(angleRad) + offsetY;
    const endX = 150 + innerRadius * Math.cos(angleRad) + offsetX;
    const endY = 150 + innerRadius * Math.sin(angleRad) + offsetY;

    if (moveType === 'left') {
      // Left turn: straight line then 90° bend to the left
      const bendPoint = 0.4;
      const bendX = startX + (endX - startX) * (1 - bendPoint);
      const bendY = startY + (endY - startY) * (1 - bendPoint);

      // Left turn points LEFT (counterclockwise from travel direction)
      // When traveling toward center, left is +90 degrees (perpendicular)
      const tipLength = 22; // Longer arrow stem
      const leftPerpAngle = angleRad + Math.PI / 2; // LEFT is +90 from travel direction
      const tipX = bendX + tipLength * Math.cos(leftPerpAngle);
      const tipY = bendY + tipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          <line
            x1={startX}
            y1={startY}
            x2={bendX}
            y2={bendY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={bendX}
            y1={bendY}
            x2={tipX}
            y2={tipY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
        </g>
      );
    }

    if (moveType === 'right') {
      // Right turn: straight line then 90° bend to the right
      const bendPoint = 0.4;
      const bendX = startX + (endX - startX) * (1 - bendPoint);
      const bendY = startY + (endY - startY) * (1 - bendPoint);

      const tipLength = 22;
      const rightPerpAngle = angleRad - Math.PI / 2; // RIGHT is -90 from travel direction
      const tipX = bendX + tipLength * Math.cos(rightPerpAngle);
      const tipY = bendY + tipLength * Math.sin(rightPerpAngle);

      return (
        <g key={index}>
          <line
            x1={startX}
            y1={startY}
            x2={bendX}
            y2={bendY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={bendX}
            y1={bendY}
            x2={tipX}
            y2={tipY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
        </g>
      );
    }

    if (moveType === 'uturn') {
      // U-turn: longer stem with small perpendicular hook back
      const leftPerpAngle = angleRad + Math.PI / 2;
      const backAngle = angleRad + Math.PI; // Points back toward start

      // Longer stem - go most of the way toward center
      const stemEndX = startX + (endX - startX) * 0.7;
      const stemEndY = startY + (endY - startY) * 0.7;

      // Small perpendicular offset to the left
      const hookOffset = 12;
      const hookX = stemEndX + hookOffset * Math.cos(leftPerpAngle);
      const hookY = stemEndY + hookOffset * Math.sin(leftPerpAngle);

      // Arrow starts at hook and points outward - shifted so perpendicular connects to far side of triangle
      const arrowLength = 16;
      const arrowStartX = hookX - 12 * Math.cos(backAngle); // Shift back by arrowhead length
      const arrowStartY = hookY - 12 * Math.sin(backAngle);
      const arrowEndX = arrowStartX + arrowLength * Math.cos(backAngle);
      const arrowEndY = arrowStartY + arrowLength * Math.sin(backAngle);

      return (
        <g key={index}>
          {/* Long stem */}
          <line
            x1={startX}
            y1={startY}
            x2={stemEndX}
            y2={stemEndY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Small perpendicular hook - connects to side of arrow */}
          <line
            x1={stemEndX}
            y1={stemEndY}
            x2={arrowStartX}
            y2={arrowStartY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Arrow pointing outward toward phase label */}
          <line
            x1={arrowEndX}
            y1={arrowEndY}
            x2={arrowStartX}
            y2={arrowStartY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
        </g>
      );
    }

    if (moveType === 'leftThrough') {
      // Left Through Shared: single stem that splits into two arrowheads
      const leftPerpAngle = angleRad + Math.PI / 2;

      // Split point where the two arrowheads diverge
      const splitX = startX + (endX - startX) * 0.65;
      const splitY = startY + (endY - startY) * 0.65;

      // Through arrowhead (continues straight)
      const throughTipX = endX;
      const throughTipY = endY;

      // Left arrowhead (bends left from split point)
      const leftTipLength = 20;
      const leftTipX = splitX + leftTipLength * Math.cos(leftPerpAngle);
      const leftTipY = splitY + leftTipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          {/* Main stem */}
          <line
            x1={startX}
            y1={startY}
            x2={splitX}
            y2={splitY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Through arrowhead */}
          <line
            x1={splitX}
            y1={splitY}
            x2={throughTipX}
            y2={throughTipY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
          {/* Left arrowhead */}
          <line
            x1={splitX}
            y1={splitY}
            x2={leftTipX}
            y2={leftTipY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
        </g>
      );
    }

    if (moveType === 'permissive') {
      // Permissive Phase: through arrow with greyed out left turn
      const leftPerpAngle = angleRad + Math.PI / 2;

      // Split point where the left arrowhead diverges
      const splitX = startX + (endX - startX) * 0.65;
      const splitY = startY + (endY - startY) * 0.65;

      // Left arrowhead (bends left from split point) - greyed out
      const leftTipLength = 20;
      const leftTipX = splitX + leftTipLength * Math.cos(leftPerpAngle);
      const leftTipY = splitY + leftTipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          {/* Greyed out left arrowhead (behind) */}
          <line
            x1={splitX}
            y1={splitY}
            x2={leftTipX}
            y2={leftTipY}
            stroke="#9ca3af"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd="url(#arrowhead-grey)"
          />
          {/* Main through arrow (on top) */}
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${phase.phase})`}
          />
        </g>
      );
    }

    // Straight arrow (Through, Through-Right)
    return (
      <line
        key={index}
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        markerEnd={`url(#arrowhead-${phase.phase})`}
      />
    );
  };

  // Render phase label outside the circle with smart positioning
  const renderLabel = (phase: PendingPhase, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;

    const moveType = getMovementType(phase.movementType);
    // Add 180° to match arrow direction
    const adjustedBearing = (bearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    // Get the same offset as the arrow
    const lateralOffset = getPhaseOffset(phase, index);
    const offsetX = lateralOffset * Math.cos(perpAngle);
    const offsetY = lateralOffset * Math.sin(perpAngle);

    // Place labels outside the circle (radius 135)
    const labelRadius = 135;
    const labelX = 150 + labelRadius * Math.cos(angleRad) + offsetX;
    const labelY = 150 + labelRadius * Math.sin(angleRad) + offsetY;
    const color = phaseColors[phase.phase] || '#6b7280';

    return (
      <text
        key={`label-${index}`}
        x={labelX}
        y={labelY + 4}
        textAnchor="middle"
        fontSize="14"
        fontWeight="bold"
        fill={color}
      >
        {phase.phase}
      </text>
    );
  };

  return (
    <svg ref={svgRef} viewBox="-20 0 340 360" className="w-full h-full">
      {/* Arrowhead markers for each phase color - smaller head */}
      <defs>
        {Object.entries(phaseColors).map(([phase, color]) => (
          <marker
            key={phase}
            id={`arrowhead-${phase}`}
            markerWidth="6"
            markerHeight="5"
            refX="5"
            refY="2.5"
            orient="auto"
          >
            <polygon points="0 0, 6 2.5, 0 5" fill={color} />
          </marker>
        ))}
        {/* Grey arrowhead for permissive left turn */}
        <marker
          id="arrowhead-grey"
          markerWidth="6"
          markerHeight="5"
          refX="5"
          refY="2.5"
          orient="auto"
        >
          <polygon points="0 0, 6 2.5, 0 5" fill="#9ca3af" />
        </marker>
      </defs>

      {/* Title for export */}
      {intersectionName && (
        <text x="150" y="18" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#374151">
          {intersectionName}
        </text>
      )}

      {/* Offset everything down by 20 if title present */}
      <g transform={intersectionName ? "translate(0, 20)" : ""}>
        {/* Outer circle guide */}
        <circle cx="150" cy="150" r="115" fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />

        {/* Central intersection circle */}
        <circle cx="150" cy="150" r="42" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="2" />

        {/* Compass directions */}
        <text x="150" y="22" textAnchor="middle" fontSize="11" fill="#9ca3af">N</text>
        <text x="280" y="154" textAnchor="middle" fontSize="11" fill="#9ca3af">E</text>
        <text x="150" y="288" textAnchor="middle" fontSize="11" fill="#9ca3af">S</text>
        <text x="20" y="154" textAnchor="middle" fontSize="11" fill="#9ca3af">W</text>

        {/* Approach indicators (light gray lines showing all approaches) */}
        {approaches.map((approach, idx) => {
          if (approach.compassBearing === null) return null;
          // Add 180° to match phase arrows direction
          const adjustedBearing = (approach.compassBearing + 180) % 360;
          const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
          const outerX = 150 + 115 * Math.cos(angleRad);
          const outerY = 150 + 115 * Math.sin(angleRad);
          const innerX = 150 + 44 * Math.cos(angleRad);
          const innerY = 150 + 44 * Math.sin(angleRad);
          return (
            <line
              key={idx}
              x1={outerX}
              y1={outerY}
              x2={innerX}
              y2={innerY}
              stroke="#e5e7eb"
              strokeWidth="20"
              strokeLinecap="butt"
            />
          );
        })}

        {/* Pedestrian dashed lines */}
        {phases.filter(p => p.isPedestrian || p.movementType === 'Pedestrian').map((phase, idx) => renderPedestrianLine(phase, idx))}

        {/* Phase arrows */}
        {phases.map((phase, idx) => renderArrow(phase, idx))}

        {/* Phase number labels - outside the circle */}
        {phases.map((phase, idx) => renderLabel(phase, idx))}
      </g>
    </svg>
  );
};

const PHASE_COUNT_OPTIONS = [2, 4, 6, 8] as const;

export default function BulkPhaseModal({ onClose, preSelectedSignalId }: BulkPhaseModalProps) {
  const { signals, approaches: allApproaches, phases: existingPhases, agencyDefaults } = useGTSSStore();
  const { toast } = useToast();
  const phaseHooks = usePhases();
  const svgRef = useRef<SVGSVGElement>(null);

  const [selectedSignalId, setSelectedSignalId] = useState<string>(preSelectedSignalId || "");
  const [pendingPhases, setPendingPhases] = useState<PendingPhase[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [targetPhaseCount, setTargetPhaseCount] = useState<number>(
    agencyDefaults?.defaultPhaseCount ?? 8
  );

  // Sorting state
  type SortField = 'phase' | 'approachId' | 'movementType' | 'numOfLanes' | 'isOverlap' | 'isPedestrian';
  const [sortField, setSortField] = useState<SortField>('phase');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sorted phases
  const getSortedPhases = () => {
    return [...pendingPhases].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'phase':
          comparison = a.phase - b.phase;
          break;
        case 'approachId':
          comparison = (a.approachId || '').localeCompare(b.approachId || '');
          break;
        case 'movementType':
          comparison = a.movementType.localeCompare(b.movementType);
          break;
        case 'numOfLanes':
          comparison = a.numOfLanes - b.numOfLanes;
          break;
        case 'isOverlap':
          comparison = (a.isOverlap ? 1 : 0) - (b.isOverlap ? 1 : 0);
          break;
        case 'isPedestrian':
          comparison = (a.isPedestrian ? 1 : 0) - (b.isPedestrian ? 1 : 0);
          break;
        default:
          comparison = a.phase - b.phase;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  // Sortable header component
  const SortableHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`text-xs py-2 cursor-pointer hover:bg-grey-100 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        {children}
        <div className="flex flex-col ml-1">
          <ChevronUp
            className={`w-3 h-3 ${sortField === field && sortDirection === 'asc' ? 'text-primary-600' : 'text-grey-300'}`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === 'desc' ? 'text-primary-600' : 'text-grey-300'}`}
          />
        </div>
      </div>
    </TableHead>
  );

  // Get approaches for selected signal
  const signalApproaches = useMemo(() => {
    return allApproaches.filter(a => a.signalId === selectedSignalId);
  }, [allApproaches, selectedSignalId]);

  // Get intersection name for display
  const intersectionName = useMemo(() => {
    const signal = signals.find(s => s.signalId === selectedSignalId);
    if (!signal) return "";
    return getSignalDisplayName(signal, allApproaches);
  }, [signals, selectedSignalId, allApproaches]);

  // Download diagram as JPG - captures full diagram including labels
  const handleDownloadImage = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    // Clone the SVG and set explicit dimensions for export
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', '340');
    svgClone.setAttribute('height', '360');

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // Higher resolution
      // Match viewBox dimensions: -20 0 340 360 means width=340, height=360
      canvas.width = 340 * scale;
      canvas.height = 360 * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw SVG at scale
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 340, 360);

      // Convert to JPG and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedSignalId || 'phase-diagram'}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  // Get next available phase number
  const getNextAvailablePhaseNumber = (): number => {
    const usedPhases = new Set(pendingPhases.map(p => p.phase));
    for (let i = 1; i <= 8; i++) {
      if (!usedPhases.has(i)) return i;
    }
    return 1;
  };

  // Add a new phase row
  const handleAddPhase = () => {
    const nextPhase = getNextAvailablePhaseNumber();
    const defaultApproach = signalApproaches[0]?.approachId || "";

    setPendingPhases(prev => [
      ...prev,
      {
        phase: nextPhase,
        approachId: defaultApproach,
        movementType: "Through",
        numOfLanes: 1,
        isPedestrian: true,
        isOverlap: false,
      }
    ]);
  };

  // Update a phase field
  const handlePhaseChange = (index: number, field: keyof PendingPhase, value: any) => {
    setPendingPhases(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-set isPedestrian based on movement type
      if (field === 'movementType') {
        updated[index].isPedestrian = value === 'Through' || value === 'Through-Right';
      }

      return updated;
    });
  };

  // Delete a phase row
  const handleDeletePhase = (index: number) => {
    setPendingPhases(prev => prev.filter((_, i) => i !== index));
  };

  // Duplicate for opposite (creates left turn)
  const handleDuplicateToOpposite = (index: number) => {
    const currentPhase = pendingPhases[index];

    // Only works for Through phases 2, 4, 6, 8
    if (currentPhase.movementType !== "Through" || !leftTurnMapping[currentPhase.phase]) {
      toast({
        title: "Not Applicable",
        description: "Duplicate to opposite only works for Through phases 2, 4, 6, or 8",
        variant: "destructive",
      });
      return;
    }

    // Check if target phase already exists
    const targetPhase = leftTurnMapping[currentPhase.phase];
    if (pendingPhases.some(p => p.phase === targetPhase)) {
      toast({
        title: "Phase Exists",
        description: `Phase ${targetPhase} already exists in the list`,
        variant: "destructive",
      });
      return;
    }

    // Find the opposite approach (180 degrees away)
    const currentApproach = signalApproaches.find(a => a.approachId === currentPhase.approachId);
    let oppositeApproachId = currentPhase.approachId;

    if (currentApproach?.compassBearing !== null && currentApproach?.compassBearing !== undefined) {
      const oppositeBearing = (currentApproach.compassBearing + 180) % 360;
      // Find approach closest to opposite bearing
      let closestApproach = signalApproaches[0];
      let closestDiff = 360;

      for (const approach of signalApproaches) {
        if (approach.compassBearing !== null) {
          const diff = Math.abs(((approach.compassBearing - oppositeBearing + 180) % 360) - 180);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestApproach = approach;
          }
        }
      }
      oppositeApproachId = closestApproach?.approachId || currentPhase.approachId;
    }

    const newPhase: PendingPhase = {
      phase: targetPhase,
      approachId: oppositeApproachId,
      movementType: "Left Turn",
      numOfLanes: 1,
      isPedestrian: false,
      isOverlap: false,
    };

    setPendingPhases(prev => [...prev, newPhase]);

    toast({
      title: "Phase Duplicated",
      description: `Created Left Turn phase ${targetPhase} for opposite approach`,
    });
  };

  /**
   * Auto-assign approach IDs to phases using agency defaults.
   * - Phases with no approachId get assigned from the guess mapping.
   * - New phases needed by the mapping (not yet in pendingPhases) are created.
   * - Existing phases not in the mapping are left untouched.
   * @param overwrite - If true, overwrite even phases that already have an approachId.
   */
  const handleAutoAssign = (overwrite = false) => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    if (signalApproaches.length === 0) {
      toast({
        title: "No Approaches",
        description: "This signal has no approaches. Add approaches first in the Approaches tab.",
        variant: "destructive",
      });
      return;
    }

    // Get guess mapping: phaseNumber → approachId
    const mapping = guessPhaseDirectionMapping({
      phaseCount: targetPhaseCount,
      approaches: signalApproaches,
      agencyDefaults,
    });

    if (Object.keys(mapping).length === 0) {
      toast({
        title: "No Mapping Available",
        description: "Could not generate a mapping. Check that approaches have compass bearings set.",
        variant: "destructive",
      });
      return;
    }

    let assignedCount = 0;
    let createdCount = 0;

    setPendingPhases((prev) => {
      const updated = [...prev];

      for (const [phaseNumStr, approachId] of Object.entries(mapping)) {
        const phaseNum = Number(phaseNumStr);
        const existingIndex = updated.findIndex((p) => p.phase === phaseNum);

        if (existingIndex >= 0) {
          // Phase exists: assign only if unassigned (or overwrite=true)
          if (overwrite || !updated[existingIndex].approachId) {
            updated[existingIndex] = { ...updated[existingIndex], approachId };
            assignedCount++;
          }
        } else {
          // Phase doesn't exist: create it
          const isThrough = isTypicallyThroughPhase(phaseNum);
          updated.push({
            phase: phaseNum,
            approachId,
            movementType: isThrough ? "Through" : "Left Turn",
            numOfLanes: 1,
            isPedestrian: isThrough,
            isOverlap: false,
          });
          createdCount++;
        }
      }

      return updated;
    });

    const parts: string[] = [];
    if (assignedCount > 0) parts.push(`Assigned ${assignedCount} approach${assignedCount !== 1 ? "es" : ""}`);
    if (createdCount > 0) parts.push(`Created ${createdCount} phase${createdCount !== 1 ? "s" : ""}`);

    if (parts.length > 0) {
      toast({
        title: "Auto-Assign Complete",
        description: parts.join(", ") + " using agency defaults.",
      });
    } else {
      toast({
        title: "Nothing to Assign",
        description: "All phases already have approaches. Use 'Re-assign All' to overwrite.",
      });
    }
  };

  // Save all phases
  const handleSaveAll = async () => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    if (pendingPhases.length === 0) {
      toast({
        title: "No Phases",
        description: "Add at least one phase",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate phase numbers
    const phaseNumbers = pendingPhases.map(p => p.phase);
    const duplicates = phaseNumbers.filter((p, i) => phaseNumbers.indexOf(p) !== i);
    if (duplicates.length > 0) {
      toast({
        title: "Duplicate Phase Numbers",
        description: `Phase numbers must be unique. Duplicates: ${Array.from(new Set(duplicates)).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      let updatedCount = 0;
      let createdCount = 0;

      for (const phase of pendingPhases) {
        if (phase.id) {
          // Update existing phase
          phaseHooks.update(phase.id, {
            phase: phase.phase,
            signalId: selectedSignalId,
            movementType: phase.movementType,
            approachId: phase.approachId || null,
            numOfLanes: phase.numOfLanes,
            isPedestrian: phase.isPedestrian,
            isOverlap: phase.isOverlap,
          });
          updatedCount++;
        } else {
          // Create new phase
          phaseHooks.save({
            phase: phase.phase,
            signalId: selectedSignalId,
            movementType: phase.movementType,
            approachId: phase.approachId || null,
            numOfLanes: phase.numOfLanes,
            isPedestrian: phase.isPedestrian,
            isOverlap: phase.isOverlap,
          });
          createdCount++;
        }
      }

      const messages = [];
      if (updatedCount > 0) messages.push(`Updated ${updatedCount}`);
      if (createdCount > 0) messages.push(`Created ${createdCount}`);

      toast({
        title: "Success",
        description: `${messages.join(", ")} phase${updatedCount + createdCount > 1 ? "s" : ""}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save phases",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load existing phases or reset when signal changes
  useEffect(() => {
    if (selectedSignalId) {
      // Check if this signal has existing phases
      const signalPhases = existingPhases.filter(p => p.signalId === selectedSignalId);

      if (signalPhases.length > 0) {
        // Load existing phases for editing
        setIsEditMode(true);
        const loadedPhases: PendingPhase[] = signalPhases.map(p => ({
          id: p.id,
          phase: p.phase,
          approachId: p.approachId || "",
          movementType: p.movementType,
          numOfLanes: p.numOfLanes || 1,
          isPedestrian: p.isPedestrian || false,
          isOverlap: p.isOverlap || false,
        }));
        setPendingPhases(loadedPhases);
      } else {
        // No existing phases
        setIsEditMode(false);
        setPendingPhases([]);
      }
    } else {
      setPendingPhases([]);
      setIsEditMode(false);
    }
  }, [selectedSignalId, existingPhases]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        {/* Header with title and signal selector */}
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <span>{isEditMode ? "Edit Phases" : "Add Multiple Phases"}</span>
              {pendingPhases.length > 0 && (
                <Badge variant="secondary" className={isEditMode ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
                  {pendingPhases.length} phase{pendingPhases.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </DialogTitle>
            <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select a signal" />
              </SelectTrigger>
              <SelectContent>
                {signals.map((signal) => (
                  <SelectItem key={signal.signalId} value={signal.signalId}>
                    {getSignalDisplayName(signal, allApproaches)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedSignalId ? (
            <div className="p-8 text-center text-grey-500 text-sm">
              Select a signal to view and edit phases
            </div>
          ) : signalApproaches.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                This signal has no approaches configured. Please add approaches first to set phase directions.
              </p>
            </div>
          ) : (
            <>
              {/* Phase count + auto-assign toolbar */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-grey-50 border border-grey-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-grey-700 whitespace-nowrap">Phase count:</span>
                  <div className="flex gap-1">
                    {PHASE_COUNT_OPTIONS.map((count) => (
                      <Button
                        key={count}
                        type="button"
                        variant={targetPhaseCount === count ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTargetPhaseCount(count)}
                        className={`h-7 w-9 p-0 text-xs font-semibold ${
                          targetPhaseCount === count
                            ? "bg-primary-600 hover:bg-primary-700 text-white"
                            : "border-grey-200 text-grey-700 hover:bg-grey-100"
                        }`}
                      >
                        {count}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoAssign(false)}
                    className="h-7 text-xs border-primary-200 text-primary-700 hover:bg-primary-50 flex items-center gap-1"
                    disabled={signalApproaches.length === 0}
                    title="Auto-assign approaches to unassigned phases using agency defaults"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto-assign using Agency Defaults
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoAssign(true)}
                    className="h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 flex items-center gap-1"
                    disabled={signalApproaches.length === 0}
                    title="Re-assign all phases (overwrites existing approach assignments)"
                  >
                    <Wand2 className="w-3 h-3" />
                    Re-assign All
                  </Button>
                </div>
              </div>

              {/* Phase Diagram - centered */}
              <div className="border border-grey-200 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-grey-500">Phase Diagram</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadImage}
                    className="h-6 text-xs px-2"
                    disabled={pendingPhases.length === 0}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download JPG
                  </Button>
                </div>
                <div className="h-72 max-w-md mx-auto">
                  <PhaseDiagram
                    phases={pendingPhases}
                    approaches={signalApproaches}
                    intersectionName={intersectionName}
                    svgRef={svgRef}
                  />
                </div>
              </div>

              {/* Full-width Phases Table */}
              <div className="border border-grey-200 rounded-lg overflow-hidden">
                <div className="p-2 bg-grey-50 border-b border-grey-200 flex items-center justify-between">
                  <span className="text-xs font-medium text-grey-700">Phases</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddPhase}
                    className="h-7 text-xs"
                    disabled={signalApproaches.length === 0}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Phase
                  </Button>
                </div>

                {pendingPhases.length === 0 ? (
                  <div className="p-8 text-center text-grey-500 text-sm">
                    Click "Add Phase" to start building your phases
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-grey-50">
                          <SortableHeader field="phase" className="w-24">Phase</SortableHeader>
                          <SortableHeader field="approachId">Approach</SortableHeader>
                          <SortableHeader field="movementType">Movement</SortableHeader>
                          <SortableHeader field="numOfLanes" className="w-16">Lanes</SortableHeader>
                          <SortableHeader field="isOverlap" className="w-20 text-center">Overlap</SortableHeader>
                          <SortableHeader field="isPedestrian" className="w-20 text-center">Ped</SortableHeader>
                          <TableHead className="w-12 text-xs py-2"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSortedPhases().map((phase) => {
                          const idx = pendingPhases.findIndex(p => p.id === phase.id && p.phase === phase.phase && p.approachId === phase.approachId);
                          return (
                          <TableRow key={idx}>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: phaseColors[phase.phase] }}
                                />
                                <Input
                                  type="number"
                                  min="1"
                                  max="8"
                                  value={phase.phase}
                                  onChange={(e) => handlePhaseChange(idx, 'phase', parseInt(e.target.value) || 1)}
                                  className="h-7 w-14 text-sm"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={phase.approachId}
                                onValueChange={(value) => handlePhaseChange(idx, 'approachId', value)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {signalApproaches.map((approach) => (
                                    <SelectItem key={approach.approachId} value={approach.approachId}>
                                      {approach.approachId} - {getDirectionFromBearing(approach.compassBearing)} ({approach.compassBearing}°)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={phase.movementType}
                                onValueChange={(value) => handlePhaseChange(idx, 'movementType', value)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {movementTypes.map((mt) => (
                                    <SelectItem key={mt.value} value={mt.value}>
                                      {mt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                type="number"
                                min="1"
                                max="8"
                                value={phase.numOfLanes}
                                onChange={(e) => handlePhaseChange(idx, 'numOfLanes', parseInt(e.target.value) || 1)}
                                className="h-7 w-12 text-sm"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Checkbox
                                checked={phase.isOverlap}
                                onCheckedChange={(checked) => handlePhaseChange(idx, 'isOverlap', Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Checkbox
                                checked={phase.isPedestrian}
                                onCheckedChange={(checked) => handlePhaseChange(idx, 'isPedestrian', Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeletePhase(idx)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                title="Delete phase"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-grey-200">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!selectedSignalId || pendingPhases.length === 0 || isProcessing}
              className="bg-primary-600 hover:bg-primary-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isProcessing
                ? "Saving..."
                : isEditMode
                  ? `Save ${pendingPhases.length} Phase${pendingPhases.length !== 1 ? "s" : ""}`
                  : `Create ${pendingPhases.length} Phase${pendingPhases.length !== 1 ? "s" : ""}`
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
