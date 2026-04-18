import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { buildAgentsMd, buildSoulMd, buildUserMd, ensureGatewayAgentMetadata, syncGatewayMetadata } from '@/lib/gateway-agent-metadata';
import type { Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';
interface ImportAgentRequest {
  gateway_agent_id: string;
  name: string;
  model?: string;
  workspace_id?: string;
}

interface ImportRequest {
  agents: ImportAgentRequest[];
}

// POST /api/agents/import - Import one or more agents from the OpenClaw Gateway
export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();

    if (!body.agents || !Array.isArray(body.agents) || body.agents.length === 0) {
      return NextResponse.json(
        { error: 'At least one agent is required in the agents array' },
        { status: 400 }
      );
    }

    for (const agentReq of body.agents) {
      if (!agentReq.gateway_agent_id || !agentReq.name) {
        return NextResponse.json(
          { error: 'Each agent must have gateway_agent_id and name' },
          { status: 400 }
        );
      }
    }

    const existingImports = queryAll<Agent>(
      `SELECT * FROM agents WHERE gateway_agent_id IS NOT NULL`
    );
    const importedPairs = new Set(
      existingImports.map((a) => `${a.workspace_id || 'default'}::${a.gateway_agent_id}`)
    );

    const results: { imported: Agent[]; skipped: { gateway_agent_id: string; reason: string }[] } = {
      imported: [],
      skipped: [],
    };
    const importedIds: string[] = [];

    transaction(() => {
      const now = new Date().toISOString();

      for (const agentReq of body.agents) {
        const workspaceId = agentReq.workspace_id || 'default';
        const importKey = `${workspaceId}::${agentReq.gateway_agent_id}`;

        if (importedPairs.has(importKey)) {
          results.skipped.push({
            gateway_agent_id: agentReq.gateway_agent_id,
            reason: 'Already imported in this workspace',
          });
          continue;
        }

        const id = uuidv4();

        const baseAgent: Agent = {
          id,
          name: agentReq.name,
          role: 'Imported Agent',
          description: `Imported from OpenClaw Gateway (${agentReq.gateway_agent_id})`,
          avatar_emoji: '🔗',
          status: 'standby',
          is_master: false,
          workspace_id: workspaceId,
          soul_md: undefined,
          user_md: undefined,
          agents_md: undefined,
          model: agentReq.model || undefined,
          source: 'gateway',
          gateway_agent_id: agentReq.gateway_agent_id,
          created_at: now,
          updated_at: now,
        };

        const soulMd = buildSoulMd(baseAgent);
        const userMd = buildUserMd(baseAgent);
        const agentsMd = buildAgentsMd(baseAgent);

        run(
          `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, model, source, gateway_agent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            agentReq.name,
            'Imported Agent',
            `Imported from OpenClaw Gateway (${agentReq.gateway_agent_id})`,
            '🔗',
            0,
            workspaceId,
            soulMd,
            userMd,
            agentsMd,
            agentReq.model || null,
            'gateway',
            agentReq.gateway_agent_id,
            now,
            now,
          ]
        );

        run(
          `INSERT INTO events (id, type, agent_id, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'agent_joined', id, `${agentReq.name} imported from OpenClaw Gateway`, now]
        );

        importedPairs.add(importKey);
        importedIds.push(id);
      }
    });

    for (const id of importedIds) {
      const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
      if (!agent) continue;

      ensureGatewayAgentMetadata(agent);

      try {
        await syncGatewayMetadata(agent);
      } catch (error) {
        console.error(`Failed to sync gateway metadata for agent ${agent.id}:`, error);
      }

      const refreshed = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
      if (refreshed) {
        results.imported.push(refreshed);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Failed to import agents:', error);
    return NextResponse.json(
      { error: 'Failed to import agents' },
      { status: 500 }
    );
  }
}
