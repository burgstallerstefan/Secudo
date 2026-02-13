import { z } from 'zod';

type NodeType = 'System' | 'Component' | 'Human';
type EdgeDirection = 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
type DataClass =
  | 'Credentials'
  | 'PersonalData'
  | 'SafetyRelevant'
  | 'ProductionData'
  | 'Telemetry'
  | 'Logs'
  | 'IntellectualProperty'
  | 'Configuration'
  | 'Other';
type ComponentDataRole = 'Stores' | 'Processes' | 'Generates' | 'Receives';
type EdgeDataFlowDirection = 'SourceToTarget' | 'TargetToSource' | 'Bidirectional';
type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

export type AIProvider = 'ollama' | 'fallback';

interface ParsedComponent {
  id: string;
  label: string;
  type: NodeType;
  parentId?: string;
  description?: string;
}

interface ParsedConnection {
  id: string;
  from: string;
  to: string;
  direction: EdgeDirection;
  name?: string;
  protocol?: string;
  description?: string;
}

interface ParsedDataObject {
  id: string;
  name: string;
  dataClass: DataClass;
  description?: string;
}

interface ParsedComponentData {
  nodeId: string;
  dataObjectId: string;
  role: ComponentDataRole;
}

interface ParsedEdgeDataFlow {
  edgeId: string;
  dataObjectId: string;
  direction: EdgeDataFlowDirection;
}

interface ParsedDataTransfer {
  fromNodeId: string;
  toNodeId: string;
  dataName: string;
  direction: EdgeDataFlowDirection;
}

export interface ModelGenerationResult {
  success: boolean;
  nodes: ParsedComponent[];
  edges: ParsedConnection[];
  dataObjects: ParsedDataObject[];
  componentData: ParsedComponentData[];
  edgeDataFlows: ParsedEdgeDataFlow[];
  provider?: AIProvider;
  model?: string;
  fallbackUsed?: boolean;
  warning?: string;
  error?: string;
}

export interface FindingRecommendationInput {
  key: string;
  questionText: string;
  normReference: string;
  assetType: 'Node' | 'Edge';
  assetName: string;
  answerComment?: string | null;
}

export interface FindingRecommendation {
  key: string;
  severity: number;
  findingDescription: string;
  measureTitle: string;
  measureDescription: string;
  priority: Priority;
}

export interface FindingRecommendationResult {
  suggestions: FindingRecommendation[];
  provider: AIProvider;
  model?: string;
  fallbackUsed: boolean;
  warning?: string;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
  error?: string;
}

interface OllamaPullResponse {
  status?: string;
  error?: string;
}

const MODEL_GENERATION_SCHEMA = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(120),
        type: z.enum(['System', 'Container', 'Component', 'Human']),
        parentId: z.string().min(1).max(64).nullish(),
      })
    )
    .min(1)
    .max(40),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(64).optional(),
        from: z.string().min(1).max(64),
        to: z.string().min(1).max(64),
        direction: z.enum(['A_TO_B', 'B_TO_A', 'BIDIRECTIONAL']).optional(),
        name: z.string().min(1).max(120).optional(),
        protocol: z.string().min(1).max(120).optional(),
      })
    )
    .max(80)
    .default([]),
  dataObjects: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        dataClass: z
          .enum([
            'Credentials',
            'PersonalData',
            'SafetyRelevant',
            'ProductionData',
            'Telemetry',
            'Logs',
            'IntellectualProperty',
            'Configuration',
            'Other',
          ])
          .optional(),
        description: z.string().max(500).optional(),
      })
    )
    .max(80)
    .default([]),
  componentData: z
    .array(
      z.object({
        nodeId: z.string().min(1).max(64),
        dataObjectId: z.string().min(1).max(64),
        role: z.enum(['Stores', 'Processes', 'Generates', 'Receives']).optional(),
      })
    )
    .max(200)
    .default([]),
  edgeDataFlows: z
    .array(
      z.object({
        edgeId: z.string().min(1).max(64),
        dataObjectId: z.string().min(1).max(64),
        direction: z.enum(['SourceToTarget', 'TargetToSource', 'Bidirectional']).optional(),
      })
    )
    .max(200)
    .default([]),
});

const FINDING_RECOMMENDATION_SCHEMA = z.object({
  suggestions: z
    .array(
      z.object({
        key: z.string().min(1).max(128),
        severity: z.number().int().min(1).max(10),
        findingDescription: z.string().min(1).max(1400),
        measureTitle: z.string().min(1).max(200),
        measureDescription: z.string().min(1).max(1800),
        priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
      })
    )
    .max(200),
});

const OLLAMA_BASE_URL = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
const OLLAMA_TIMEOUT_MS = parseInteger(process.env.OLLAMA_TIMEOUT_MS, 90_000, 15_000, 300_000);
const OLLAMA_TEMPERATURE = parseFloatInRange(process.env.OLLAMA_TEMPERATURE, 0.2, 0, 1);
const OLLAMA_NUM_PREDICT = parseInteger(process.env.OLLAMA_NUM_PREDICT, 1600, 256, 8192);
const OLLAMA_RETRY_COUNT = parseInteger(process.env.OLLAMA_RETRY_COUNT, 1, 0, 3);
const OLLAMA_STATUS_CACHE_TTL_MS = parseInteger(process.env.OLLAMA_STATUS_CACHE_TTL_MS, 15_000, 5_000, 120_000);

let cachedOllamaStatus: {
  expiresAt: number;
  value: OllamaRuntimeStatus;
} | null = null;

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function parseInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    return fallback;
  }
  return rounded;
}

function parseFloatInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < min || value > max) {
    return fallback;
  }
  return value;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function summarizeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `Validation error: ${error.errors.map((entry) => entry.message).join(', ')}`;
  }
  return (error as Error).message || 'Unknown error';
}

function normalizeModelName(modelName: string): string {
  return modelName.trim().toLowerCase();
}

export interface OllamaRuntimeStatus {
  baseUrl: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  availableModels: string[];
  error?: string;
  checkedAt: string;
}

export function getConfiguredOllamaBaseUrl(): string {
  return OLLAMA_BASE_URL;
}

export function getConfiguredOllamaModel(): string {
  return OLLAMA_MODEL;
}

export function clearOllamaStatusCache(): void {
  cachedOllamaStatus = null;
}

