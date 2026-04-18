import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { ensureGatewayAgentMetadata, importGatewayMetadata, getGatewayAgentWorkspaceInfo } from '@/lib/gateway-agent-metadata';
import type { Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.source !== 'gateway' && !agent.gateway_agent_id) {
      return NextResponse.json({ error: 'Agent is not a gateway agent' }, { status: 400 });
    }

    ensureGatewayAgentMetadata(agent);
    const imported = importGatewayMetadata(agent);
    const workspace = getGatewayAgentWorkspaceInfo(agent);

    return NextResponse.json({
      success: true,
      agent_id: agent.id,
      workspace,
      imported,
    });
  } catch (error) {
    console.error('Failed to import gateway metadata:', error);
    return NextResponse.json(
      { error: 'Failed to import gateway metadata' },
      { status: 500 }
    );
  }
}
