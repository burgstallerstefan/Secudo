// LLM Service für Modell-Generierung aus Text
// Diese Implementierung verwendet ein Mock-LLM für MVP
// Produktiv würde OpenAI oder Claude API verwendet

interface ParsedComponent {
  id: string;
  label: string;
  type: 'System' | 'Component' | 'Human';
}

interface ParsedConnection {
  from: string;
  to: string;
  direction: 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
}

export interface ModelGenerationResult {
  success: boolean;
  nodes: ParsedComponent[];
  edges: ParsedConnection[];
  error?: string;
}

/**
 * Mock LLM für MVP: Extrahiert Components und Connections aus Text
 * Produktiv: OpenAI GPT-4 oder Claude 3.5 mit Zod Schema für strukturierte Ausgabe
 */
export async function generateModelFromText(
  systemDescription: string
): Promise<ModelGenerationResult> {
  try {
    // Mock-Implementierung für MVP
    // Pattern-basiertes Parsing (in Production: echtes LLM)

    const nodes = extractComponents(systemDescription);
    const edges = extractConnections(systemDescription, nodes);

    if (nodes.length === 0) {
      return {
        success: false,
        nodes: [],
        edges: [],
        error: 'No components could be extracted. Try being more specific about system components.',
      };
    }

    return {
      success: true,
      nodes,
      edges,
    };
  } catch (error) {
    return {
      success: false,
      nodes: [],
      edges: [],
      error: `Generation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Extract components from text description
 * Mock implementation using pattern matching
 */
function extractComponents(text: string): ParsedComponent[] {
  const components: ParsedComponent[] = [];
  const seen = new Set<string>();

  // Keywords that indicate components
  const componentKeywords: Record<string, 'System' | 'Component' | 'Human'> = {
    // Human/User roles
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
    hmi: 'System',
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

  // Split text into words and find components
  const words = text.toLowerCase().split(/\s+/);
  const phrases = text.toLowerCase().match(/\b[a-z\s]+\b/gi) || [];

  // Check both words and longer phrases
  [...words, ...phrases].forEach((phrase) => {
    const cleaned = phrase.trim().replace(/[,;:.!?]/g, '');
    const type = componentKeywords[cleaned];

    if (type && !seen.has(cleaned)) {
      seen.add(cleaned);
      components.push({
        id: `node_${components.length + 1}`,
        label: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        type,
      });
    }
  });

  // Extract numbered references (e.g., "PLCs", "3 workstations")
  const numberPatterns = text.match(/(\d+)\s+([a-z]+s?)/gi) || [];
  numberPatterns.forEach((match) => {
    const [, num, item] = match.match(/(\d+)\s+([a-z]+)/i) || [];
    if (num && item) {
      const singular = item.endsWith('s') ? item.slice(0, -1) : item;
      const type = componentKeywords[singular];
      if (type && !seen.has(singular) && parseInt(num) <= 5) {
        // Limit to 5 of same type
        seen.add(singular);
        components.push({
          id: `node_${components.length + 1}`,
          label:
            parseInt(num) > 1
              ? `${singular.charAt(0).toUpperCase() + singular.slice(1)} (${num})`
              : singular.charAt(0).toUpperCase() + singular.slice(1),
          type,
        });
      }
    }
  });

  // Remove duplicates and limit to reasonable count
  const uniqueComponents = Array.from(new Map(components.map((c) => [c.label, c])).values());
  return uniqueComponents.slice(0, 20); // Max 20 nodes for initial model
}

/**
 * Extract connections between components
 */
function extractConnections(text: string, nodes: ParsedComponent[]): ParsedConnection[] {
  const edges: ParsedConnection[] = [];
  const seen = new Set<string>();

  if (nodes.length < 2) return [];

  // Connection keywords
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
  ];

  // Find sentences with connection keywords
  const sentences = text.split(/[.!?]/);

  sentences.forEach((sentence) => {
    const sentenceLower = sentence.toLowerCase();
    const hasConnection = connectionKeywords.some((kw) => sentenceLower.includes(kw));

    if (hasConnection) {
      // Extract node pairs from sentence
      const nodeNames = nodes.map((n) => n.label.toLowerCase());
      const foundNodes: string[] = [];

      nodeNames.forEach((name) => {
        if (sentenceLower.includes(name)) {
          foundNodes.push(name);
        }
      });

      // Create edges between found nodes
      if (foundNodes.length >= 2) {
        for (let i = 0; i < foundNodes.length - 1; i++) {
          for (let j = i + 1; j < foundNodes.length; j++) {
            const key = [foundNodes[i], foundNodes[j]].sort().join('_');

            if (!seen.has(key)) {
              seen.add(key);

              // Determine direction
              const direction = sentenceLower.includes('bidirectional') ||
                sentenceLower.includes('both') ||
                sentenceLower.includes('each other')
                ? 'BIDIRECTIONAL'
                : 'A_TO_B';

              const fromNode = nodes.find((n) => n.label.toLowerCase() === foundNodes[i]);
              const toNode = nodes.find((n) => n.label.toLowerCase() === foundNodes[j]);

              if (fromNode && toNode) {
                edges.push({
                  from: fromNode.id,
                  to: toNode.id,
                  direction,
                });
              }
            }
          }
        }
      }
    }
  });

  // If no connections found through keywords, create star topology (common pattern)
  if (edges.length === 0 && nodes.length > 1) {
    const centerNode = nodes[0]; // First node as Hub
    for (let i = 1; i < nodes.length; i++) {
      edges.push({
        from: centerNode.id,
        to: nodes[i].id,
        direction: 'BIDIRECTIONAL',
      });
    }
  }

  return edges.slice(0, 30); // Max 30 connections
}

/**
 * Production LLM Function (for future use with OpenAI/Claude)
 * Requires API key and structured output validation with Zod
 */
export async function generateModelFromTextWithLLM(
  systemDescription: string,
  _apiKey?: string
): Promise<ModelGenerationResult> {
  // TODO: Implement with OpenAI or Claude API
  // Would use Zod schema for validated JSON output
  // Example structure:
  /*
    const schema = z.object({
      components: z.array(z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(['System', 'Component', 'Human']),
      })),
      connections: z.array(z.object({
        from: z.string(),
        to: z.string(),
        direction: z.enum(['A_TO_B', 'B_TO_A', 'BIDIRECTIONAL']),
      })),
    });

    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: prompt with systemDescription
      }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const parsed = schema.parse(JSON.parse(response.choices[0].message.content));
  */

  // For now, use mock implementation
  return generateModelFromText(systemDescription);
}