async function fetchOllamaTags(): Promise<OllamaTagsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as OllamaTagsResponse;
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOllamaRuntimeStatus(options?: {
  forceRefresh?: boolean;
}): Promise<OllamaRuntimeStatus> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && cachedOllamaStatus && cachedOllamaStatus.expiresAt > now) {
    return cachedOllamaStatus.value;
  }

  let status: OllamaRuntimeStatus;
  try {
    const payload = await fetchOllamaTags();
    const availableModels = Array.isArray(payload.models)
      ? payload.models
          .map((entry) => entry.name || entry.model || '')
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      : [];

    const normalizedConfiguredModel = normalizeModelName(OLLAMA_MODEL);
    const modelAvailable = availableModels.some((name) => normalizeModelName(name) === normalizedConfiguredModel);

    status = {
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      reachable: true,
      modelAvailable,
      availableModels,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    status = {
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      reachable: false,
      modelAvailable: false,
      availableModels: [],
      error: summarizeError(error),
      checkedAt: new Date().toISOString(),
    };
  }

  cachedOllamaStatus = {
    value: status,
    expiresAt: now + OLLAMA_STATUS_CACHE_TTL_MS,
  };

  return status;
}

export async function pullOllamaModel(modelName?: string): Promise<{
  success: boolean;
  model: string;
  status?: string;
  error?: string;
}> {
  const model = (modelName || OLLAMA_MODEL).trim();
  if (!model) {
    return {
      success: false,
      model,
      error: 'Model name is required',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS * 4);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OllamaPullResponse;
    if (!response.ok) {
      return {
        success: false,
        model,
        error: payload.error || `Ollama pull failed: HTTP ${response.status}`,
      };
    }

    clearOllamaStatusCache();
    return {
      success: true,
      model,
      status: payload.status || 'success',
    };
  } catch (error) {
    return {
      success: false,
      model,
      error: summarizeError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonFromModelContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  const candidates = [trimmed];
  const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (markdownMatch?.[1]) {
    candidates.push(markdownMatch[1].trim());
  }

  const firstObjectStart = trimmed.indexOf('{');
  const lastObjectEnd = trimmed.lastIndexOf('}');
  if (firstObjectStart >= 0 && lastObjectEnd > firstObjectStart) {
    candidates.push(trimmed.slice(firstObjectStart, lastObjectEnd + 1));
  }

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw new Error(`LLM response was not valid JSON: ${lastError?.message || 'parse failure'}`);
}

async function callOllamaChat(messages: OllamaMessage[]): Promise<{ content: string; model: string }> {
  const status = await getOllamaRuntimeStatus();
  if (!status.reachable) {
    throw new Error(
      `Ollama is not reachable at ${status.baseUrl}. ${status.error || 'Check container/service availability.'}`
    );
  }

  if (!status.modelAvailable) {
    const pullResult = await pullOllamaModel(status.model);
    if (!pullResult.success) {
      throw new Error(
        pullResult.error ||
          `Configured Ollama model "${status.model}" is not installed and automatic pull failed.`
      );
    }

    const refreshedStatus = await getOllamaRuntimeStatus({ forceRefresh: true });
    if (!refreshedStatus.modelAvailable) {
      throw new Error(
        `Configured Ollama model "${refreshedStatus.model}" is still unavailable after pull.`
      );
    }
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= OLLAMA_RETRY_COUNT) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: OLLAMA_TEMPERATURE,
            num_predict: OLLAMA_NUM_PREDICT,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;
      if (!response.ok) {
        const remoteError = payload.error || `HTTP ${response.status}`;
        throw new Error(`Ollama chat request failed: ${remoteError}`);
      }

      const content = payload.message?.content?.trim();
      if (!content) {
        throw new Error('Ollama returned an empty chat response');
      }

      return {
        content,
        model: payload.model || OLLAMA_MODEL,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt >= OLLAMA_RETRY_COUNT) {
        break;
      }
      await wait(500 * (attempt + 1));
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError?.message || 'Ollama call failed');
}

async function callOllamaJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<{ data: T; model: string }> {
  const response = await callOllamaChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  const parsedJson = parseJsonFromModelContent(response.content);
  const data = schema.parse(parsedJson);
  return {
    data,
    model: response.model,
  };
}

function normalizeGeneratedModel(raw: z.infer<typeof MODEL_GENERATION_SCHEMA>): {
  nodes: ParsedComponent[];
  edges: ParsedConnection[];
  dataObjects: ParsedDataObject[];
  componentData: ParsedComponentData[];
  edgeDataFlows: ParsedEdgeDataFlow[];
} {
  const sanitizeId = (value: string | undefined, fallbackPrefix: string, index: number): string => {
    const normalized = (value || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '')
      .slice(0, 64);
    return normalized || `${fallbackPrefix}_${index}`;
  };

  const normalizeLookupKey = (value: string): string => {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  };

  const ensureUniqueId = (candidate: string, seen: Set<string>, fallbackPrefix: string, index: number): string => {
    const base = candidate.slice(0, 64) || `${fallbackPrefix}_${index}`;
    let unique = base;
    let suffix = 2;
    while (seen.has(unique)) {
      const suffixText = `_${suffix}`;
      unique = `${base.slice(0, Math.max(1, 64 - suffixText.length))}${suffixText}`;
      suffix += 1;
    }
    seen.add(unique);
    return unique;
  };

  const inferDataClass = (name: string, description?: string): DataClass => {
    const lookup = `${name} ${description || ''}`.toLowerCase();
    if (/\b(credential|password|secret|token|certificate|cert|key)\b/.test(lookup)) {
      return 'Credentials';
    }
    if (/\b(personal|pii|customer|employee|user profile|identity)\b/.test(lookup)) {
      return 'PersonalData';
    }
    if (/\b(safety|alarm|emergency|trip|interlock)\b/.test(lookup)) {
      return 'SafetyRelevant';
    }
    if (/\b(production|batch|recipe|manufacturing|setpoint)\b/.test(lookup)) {
      return 'ProductionData';
    }
    if (/\b(telemetry|sensor|metric|measurement|timeseries)\b/.test(lookup)) {
      return 'Telemetry';
    }
    if (/\b(log|audit|trace|event)\b/.test(lookup)) {
      return 'Logs';
    }
    if (/\b(intellectual|design|cad|source code|formula|blueprint)\b/.test(lookup)) {
      return 'IntellectualProperty';
    }
    if (/\b(config|configuration|setting|parameter)\b/.test(lookup)) {
      return 'Configuration';
    }
    return 'Other';
  };

  const resolveMappedId = (reference: string, map: Map<string, string>): string | undefined => {
    const trimmed = reference.trim();
    if (!trimmed) {
      return undefined;
    }
    return map.get(trimmed) || map.get(normalizeLookupKey(trimmed));
  };

  const idMap = new Map<string, string>();
  const nodeLabelMap = new Map<string, string>();
  const nodeSeen = new Set<string>();
  const nodes: ParsedComponent[] = [];

  raw.nodes.forEach((node, index) => {
    const normalizedId = sanitizeId(node.id, 'node', index + 1);
    const uniqueId = ensureUniqueId(normalizedId, nodeSeen, 'node', index + 1);

    const mappedType: NodeType =
      node.type === 'Container'
        ? 'System'
        : node.type === 'Human'
          ? 'Human'
          : node.type === 'System'
            ? 'System'
            : 'Component';

    nodes.push({
      id: uniqueId,
      label: node.label.trim().slice(0, 120) || `Node ${index + 1}`,
      type: mappedType,
      parentId: undefined,
    });
    idMap.set(node.id, uniqueId);
    idMap.set(normalizeLookupKey(node.id), uniqueId);
    nodeLabelMap.set(normalizeLookupKey(node.label), uniqueId);
  });

  raw.nodes.forEach((node, index) => {
    const currentNode = nodes[index];
    if (!currentNode) {
      return;
    }

    const rawParentId = node.parentId?.trim();
    if (!rawParentId) {
      return;
    }

    const mappedParentId =
      resolveMappedId(rawParentId, idMap) || nodeLabelMap.get(normalizeLookupKey(rawParentId)) || undefined;
    if (!mappedParentId || mappedParentId === currentNode.id) {
      return;
    }

    const parentNode = nodes.find((candidate) => candidate.id === mappedParentId);
    if (!parentNode || parentNode.type !== 'System') {
      return;
    }

    currentNode.parentId = mappedParentId;
  });

  const systemNodes = nodes.filter((node) => node.type === 'System');
  if (systemNodes.length === 1) {
    const defaultContainerId = systemNodes[0].id;
    nodes.forEach((node) => {
      if (node.type === 'Component' && !node.parentId) {
        node.parentId = defaultContainerId;
      }
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const validNodeIds = new Set(nodeById.keys());
  const edgeIdMap = new Map<string, string>();
  const edgeSeen = new Set<string>();
  const edgeIdSeen = new Set<string>();
  const edges: ParsedConnection[] = [];

  raw.edges.forEach((edge, index) => {
    const mappedFrom = resolveMappedId(edge.from, idMap) || nodeLabelMap.get(normalizeLookupKey(edge.from)) || edge.from;
    const mappedTo = resolveMappedId(edge.to, idMap) || nodeLabelMap.get(normalizeLookupKey(edge.to)) || edge.to;
    if (!validNodeIds.has(mappedFrom) || !validNodeIds.has(mappedTo) || mappedFrom === mappedTo) {
      return;
    }
    const direction: EdgeDirection = edge.direction || 'A_TO_B';
    const protocol = edge.protocol?.trim().slice(0, 120) || undefined;
    const edgeKey = `${mappedFrom}:${mappedTo}:${direction}:${protocol || ''}`;
    if (edgeSeen.has(edgeKey)) {
      return;
    }
    edgeSeen.add(edgeKey);
    const requestedId = sanitizeId(edge.id || `${mappedFrom}_${mappedTo}`, 'edge', index + 1);
    const normalizedEdgeId = ensureUniqueId(requestedId, edgeIdSeen, 'edge', index + 1);
    const name = edge.name?.trim().slice(0, 120) || undefined;
    edges.push({
      id: normalizedEdgeId,
      from: mappedFrom,
      to: mappedTo,
      direction,
      name,
      protocol,
    });
    if (edge.id) {
      edgeIdMap.set(edge.id, normalizedEdgeId);
      edgeIdMap.set(normalizeLookupKey(edge.id), normalizedEdgeId);
    }
    edgeIdMap.set(`${mappedFrom}:${mappedTo}`, normalizedEdgeId);
    edgeIdMap.set(`${mappedFrom}:${mappedTo}:${direction}`, normalizedEdgeId);
    edgeIdMap.set(normalizeLookupKey(`${mappedFrom}:${mappedTo}`), normalizedEdgeId);
    edgeIdMap.set(normalizeLookupKey(`${mappedFrom}:${mappedTo}:${direction}`), normalizedEdgeId);
    if (direction === 'BIDIRECTIONAL') {
      edgeIdMap.set(`${mappedTo}:${mappedFrom}`, normalizedEdgeId);
      edgeIdMap.set(`${mappedTo}:${mappedFrom}:${direction}`, normalizedEdgeId);
      edgeIdMap.set(normalizeLookupKey(`${mappedTo}:${mappedFrom}`), normalizedEdgeId);
      edgeIdMap.set(normalizeLookupKey(`${mappedTo}:${mappedFrom}:${direction}`), normalizedEdgeId);
    }
  });

  const dataObjectIdMap = new Map<string, string>();
  const dataObjectNameMap = new Map<string, string>();
  const dataObjectSeen = new Set<string>();
  const dataObjects: ParsedDataObject[] = [];
  raw.dataObjects.forEach((dataObject, index) => {
    const requestedId = sanitizeId(dataObject.id, 'data', index + 1);
    const normalizedId = ensureUniqueId(requestedId, dataObjectSeen, 'data', index + 1);
    const normalizedName = dataObject.name.trim().slice(0, 120) || `Data Object ${index + 1}`;
    const normalizedDescription = dataObject.description?.trim().slice(0, 500) || undefined;
    const normalizedDataClass = dataObject.dataClass || inferDataClass(normalizedName, normalizedDescription);
    dataObjects.push({
      id: normalizedId,
      name: normalizedName,
      dataClass: normalizedDataClass,
      description: normalizedDescription,
    });
    dataObjectIdMap.set(dataObject.id, normalizedId);
    dataObjectIdMap.set(normalizeLookupKey(dataObject.id), normalizedId);
    dataObjectNameMap.set(normalizeLookupKey(normalizedName), normalizedId);
  });

  const validDataObjectIds = new Set(dataObjects.map((dataObject) => dataObject.id));
  const componentDataSeen = new Set<string>();
  const componentData: ParsedComponentData[] = [];
  raw.componentData.forEach((mapping) => {
    const mappedNodeId =
      resolveMappedId(mapping.nodeId, idMap) || nodeLabelMap.get(normalizeLookupKey(mapping.nodeId)) || mapping.nodeId;
    const mappedDataObjectId =
      resolveMappedId(mapping.dataObjectId, dataObjectIdMap) ||
      dataObjectNameMap.get(normalizeLookupKey(mapping.dataObjectId)) ||
      mapping.dataObjectId;

    if (!validNodeIds.has(mappedNodeId) || !validDataObjectIds.has(mappedDataObjectId)) {
      return;
    }

    const node = nodeById.get(mappedNodeId);
    if (!node || node.type === 'System') {
      return;
    }

    const dedupeKey = `${mappedNodeId}:${mappedDataObjectId}`;
    if (componentDataSeen.has(dedupeKey)) {
      return;
    }
    componentDataSeen.add(dedupeKey);

    componentData.push({
      nodeId: mappedNodeId,
      dataObjectId: mappedDataObjectId,
      role: mapping.role || 'Stores',
    });
  });

  const validEdgeIds = new Set(edges.map((edge) => edge.id));
  const edgeDataFlowSeen = new Set<string>();
  const edgeDataFlows: ParsedEdgeDataFlow[] = [];
  raw.edgeDataFlows.forEach((mapping) => {
    const mappedEdgeId = resolveMappedId(mapping.edgeId, edgeIdMap) || mapping.edgeId;
    const mappedDataObjectId =
      resolveMappedId(mapping.dataObjectId, dataObjectIdMap) ||
      dataObjectNameMap.get(normalizeLookupKey(mapping.dataObjectId)) ||
      mapping.dataObjectId;

    if (!validEdgeIds.has(mappedEdgeId) || !validDataObjectIds.has(mappedDataObjectId)) {
      return;
    }

    const dedupeKey = `${mappedEdgeId}:${mappedDataObjectId}`;
    if (edgeDataFlowSeen.has(dedupeKey)) {
      return;
    }
    edgeDataFlowSeen.add(dedupeKey);

    edgeDataFlows.push({
      edgeId: mappedEdgeId,
      dataObjectId: mappedDataObjectId,
      direction: mapping.direction || 'SourceToTarget',
    });
  });

  return { nodes, edges, dataObjects, componentData, edgeDataFlows };
}

function normalizeFindingSuggestion(item: FindingRecommendation): FindingRecommendation {
  return {
    key: item.key.trim(),
    severity: Math.max(1, Math.min(10, Math.round(item.severity))),
    findingDescription: item.findingDescription.trim().slice(0, 1400),
    measureTitle: item.measureTitle.trim().slice(0, 200),
    measureDescription: item.measureDescription.trim().slice(0, 1800),
    priority: item.priority,
  };
}

function buildFallbackFindingSuggestion(input: FindingRecommendationInput): FindingRecommendation {
  const baseSeverity = input.assetType === 'Edge' ? 7 : 6;
  const priority: Priority =
    baseSeverity >= 8 ? 'Critical' : baseSeverity >= 6 ? 'High' : baseSeverity >= 4 ? 'Medium' : 'Low';

  return {
    key: input.key,
    severity: baseSeverity,
    findingDescription: `Non-compliance with ${input.normReference}: ${input.questionText}`,
    measureTitle: `Remediate: ${input.questionText}`.slice(0, 200),
    measureDescription: `Implement and verify a control for ${input.assetName} to address ${input.normReference}.`,
    priority,
  };
}

export async function generateModelFromText(systemDescription: string): Promise<ModelGenerationResult> {
  const description = systemDescription.trim();
  if (!description) {
    return {
      success: false,
      nodes: [],
      edges: [],
      dataObjects: [],
      componentData: [],
      edgeDataFlows: [],
      provider: 'fallback',
      fallbackUsed: true,
      error: 'System description is required',
    };
  }

  try {
    const systemPrompt = [
      'You are a senior OT/ICS security architect.',
      'Convert the user text into a canonical graph model.',
      'Return ONLY valid JSON with this shape:',
      '{"nodes":[{"id":"string","label":"string","type":"System|Container|Component|Human","parentId":"node_id|null"}],"edges":[{"id":"string","from":"node_id","to":"node_id","direction":"A_TO_B|B_TO_A|BIDIRECTIONAL","name":"string","protocol":"string"}],"dataObjects":[{"id":"string","name":"string","dataClass":"Credentials|PersonalData|SafetyRelevant|ProductionData|Telemetry|Logs|IntellectualProperty|Configuration|Other","description":"string"}],"componentData":[{"nodeId":"node_id","dataObjectId":"data_object_id","role":"Stores|Processes|Generates|Receives"}],"edgeDataFlows":[{"edgeId":"edge_id","dataObjectId":"data_object_id","direction":"SourceToTarget|TargetToSource|Bidirectional"}]}',
      'Rules:',
      '- IDs must be stable machine IDs (snake_case).',
      '- Keep nodes <= 40 and edges <= 80.',
      '- Keep dataObjects <= 80 and mappings <= 200 each.',
      '- Use "System" or "Container" only for major boundaries/containers.',
      '- Use "Component" for concrete software/hardware/services.',
      '- Use "Human" only for explicit users/operators.',
      '- If a system/container encloses components, set nodes[].parentId for those components.',
      '- If the user states "X sends Y to Z", create a dataObject Y, an edge X->Z and the corresponding mappings.',
      '- componentData.nodeId must reference a non-container node.',
      '- Mapping IDs must reference defined nodes/edges/dataObjects.',
      '- Do not include explanations, markdown, or comments.',
    ].join('\n');

    const userPrompt = `System description:\n${description}`;
    const { data, model } = await callOllamaJson(systemPrompt, userPrompt, MODEL_GENERATION_SCHEMA);
    const normalized = normalizeGeneratedModel(data);
    const expectedNodes = extractComponents(description);
    const expectedTransfers = extractDataTransfers(description, expectedNodes);

    if (normalized.nodes.length === 0) {
      throw new Error('No usable nodes were returned by the AI model');
    }

    if (
      expectedNodes.length >= 2 &&
      normalized.nodes.filter((node) => node.type !== 'System').length < expectedNodes.filter((node) => node.type !== 'System').length
    ) {
      throw new Error('AI output omitted expected components from the description');
    }

    if (
      expectedTransfers.length > 0 &&
      (normalized.edges.length === 0 || normalized.dataObjects.length === 0 || normalized.edgeDataFlows.length === 0)
    ) {
      throw new Error('AI output omitted required data-flow details from the description');
    }

    return {
      success: true,
      nodes: normalized.nodes,
      edges: normalized.edges,
      dataObjects: normalized.dataObjects,
      componentData: normalized.componentData,
      edgeDataFlows: normalized.edgeDataFlows,
      provider: 'ollama',
      model,
      fallbackUsed: false,
    };
  } catch (error) {
    const nodes = extractComponents(description);
    const transfers = extractDataTransfers(description, nodes);
    const edges = extractConnections(description, nodes, transfers);
    const dataObjects = extractDataObjects(description, transfers);
    const componentData = extractComponentData(nodes, dataObjects, transfers);
    const edgeDataFlows = extractEdgeDataFlows(edges, dataObjects, transfers);

    if (nodes.length === 0) {
      return {
        success: false,
        nodes: [],
        edges: [],
        dataObjects: [],
        componentData: [],
        edgeDataFlows: [],
        provider: 'fallback',
        fallbackUsed: true,
        warning: summarizeError(error),
        error: 'No components could be extracted. Try being more specific about system components.',
      };
    }

    return {
      success: true,
      nodes,
      edges,
      dataObjects,
      componentData,
      edgeDataFlows,
      provider: 'fallback',
      fallbackUsed: true,
      warning: summarizeError(error),
    };
  }
}

export async function generateFindingRecommendations(
  inputs: FindingRecommendationInput[],
  projectNorm?: string
): Promise<FindingRecommendationResult> {
  if (inputs.length === 0) {
    return {
      suggestions: [],
      provider: 'fallback',
      fallbackUsed: false,
    };
  }

  const normalizedInputs = inputs.map((item) => ({
    key: item.key.trim(),
    questionText: item.questionText.trim().slice(0, 500),
    normReference: item.normReference.trim().slice(0, 120),
    assetType: item.assetType,
    assetName: item.assetName.trim().slice(0, 120),
    answerComment: item.answerComment?.trim().slice(0, 500) || null,
  }));

  try {
    const systemPrompt = [
      'You are a product-security and OT risk analyst.',
      'Generate actionable findings and remediation measures for failed controls.',
      'Return ONLY valid JSON with this shape:',
      '{"suggestions":[{"key":"string","severity":1-10,"findingDescription":"string","measureTitle":"string","measureDescription":"string","priority":"Low|Medium|High|Critical"}]}',
      'Rules:',
      '- Use each input key at most once.',
      '- Keep severity realistic and evidence-based.',
      '- measureTitle must be concise and implementation-oriented.',
      '- No markdown, no extra keys, no commentary.',
    ].join('\n');

    const userPrompt = JSON.stringify(
      {
        context: {
          projectNorm: projectNorm || 'IEC 62443',
          totalInputs: normalizedInputs.length,
        },
        failedControls: normalizedInputs,
      },
      null,
      2
    );

    const { data, model } = await callOllamaJson(systemPrompt, userPrompt, FINDING_RECOMMENDATION_SCHEMA);
    const allowedKeys = new Set(normalizedInputs.map((item) => item.key));
    const seenKeys = new Set<string>();
    const suggestions: FindingRecommendation[] = [];

    data.suggestions.forEach((candidate) => {
      const normalized = normalizeFindingSuggestion(candidate);
      if (!allowedKeys.has(normalized.key) || seenKeys.has(normalized.key)) {
        return;
      }
      seenKeys.add(normalized.key);
      suggestions.push(normalized);
    });

    if (suggestions.length === 0) {
      throw new Error('Ollama returned no valid recommendations');
    }

    return {
      suggestions,
      provider: 'ollama',
      model,
      fallbackUsed: false,
    };
  } catch (error) {
    return {
      suggestions: normalizedInputs.map(buildFallbackFindingSuggestion),
      provider: 'fallback',
      fallbackUsed: true,
      warning: summarizeError(error),
    };
  }
}

const normalizeNameKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^\w]/g, '');

const toMachineId = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 64);
  return normalized || fallback;
};

