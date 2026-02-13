/**
 * Input validation schemas using Zod
 */

import { z } from 'zod';
import { PROJECT_NORMS } from '@/lib/project-norm';

const projectInviteRoleSchema = z
  .enum(['User', 'Admin', 'Viewer', 'Editor'])
  .transform((role) => (role === 'Admin' ? 'Admin' : 'User'));

const projectInviteUserSchema = z.object({
  userId: z.string().min(1),
  role: projectInviteRoleSchema.default('User'),
});

const projectInviteGroupSchema = z.object({
  groupId: z.string().min(1),
  role: projectInviteRoleSchema.default('User'),
});

// Auth
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  role: z.enum(['User', 'Admin']).optional(),
});

// Project
export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  norm: z.string().optional(),
  norms: z.array(z.enum(PROJECT_NORMS)).optional(),
  invitedUsers: z.array(projectInviteUserSchema).optional(),
  invitedGroups: z.array(projectInviteGroupSchema).optional(),
  invitedUserIds: z.array(z.string().min(1)).optional(),
  invitedGroupIds: z.array(z.string().min(1)).optional(),
  minRoleToView: z.enum(['any', 'user', 'admin', 'private', 'viewer', 'editor']).optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// Model Node
export const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['Container', 'Component']).default('Component'),
  parentNodeId: z.string().min(1).nullable().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const updateNodeSchema = createNodeSchema.partial();

// Model Edge
export const createEdgeSchema = z.object({
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  name: z.string().optional(),
  direction: z.enum(['A_TO_B', 'B_TO_A', 'BIDIRECTIONAL']).default('A_TO_B'),
  protocol: z.string().optional(),
  description: z.string().optional(),
});

// Data Object
export const createDataObjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  dataClass: z.enum([
    'Credentials',
    'PersonalData',
    'SafetyRelevant',
    'ProductionData',
    'Telemetry',
    'Logs',
    'IntellectualProperty',
    'Configuration',
    'Other',
  ]),
  confidentiality: z.number().min(1).max(10).default(5),
  integrity: z.number().min(1).max(10).default(5),
  availability: z.number().min(1).max(10).default(5),
  tags: z.string().optional(),
});

// Answer
const isValidFulfillmentAnswerValue = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === 'N/A') {
    return true;
  }
  return /^(10|[0-9])$/.test(trimmed);
};

const normalizeFulfillmentAnswerValue = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === 'N/A') {
    return 'N/A';
  }
  return String(Number.parseInt(trimmed, 10));
};

export const answerSchema = z.object({
  questionId: z.string().min(1),
  answerValue: z
    .string()
    .refine(isValidFulfillmentAnswerValue, {
      message: 'answerValue must be a number from 0 to 10 or N/A',
    })
    .transform(normalizeFulfillmentAnswerValue),
  targetType: z.enum(['Component', 'Edge', 'DataObject', 'None']).optional(),
  targetId: z.string().optional(),
  comment: z.string().optional(),
});
