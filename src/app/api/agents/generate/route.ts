import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

export const dynamic = 'force-dynamic';

interface GenerateAgentRequest {
  name?: string;
  description?: string;
  role?: string;
}

interface GeneratedAgentProfile {
  soul_md: string;
  user_md: string;
  agents_md: string;
  avatar_emoji: string;
  model: string;
  role: string;
  session_key_prefix: string;
}

function buildPrompt({ name, description, role }: { name: string; description: string; role?: string }) {
  return `Generate a complete agent profile for: ${name} - ${description}
${role ? `Role: ${role}` : ''}

Respond ONLY with a JSON block like:
\`\`\`json
{
  "soul_md": "...",
  "user_md": "...",
  "agents_md": "...",
  "avatar_emoji": "🤖",
  "model": "claude-sonnet-4-20250514",
  "role": "Developer",
  "session_key_prefix": "agent:builder:"
}
\`\`\`

Requirements:
- Make SOUL.md rich, specific, and production-quality. Include personality, values, communication style, boundaries, decision-making style, and working norms.
- Make USER.md a useful context template for the human this agent will support.
- Make AGENTS.md a minimal but practical workspace setup guide for this specific agent.
- Suggest a fitting emoji, role, model, and session_key_prefix.
- session_key_prefix must end with a colon.
- Return valid JSON only inside the fenced block, with all fields present as strings.
- Escape newlines correctly inside JSON strings.
- Do not include any explanation before or after the JSON.`;
}

function extractJsonBlock(content: string): string | null {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const bareMatch = content.match(/\{[\s\S]*\}/);
  return bareMatch?.[0]?.trim() || null;
}

function isGeneratedAgentProfile(value: unknown): value is GeneratedAgentProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return [
    'soul_md',
    'user_md',
    'agents_md',
    'avatar_emoji',
    'model',
    'role',
    'session_key_prefix',
  ].every((key) => typeof candidate[key] === 'string');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as GenerateAgentRequest;
    const name = body.name?.trim();
    const description = body.description?.trim();
    const requestedRole = body.role?.trim();

    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      );
    }

    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Use an invented session key — the gateway accepts any session key format.
    // Following the pattern from convoy/route.ts: session keys are arbitrary identifiers.
    const sessionKey = `agent:main:generate:${Date.now()}`;
    const prompt = buildPrompt({ name, description, role: requestedRole });

    await client.call('chat.send', {
      sessionKey,
      message: prompt,
      idempotencyKey: `agent-generate-${Date.now()}`,
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(1000);
      const result = await client.call<{
        messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
      }>('chat.history', { sessionKey, limit: 50 });
      const history = (result.messages || []).map((msg: { role: string; content: Array<{ type: string; text?: string }> }) => ({
        role: msg.role,
        content: msg.content?.find((c) => c.type === 'text')?.text || '',
      }));

      for (let index = history.length - 1; index >= 0; index -= 1) {
        const entry = history[index];
        const role = entry.role;
        const content = entry.content;

        if (!content || role === 'user') continue;

        const jsonBlock = extractJsonBlock(content);
        if (!jsonBlock) continue;

        try {
          const parsed = JSON.parse(jsonBlock) as unknown;
          if (!isGeneratedAgentProfile(parsed)) continue;

          return NextResponse.json({
            ...parsed,
            session_key_prefix: parsed.session_key_prefix.endsWith(':')
              ? parsed.session_key_prefix
              : `${parsed.session_key_prefix}:`,
            role: parsed.role || requestedRole || '',
          });
        } catch {
          continue;
        }
      }
    }

    return NextResponse.json(
      { error: 'Timed out waiting for generated agent profile' },
      { status: 504 }
    );
  } catch (error) {
    console.error('Failed to generate agent profile:', error);
    return NextResponse.json(
      { error: 'Failed to generate agent profile' },
      { status: 500 }
    );
  }
}
