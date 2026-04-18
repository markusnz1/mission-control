import { NextResponse } from 'next/server';
import { cleanupOrphanedWorkspaces } from '@/lib/workspace-isolation';

export async function POST() {
  try {
    const result = await cleanupOrphanedWorkspaces();
    return NextResponse.json({
      success: true,
      cleaned: result.cleaned,
      failed: result.failed,
      summary: `Cleaned ${result.cleaned.length} workspace(s), ${result.failed.length} failed`,
    });
  } catch (error) {
    console.error('[API] cleanup failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
