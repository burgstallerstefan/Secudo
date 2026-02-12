/**
 * Health Check Endpoint
 * GET /api/health
 */
export async function GET() {
  return Response.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: 'v0.1.0',
    },
    { status: 200 }
  );
}
