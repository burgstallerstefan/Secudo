/**
 * Health Check Endpoint
 * GET /api/health
 */
import { getConfiguredOllamaModel, getOllamaRuntimeStatus } from '@/lib/llm-service';

export async function GET() {
  let ollama: {
    reachable: boolean;
    model: string;
    modelAvailable: boolean;
    error?: string;
  };

  try {
    const status = await getOllamaRuntimeStatus();
    ollama = {
      reachable: status.reachable,
      model: status.model,
      modelAvailable: status.modelAvailable,
      error: status.error,
    };
  } catch (error) {
    ollama = {
      reachable: false,
      model: getConfiguredOllamaModel(),
      modelAvailable: false,
      error: (error as Error).message || 'Unable to check Ollama status',
    };
  }

  return Response.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: 'v0.1.0',
      ollama,
    },
    { status: 200 }
  );
}
