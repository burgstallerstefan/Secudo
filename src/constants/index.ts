/**
 * Application Constants
 */

export const ROLES = {
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
} as const;

export const COMPONENT_TYPES = {
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  MIXED: 'Mixed',
} as const;

export const EDGE_DIRECTIONS = {
  A_TO_B: 'A_TO_B',
  B_TO_A: 'B_TO_A',
  BIDIRECTIONAL: 'BIDIRECTIONAL',
} as const;

export const DATA_CLASSES = {
  CREDENTIALS: 'Credentials',
  PERSONAL: 'PersonalData',
  SAFETY: 'SafetyRelevant',
  PRODUCTION: 'ProductionData',
  TELEMETRY: 'Telemetry',
  LOGS: 'Logs',
  IP: 'IntellectualProperty',
  CONFIG: 'Configuration',
  OTHER: 'Other',
} as const;

export const COMPONENT_DATA_ROLES = {
  STORES: 'Stores',
  PROCESSES: 'Processes',
  GENERATES: 'Generates',
  RECEIVES: 'Receives',
} as const;

export const MEASURE_PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
} as const;

export const MEASURE_STATUSES = {
  OPEN: 'Open',
  IN_PROGRESS: 'InProgress',
  DONE: 'Done',
} as const;

export const SEVERITY_LEVELS = {
  LOW: { value: 1, label: 'Minimal', color: '#22C55E' },
  LOW_MEDIUM: { value: 3, label: 'Low', color: '#84CC16' },
  MEDIUM: { value: 5, label: 'Medium', color: '#FBBF24' },
  MEDIUM_HIGH: { value: 7, label: 'High', color: '#F97316' },
  CRITICAL: { value: 10, label: 'Critical', color: '#EF4444' },
} as const;

export const RISK_LEVELS = {
  1: { min: 1, max: 20, label: 'Low', color: '#22C55E' },
  2: { min: 21, max: 50, label: 'Medium', color: '#FBBF24' },
  3: { min: 51, max: 80, label: 'High', color: '#F97316' },
  4: { min: 81, max: 100, label: 'Critical', color: '#EF4444' },
} as const;

export const MAX_NODES = 500;
export const MAX_EDGES = 1000;
export const DEBOUNCE_MS = 300;
export const AUTO_SAVE_INTERVAL_MS = 5000;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