function extractComponents(text: string): ParsedComponent[] {
  const componentKeywords: Record<string, NodeType> = {
    server: 'System',
    workstation: 'Component',
    computer: 'Component',
    pc: 'Component',
    terminal: 'Component',
    plc: 'Component',
    gateway: 'System',
    router: 'Component',
    switch: 'Component',
    ap: 'Component',
    'access point': 'Component',
    sensor: 'Component',
    actuator: 'Component',
    hmi: 'Component',
    mmi: 'Component',
    pcss: 'Component',
    safety: 'Component',
    bendcontrol: 'Component',
    scada: 'System',
    database: 'System',
    'api server': 'System',
    'web server': 'System',
    firewall: 'Component',
    printer: 'Component',
    scanner: 'Component',
    controller: 'Component',
    module: 'Component',
    device: 'Component',
    operator: 'Human',
    engineer: 'Human',
    user: 'Human',
    admin: 'Human',
    technician: 'Human',
  };

  const preferredLabelByKey: Record<string, string> = {
    hmi: 'HMI',
    mmi: 'MMI',
    pcss: 'PCSS',
    plc: 'PLC',
    scada: 'SCADA',
    bendcontrol: 'BendControl',
  };

  const machineMatch = text.match(/\b(Maschine|Machine)\b/i);
  const containerLabel =
    machineMatch?.[0]?.trim().toLowerCase() === 'maschine'
      ? 'Maschine'
      : machineMatch
        ? 'Machine'
        : null;

  const candidates: Array<{ label: string; type: NodeType; parentLabel?: string }> = [];
  const seenCandidate = new Set<string>();
  const addCandidate = (label: string, type: NodeType, parentLabel?: string) => {
    const normalizedLabel = label
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[\-:;,.]+|[\-:;,.]+$/g, '');
    if (!normalizedLabel) {
      return;
    }
    const key = `${type}:${normalizeNameKey(normalizedLabel)}`;
    if (seenCandidate.has(key)) {
      return;
    }
    seenCandidate.add(key);
    candidates.push({ label: normalizedLabel, type, parentLabel });
  };

  if (containerLabel) {
    addCandidate(containerLabel, 'System');
  }

  const explicitListMatch = text.match(/(?:components?|komponenten)\s*[:\-]?\s*([^\n.!?]+)/i);
  const explicitComponentLabels: string[] = [];
  if (explicitListMatch?.[1]) {
    explicitListMatch[1]
      .split(/,|;|\bund\b|\band\b/gi)
      .map((entry) =>
        entry
          .trim()
          .replace(/^[\-•\d.)\s]+/, '')
          .replace(/^(und|and|mit|with|die|der|das)\s+/i, '')
          .replace(/\s+(?:die|der|das|that|which)\b.*$/i, '')
          .replace(
            /\s+(?:sendet|sends|schickt|uebermittelt|übermittelt|communicates|kommuniziert|talks)\b.*$/i,
            ''
          )
          .replace(/[\[\]{}()"]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((label) => label.length >= 2)
      .forEach((label) => {
        explicitComponentLabels.push(label);
        addCandidate(label, 'Component', containerLabel || undefined);
      });
  }

  const words = text.toLowerCase().split(/\s+/);
  const phrases = text.toLowerCase().match(/\b[a-zäöüß\s]+\b/gi) || [];

  [...words, ...phrases].forEach((phrase) => {
    const cleaned = phrase.trim().replace(/[,;:.!?]/g, '');
    const mappedType = componentKeywords[cleaned];
    if (!mappedType) {
      return;
    }

    const preferredLabel = preferredLabelByKey[cleaned];
    const label = preferredLabel || cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    const parentLabel = mappedType === 'Component' ? containerLabel || undefined : undefined;
    addCandidate(label, mappedType, parentLabel);
  });

  const numberPatterns = text.match(/(\d+)\s+([a-zäöüß]+s?)/gi) || [];
  numberPatterns.forEach((match) => {
    const [, num, item] = match.match(/(\d+)\s+([a-zäöüß]+)/i) || [];
    if (!num || !item) {
      return;
    }
    const singular = item.endsWith('s') ? item.slice(0, -1) : item;
    const mappedType = componentKeywords[singular];
    if (!mappedType || Number.parseInt(num, 10) > 8) {
      return;
    }
    const preferredLabel = preferredLabelByKey[singular];
    const label =
      Number.parseInt(num, 10) > 1
        ? `${preferredLabel || singular.charAt(0).toUpperCase() + singular.slice(1)} (${num})`
        : preferredLabel || singular.charAt(0).toUpperCase() + singular.slice(1);
    const parentLabel = mappedType === 'Component' ? containerLabel || undefined : undefined;
    addCandidate(label, mappedType, parentLabel);
  });

  if (candidates.length === 0) {
    const fallbackNames = (text.match(/\b[A-Z][A-Za-z0-9_-]{1,31}\b/g) || []).filter(
      (token) => !['Ich', 'I', 'The', 'Die', 'Der', 'Das'].includes(token)
    );
    fallbackNames.forEach((name) => addCandidate(name, 'Component', containerLabel || undefined));
  }

  const idByLabelKey = new Map<string, string>();
  const idSeen = new Set<string>();
  const nodes: ParsedComponent[] = candidates.slice(0, 30).map((candidate, index) => {
    const baseId = toMachineId(candidate.label, `node_${index + 1}`);
    let uniqueId = baseId;
    let suffix = 2;
    while (idSeen.has(uniqueId)) {
      const suffixText = `_${suffix}`;
      uniqueId = `${baseId.slice(0, Math.max(1, 64 - suffixText.length))}${suffixText}`;
      suffix += 1;
    }
    idSeen.add(uniqueId);
    idByLabelKey.set(normalizeNameKey(candidate.label), uniqueId);
    return {
      id: uniqueId,
      label: candidate.label,
      type: candidate.type,
      parentId: undefined,
    };
  });

  const singleContainerId = nodes.filter((node) => node.type === 'System').length === 1
    ? nodes.find((node) => node.type === 'System')?.id
    : undefined;

  nodes.forEach((node) => {
    const source = candidates.find((candidate) => normalizeNameKey(candidate.label) === normalizeNameKey(node.label));
    if (!source) {
      return;
    }
    if (source.parentLabel) {
      const mappedParentId = idByLabelKey.get(normalizeNameKey(source.parentLabel));
      if (mappedParentId && mappedParentId !== node.id) {
        node.parentId = mappedParentId;
      }
      return;
    }
    if (node.type === 'Component' && singleContainerId) {
      node.parentId = singleContainerId;
    }
  });

  return nodes.slice(0, 20);
}

function extractDataTransfers(text: string, nodes: ParsedComponent[]): ParsedDataTransfer[] {
  const transfers: ParsedDataTransfer[] = [];
  if (nodes.length < 2) {
    return transfers;
  }

  const nodeIdByKey = new Map<string, string>();
  nodes.forEach((node) => {
    nodeIdByKey.set(normalizeNameKey(node.label), node.id);
  });

  const resolveNodeId = (token: string): string | null => {
    const key = normalizeNameKey(token);
    if (!key) {
      return null;
    }
    const direct = nodeIdByKey.get(key);
    if (direct) {
      return direct;
    }
    for (const [labelKey, nodeId] of nodeIdByKey.entries()) {
      if (labelKey.includes(key) || key.includes(labelKey)) {
        return nodeId;
      }
    }
    return null;
  };

  const sentenceParts = text
    .replace(/\n/g, ' ')
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const tokenPattern = '[A-Za-z\\u00C4\\u00D6\\u00DC\\u00E4\\u00F6\\u00FC\\u00DF0-9_-]{2,}';
  const sendPattern = new RegExp(
    `\\b(${tokenPattern})\\b\\s+(?:sendet|sends|schickt|uebermittelt|transmits)\\s+(.+?)\\s+(?:an|zu|richtung|to|towards|nach)\\s+\\b(${tokenPattern})\\b`,
    'i'
  );
  const fromToPattern = new RegExp(
    `\\b(.+?)\\s+(?:von|from)\\s+\\b(${tokenPattern})\\b\\s+(?:an|zu|to|towards|nach|richtung)\\s+\\b(${tokenPattern})\\b`,
    'i'
  );

  const cleanDataName = (value: string): string => {
    return value
      .replace(/^(die|der|das|the|a|an)\s+/i, '')
      .replace(/^(?:verkn\S*|connection|link|fluss|flow)\s+/i, '')
      .replace(/^(?:daten?|date|data|payload|message|informationen?|information)\s+/i, '')
      .replace(/^(?:des|der|die|the)\s+/i, '')
      .replace(/[\s,;:.]+$/g, '')
      .trim();
  };

  const seen = new Set<string>();
  sentenceParts.forEach((sentence) => {
    const pushTransfer = (sourceToken: string, dataToken: string, targetToken: string) => {
      const fromNodeId = resolveNodeId(sourceToken);
      const toNodeId = resolveNodeId(targetToken);
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
        return;
      }

      const dataName = cleanDataName(dataToken);
      if (!dataName) {
        return;
      }

      const dedupeKey = `${fromNodeId}:${toNodeId}:${normalizeNameKey(dataName)}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      transfers.push({
        fromNodeId,
        toNodeId,
        dataName,
        direction: 'SourceToTarget',
      });
    };

    const sendMatch = sentence.match(sendPattern);
    if (sendMatch) {
      pushTransfer(sendMatch[1], sendMatch[2], sendMatch[3]);
      return;
    }

    const fromToMatch = sentence.match(fromToPattern);
    if (fromToMatch) {
      pushTransfer(fromToMatch[2], fromToMatch[1], fromToMatch[3]);
    }
  });

  return transfers;
}
function extractConnections(text: string, nodes: ParsedComponent[], transfers: ParsedDataTransfer[] = []): ParsedConnection[] {
  const edges: ParsedConnection[] = [];
  const seen = new Set<string>();

  if (nodes.length < 2) {
    return [];
  }

  transfers.forEach((transfer) => {
    const key = `${transfer.fromNodeId}:${transfer.toNodeId}:A_TO_B`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    edges.push({
      id: `edge_${edges.length + 1}`,
      from: transfer.fromNodeId,
      to: transfer.toNodeId,
      direction: 'A_TO_B',
      name: transfer.dataName ? `${transfer.dataName} Flow` : 'Generated Link',
    });
  });

  if (transfers.length > 0) {
    return edges.slice(0, 30);
  }

  const connectionKeywords = [
    'connect',
    'interface',
    'link',
    'communicate',
    'talk',
    'talk to',
    'connected to',
    'via',
    'through',
    'communicate with',
    'send',
    'sends',
    'sendet',
    'schickt',
    'uebermittelt',
    'übermittelt',
  ];

  const sentences = text.split(/[.!?]/);
  sentences.forEach((sentence) => {
    const sentenceLower = sentence.toLowerCase();
    const hasConnection = connectionKeywords.some((keyword) => sentenceLower.includes(keyword));
    if (!hasConnection) {
      return;
    }

    const nodeNames = nodes.map((node) => node.label.toLowerCase());
    const foundNodes: string[] = [];
    nodeNames.forEach((name) => {
      if (sentenceLower.includes(name)) {
        foundNodes.push(name);
      }
    });

    if (foundNodes.length < 2) {
      return;
    }

    for (let i = 0; i < foundNodes.length - 1; i += 1) {
      for (let j = i + 1; j < foundNodes.length; j += 1) {
        const fromNode = nodes.find((node) => node.label.toLowerCase() === foundNodes[i]);
        const toNode = nodes.find((node) => node.label.toLowerCase() === foundNodes[j]);
        if (!fromNode || !toNode) {
          continue;
        }

        const direction: EdgeDirection =
          sentenceLower.includes('bidirectional') || sentenceLower.includes('both') || sentenceLower.includes('each other')
            ? 'BIDIRECTIONAL'
            : 'A_TO_B';
        const key = `${fromNode.id}:${toNode.id}:${direction}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        edges.push({
          id: `edge_${edges.length + 1}`,
          from: fromNode.id,
          to: toNode.id,
          direction,
          name: 'Generated Link',
        });
      }
    }
  });

  if (edges.length === 0 && nodes.length > 1) {
    const hub = nodes.find((node) => node.type !== 'System') || nodes[0];
    nodes
      .filter((node) => node.id !== hub.id && node.type !== 'System')
      .forEach((node) => {
        edges.push({
          id: `edge_${edges.length + 1}`,
          from: hub.id,
          to: node.id,
          direction: 'BIDIRECTIONAL',
          name: 'Generated Link',
        });
      });
  }

  return edges.slice(0, 30);
}

