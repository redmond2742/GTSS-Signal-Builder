export * as schema from "./schema/public";
// Drizzle table definitions, kept separate from the public Zod schema for server-side use (e.g. server/db.ts).
export * as dbSchema from "./schema/schema";
export {
  bearingToCardinal,
  DEFAULT_AGENCY_DEFAULTS,
  DEFAULT_PHASE_COUNT,
  guessPhaseDirectionMapping,
  isCoordinationEnabled,
  isDemoEnabled,
  isMapScrollZoomEnabled,
  isTypicallyThroughPhase,
  MAX_PHASE_NUMBER,
  MIN_PHASE_NUMBER,
  NEMA_DEFAULTS,
  PHASE_COUNT_OPTIONS,
  sanitizePhaseDirectionStandard,
  validatePhaseDirectionStandard,
} from "./src/agencyDefaults";
export type {
  AgencyDefaults,
  CardinalDirection,
  MapScrollWheelMode,
  PhaseDirectionStandard,
} from "./src/agencyDefaults";
export {
  generateProceduralIntersection,
  getAllDemoIntersections,
  PRESET_DEMO_INTERSECTIONS,
} from "./src/demoIntersections";
export type { DemoIntersection, ProceduralGeneratorOptions } from "./src/demoIntersections";
export {
  DEFAULT_DETECTOR_LENGTH,
  DEFAULT_STOPBAR_SETBACK_DISTANCE,
  MIN_DETECTOR_LENGTH,
  MIN_STOPBAR_SETBACK_DISTANCE,
  POSTED_SPEED_LIMITS,
} from "./src/fieldDefaults";
export { evaluateGTSSCompleteness } from "./src/gtssValidation";
export type { ValidationResult, ValidationSummary } from "./src/gtssValidation";
export {
  flattenLibraryEntries,
  getLibrarySourceUrls,
  resolveLibraryResourceUrl,
} from "./src/library";
export type { LibraryBounds, LibraryEntry, LibrarySource } from "./src/library";
export { isLhtForSignalId, isMetricForSignalId } from "./src/localStorage/agency-units";
export { clearAllData } from "./src/localStorage/clearAll";
// --- Coordination (experimental) -----------------------------------------
export {
  COORDINATION_ENTITIES,
  COORDINATION_STORAGE_KEYS,
  clearAllCoordination,
  detectCoordinationFile,
  readAllCoordination,
  renameSignalInCoordination,
} from "./src/localStorage/coordination/entities";
export type { SignalRenameReport } from "./src/localStorage/coordination/entities";
export type {
  Entity as CoordinationEntity,
  RowSignalChange,
  SignalMoveReport,
} from "./src/localStorage/coordination/factory";
export {
  applyCorridorMove,
  applyCorridorRemoval,
  moveCorridorSignal,
  removeCorridorSignal,
  moveInList,
  sortBySequence,
} from "./src/localStorage/coordination/corridor-order";
export {
  alignDaySchedule,
  DAY_MINUTES,
  dayTypesFor,
  describeDayType,
  effectiveSegments,
  expandEntry,
  formatClock,
  isFreePattern,
  parseClock,
  scheduleEntriesForCorridor,
} from "./src/localStorage/coordination/schedule";
export type {
  AlignedSegment,
  DayAlignment,
  DayTypeInfo,
  ScheduleBlock,
  Segment,
  SignalPatternState,
} from "./src/localStorage/coordination/schedule";
export {
  buildSequenceDiagrams,
  patternsUsingSequences,
  sequenceForPattern,
  sequenceFromNotes,
} from "./src/localStorage/coordination/phaseSequenceLayout";
export type {
  BarrierColumn,
  DiagramCell,
  SequenceDiagram,
} from "./src/localStorage/coordination/phaseSequenceLayout";
export {
  approachMetres,
  cumulativeTravel,
  greenAt,
  orientStops,
  simplifyPolyline,
  simulateTrajectories,
} from "./src/localStorage/coordination/trajectories";
export type {
  Trajectory,
  TrajectoryDirection,
  TrajectoryMode,
  TrajectoryOptions,
  TrajectoryStop,
} from "./src/localStorage/coordination/trajectories";
export {
  emptyOffsetHistory,
  MAX_OFFSET_HISTORY,
  OFFSET_COALESCE_MS,
  recordOffsetEdit,
  redoOffsetEdit,
  undoOffsetEdit,
} from "./src/localStorage/coordination/offsetHistory";
export type {
  HistoryStep,
  OffsetEdit,
  OffsetHistory,
} from "./src/localStorage/coordination/offsetHistory";
export {
  opposingPhaseNumber,
  opposingWindow,
  phaseWindow,
} from "./src/localStorage/coordination/opposingPhase";
export type {
  OpposingInput,
  OpposingWindow,
  PhaseWindow,
} from "./src/localStorage/coordination/opposingPhase";
export {
  approachSpeedFor,
  baseStreetName,
  directionBearing,
  intersectionStreetNames,
  leftPhaseFor,
  nemaSameDirectionLeft,
  reverseDirection,
  throughApproachFor,
  throughPhaseFor,
} from "./src/localStorage/coordination/gtssLink";
export type { GtssLinkData } from "./src/localStorage/coordination/gtssLink";
export { progressionBand, resolveCorridorSpeeds } from "./src/localStorage/coordination/bandwidth";
export type {
  ProgressionBand,
  ResolvedSpeed,
  SpeedSource,
} from "./src/localStorage/coordination/bandwidth";
export {
  applyBuild,
  orderAlongBearing,
  planAddSignal,
  planCorridor,
  scheduleIdsFor,
  splitFromTimings,
  standardPhaseSequence,
} from "./src/localStorage/coordination/corridorBuilder";
export type {
  BuildResult,
  CorridorPlan,
  GtssBuildData,
  PatternPlan,
  SchedulePlan,
  SignalPlan,
} from "./src/localStorage/coordination/corridorBuilder";
export {
  OFFSET_REFERENCES,
  offsetReferenceFor,
  parseOffsetReference,
  setPatternOffsetReference,
  splitStartShift,
  undoReferenceChange,
} from "./src/localStorage/coordination/offsetReference";
export type {
  OffsetReference,
  OffsetReferenceSource,
  ReferenceChange,
} from "./src/localStorage/coordination/offsetReference";
export {
  apportion,
  fitSplitsToCycle,
  setSignalsCycle,
  undoCycleChange,
} from "./src/localStorage/coordination/fitSplits";
export type { CycleChange, FitResult } from "./src/localStorage/coordination/fitSplits";
export { ringSplitTotals } from "./src/localStorage/coordination/splitTotals";
export {
  blocksFromSlots,
  clockText,
  normaliseBlocks,
  scheduleRowsFor,
  WEEKLY_DAY_TYPES,
} from "./src/localStorage/coordination/scheduleBuilder";
export type { TimeBlock } from "./src/localStorage/coordination/scheduleBuilder";
export { emptyCoordinationRows, identityOf } from "./src/localStorage/coordination/rows";
export type {
  CoordinationFlags,
  CoordinationKey,
  CoordinationPlan,
  CoordinationRows,
  Corridor,
  CorridorSignal,
  ParsedCoordination,
  Pattern,
  PatternSignal,
  PhaseSequenceEntry,
  ScheduleEntry,
  Split,
} from "./src/localStorage/coordination/rows";
export { resolveCoordinationScope, UNSCOPED } from "./src/localStorage/coordination/scope";
export type { CoordinationScope } from "./src/localStorage/coordination/scope";
export { summarizeIssues, validateCoordination } from "./src/localStorage/coordination/validate";
export type {
  CoordinationIssue,
  CoordinationIssueLevel,
} from "./src/localStorage/coordination/validate";
export { isStorageReadOnly, setStorageReadOnly } from "./src/localStorage/write-guard";
export {
  crosswalkLengthCode,
  generateAgenciesCSV,
  generateAgencyCSV,
  generateApproachesCSV,
  generateBasicTimingsCSV,
  generateDetectionCSV,
  generatePhasesCSV,
  generateSignalsCSV,
} from "./src/localStorage/csv-export";
export {
  exportAsIndividualFiles,
  exportAsZip,
  exportCoordinationAsZip,
  exportData,
} from "./src/localStorage/exports";
export { importData } from "./src/localStorage/imports";
export {
  parseApproachesTXT,
  parseBasicTimingsTXT,
  parseDetectorsTXT,
  parsePhasesTXT,
  parseSignalsTXT,
} from "./src/localStorage/parsers";
export { parseAgenciesTXT, parseAgencyTXT } from "./src/localStorage/storage/agencies";
export {
  convertAgencyUnits,
  useAgencies,
  useAgencyDefaults,
  useApproaches,
  useBasicTimings,
  useDetectors,
  useExport,
  useImportData,
  useLoadFromStorage,
  useMapScrollZoom,
  usePhases,
  useSignals,
} from "./src/localStorageHooks";
export { downloadSvgAsJpg, phaseDiagramFileName } from "./src/svg-export";
export {
  getDerivedStreetNames,
  getSignalDisplayName,
  handleColumnMajorTab,
  naturalCompare,
  suggestStreetNameForApproach,
} from "./src/utils";
export { useGTSSStore } from "./store/gtss-store";
