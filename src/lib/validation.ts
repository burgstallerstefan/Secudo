/**
 * Input validation schemas using Zod
 */

import { z } from 'zod';

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
  role: z.enum(['Viewer', 'Editor', 'Admin']).optional(),
});

// Project
export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  norm: z.string().default('IEC 62443'),
  minRoleToView: z.enum(['any', 'viewer', 'editor', 'admin', 'private']).default('any'),
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
