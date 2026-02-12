/**
 * TypeScript type definitions and interfaces
 */

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// User
export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

// Project
export interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  norm: string;
  minRoleToView: string;
  createdAt: Date;
}

// Model
export interface ModelNodeDTO {
  id: string;
  name: string;
  category: 'Component' | 'Human' | 'System';
  subtype: string | null;
  parentNodeId: string | null;
  stableId: string;
  createdAt: Date;
}

export interface ModelEdgeDTO {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  name: string | null;
  direction: 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
  protocol: string | null;
}

// Assessment
export interface AssetValueDTO {
  assetId: string;
  assetType: 'Node' | 'Edge';
  value: number;
  comment?: string;
}

export interface FindingDTO {
  id: string;
  assetId: string;
  assetName: string;
  severity: number;
  normReference: string;
  description?: string;
}

export interface MeasureDTO {
  id: string;
  findingId: string;
  title: string;
  description?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'InProgress' | 'Done';
}