function inferDataClassFromText(name: string, description?: string): DataClass {
  const lookup = `${name} ${description || ''}`.toLowerCase();
  if (/\b(credential|password|secret|token|certificate|cert|key)\b/.test(lookup)) {
    return 'Credentials';
  }
  if (/\b(personal|pii|customer|employee|user profile|identity)\b/.test(lookup)) {
    return 'PersonalData';
  }
  if (/\b(safety|alarm|emergency|trip|interlock)\b/.test(lookup)) {
    return 'SafetyRelevant';
  }
  if (/\b(production|batch|recipe|manufacturing|setpoint)\b/.test(lookup)) {
    return 'ProductionData';
  }
  if (/\b(telemetry|sensor|metric|measurement|timeseries)\b/.test(lookup)) {
    return 'Telemetry';
  }
  if (/\b(log|audit|trace|event)\b/.test(lookup)) {
    return 'Logs';
  }
  if (/\b(intellectual|design|cad|source code|formula|blueprint)\b/.test(lookup)) {
    return 'IntellectualProperty';
  }
  if (/\b(config|configuration|setting|parameter)\b/.test(lookup)) {
    return 'Configuration';
  }
  return 'Other';
}

function extractDataObjects(text: string, transfers: ParsedDataTransfer[] = []): ParsedDataObject[] {
  const normalizedText = text.toLowerCase();
  const candidates: Array<{ name: string; dataClass: DataClass }> = [];

  transfers.forEach((transfer) => {
    candidates.push({
      name: transfer.dataName,
      dataClass: inferDataClassFromText(transfer.dataName),
    });
  });

  if (/\b(credential|password|token|secret|certificate|cert)\b/.test(normalizedText)) {
    candidates.push({ name: 'Credentials', dataClass: 'Credentials' });
  }
  if (/\b(personal|pii|customer|employee|identity)\b/.test(normalizedText)) {
    candidates.push({ name: 'Personal Data', dataClass: 'PersonalData' });
  }
  if (/\b(safety|alarm|interlock|emergency)\b/.test(normalizedText)) {
    candidates.push({ name: 'Safety Signals', dataClass: 'SafetyRelevant' });
  }
  if (/\b(production|batch|recipe|setpoint|manufacturing)\b/.test(normalizedText)) {
    candidates.push({ name: 'Production Data', dataClass: 'ProductionData' });
  }
  if (/\b(telemetry|sensor|measurement|metrics|timeseries)\b/.test(normalizedText)) {
    candidates.push({ name: 'Telemetry', dataClass: 'Telemetry' });
  }
  if (/\b(log|audit|event|trace)\b/.test(normalizedText)) {
    candidates.push({ name: 'Logs', dataClass: 'Logs' });
  }
  if (/\b(configuration|config|setting|parameter)\b/.test(normalizedText)) {
    candidates.push({ name: 'Configuration', dataClass: 'Configuration' });
  }
  if (/\b(ip|intellectual|source code|design|blueprint|formula)\b/.test(normalizedText)) {
    candidates.push({ name: 'Intellectual Property', dataClass: 'IntellectualProperty' });
  }

  const quotedObjects = text.match(/["']([^"']{2,80})["']/g) || [];
  quotedObjects.forEach((quoted) => {
    const name = quoted.replace(/^["']|["']$/g, '').trim();
    if (!name) {
      return;
    }
    candidates.push({
      name,
      dataClass: inferDataClassFromText(name),
    });
  });

  if (candidates.length === 0 && /\b(data|daten|payload|message)\b/.test(normalizedText)) {
    candidates.push({ name: 'Operational Data', dataClass: 'Other' });
  }

  const seenByName = new Set<string>();
  return candidates
    .map((candidate, index) => {
      const cleanName = candidate.name.trim().slice(0, 120);
      const nameKey = cleanName.toLowerCase();
      if (!cleanName || seenByName.has(nameKey)) {
        return null;
      }
      seenByName.add(nameKey);
      return {
        id: `data_${index + 1}`,
        name: cleanName,
        dataClass: candidate.dataClass,
        description: 'Generated by fallback extraction',
      } satisfies ParsedDataObject;
    })
    .filter((entry): entry is ParsedDataObject => entry !== null)
    .slice(0, 40);
}

function extractComponentData(
  nodes: ParsedComponent[],
  dataObjects: ParsedDataObject[],
  transfers: ParsedDataTransfer[] = []
): ParsedComponentData[] {
  if (nodes.length === 0 || dataObjects.length === 0) {
    return [];
  }

  const componentNodes = nodes.filter((node) => node.type !== 'System');
  if (componentNodes.length === 0) {
    return [];
  }

  const dataObjectByKey = new Map<string, ParsedDataObject>();
  dataObjects.forEach((dataObject) => {
    dataObjectByKey.set(normalizeNameKey(dataObject.name), dataObject);
  });

  const mappings: ParsedComponentData[] = [];
  const seen = new Set<string>();
  const pushMapping = (nodeId: string, dataObjectId: string, role: ComponentDataRole) => {
    const key = `${nodeId}:${dataObjectId}:${role}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    mappings.push({ nodeId, dataObjectId, role });
  };

  transfers.forEach((transfer) => {
    const dataObject =
      dataObjectByKey.get(normalizeNameKey(transfer.dataName)) ||
      dataObjects.find((candidate) => normalizeNameKey(candidate.name).includes(normalizeNameKey(transfer.dataName)));
    if (!dataObject) {
      return;
    }
    pushMapping(transfer.fromNodeId, dataObject.id, 'Generates');
    pushMapping(transfer.toNodeId, dataObject.id, 'Receives');
  });

  if (mappings.length > 0) {
    return mappings.slice(0, 200);
  }

  return dataObjects.slice(0, 12).map((dataObject, index) => {
    const node = componentNodes[index % componentNodes.length];
    return {
      nodeId: node.id,
      dataObjectId: dataObject.id,
      role: index % 2 === 0 ? 'Stores' : 'Processes',
    };
  });
}

function extractEdgeDataFlows(
  edges: ParsedConnection[],
  dataObjects: ParsedDataObject[],
  transfers: ParsedDataTransfer[] = []
): ParsedEdgeDataFlow[] {
  if (edges.length === 0 || dataObjects.length === 0) {
    return [];
  }

  const dataObjectByKey = new Map<string, ParsedDataObject>();
  dataObjects.forEach((dataObject) => {
    dataObjectByKey.set(normalizeNameKey(dataObject.name), dataObject);
  });
  const edgeByKey = new Map<string, ParsedConnection>();
  edges.forEach((edge) => {
    edgeByKey.set(`${edge.from}:${edge.to}`, edge);
  });

  const flows: ParsedEdgeDataFlow[] = [];
  const seen = new Set<string>();
  transfers.forEach((transfer) => {
    const edge = edgeByKey.get(`${transfer.fromNodeId}:${transfer.toNodeId}`);
    const dataObject = dataObjectByKey.get(normalizeNameKey(transfer.dataName));
    if (!edge || !dataObject) {
      return;
    }
    const dedupeKey = `${edge.id}:${dataObject.id}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    flows.push({
      edgeId: edge.id,
      dataObjectId: dataObject.id,
      direction: transfer.direction,
    });
  });

  if (flows.length > 0) {
    return flows.slice(0, 200);
  }

  return edges.slice(0, 20).map((edge, index) => {
    const dataObject = dataObjects[index % dataObjects.length];
    return {
      edgeId: edge.id,
      dataObjectId: dataObject.id,
      direction: edge.direction === 'B_TO_A' ? 'TargetToSource' : edge.direction === 'BIDIRECTIONAL' ? 'Bidirectional' : 'SourceToTarget',
    };
  });
}

export async function generateModelFromTextWithLLM(systemDescription: string, _apiKey?: string): Promise<ModelGenerationResult> {
  return generateModelFromText(systemDescription);
}
