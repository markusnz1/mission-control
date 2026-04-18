'use client';

import { useState } from 'react';
import { X, AlertTriangle, Eye, RefreshCw, CheckCircle } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { HealthAlert, Task } from '@/lib/types';

interface HealthAlertBannerProps {
  onViewTask?: (task: Task) => void;
}

export function HealthAlertBanner({ onViewTask }: HealthAlertBannerProps) {
  const { healthAlerts, removeHealthAlert, tasks } = useMissionControl();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [nudging, setNudging] = useState<string[]>([]);
  const [completing, setCompleting] = useState<string[]>([]);

  const visibleAlerts = healthAlerts.filter(a => !dismissed.includes(a.agentId));
  if (visibleAlerts.length === 0) return null;

  const handleDismiss = (agentId: string) => {
    setDismissed(prev => [...prev, agentId]);
    removeHealthAlert(agentId);
  };

  const handleNudge = async (alert: HealthAlert) => {
    setNudging(prev => [...prev, alert.agentId]);
    try {
      const res = await fetch(`/api/agents/${alert.agentId}/health/nudge`, { method: 'POST' });
      if (res.ok) {
        handleDismiss(alert.agentId);
      }
    } catch (err) {
      console.error('Nudge failed:', err);
    } finally {
      setNudging(prev => prev.filter(id => id !== alert.agentId));
    }
  };

  const handleView = (alert: HealthAlert) => {
    if (alert.taskId) {
      const task = tasks.find(t => t.id === alert.taskId);
      if (task && onViewTask) {
        onViewTask(task);
      }
    }
  };

  const handleComplete = async (alert: HealthAlert) => {
    if (!alert.taskId) return;
    setCompleting(prev => [...prev, alert.agentId]);
    try {
      const res = await fetch(`/api/tasks/${alert.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (res.ok) {
        handleDismiss(alert.agentId);
      }
    } catch (err) {
      console.error('Complete failed:', err);
    } finally {
      setCompleting(prev => prev.filter(id => id !== alert.agentId));
    }
  };

  return (
    <div className="mx-3 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {visibleAlerts.length} agent{visibleAlerts.length > 1 ? 's' : ''} need{visibleAlerts.length === 1 ? 's' : ''} attention
        </span>
        {visibleAlerts.length > 1 && (
          <button
            onClick={() => visibleAlerts.forEach(a => handleDismiss(a.agentId))}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Dismiss all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visibleAlerts.map(alert => {
          const task = tasks.find(t => t.id === alert.taskId);
          return (
          <div key={alert.agentId} className="flex items-center justify-between gap-3 py-2 px-3 bg-mc-bg-secondary/50 rounded">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${alert.healthState === 'zombie' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-base flex-shrink-0">{alert.agentEmoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-mc-text-secondary truncate">
                  <span className="font-medium">{alert.agentName}</span>
                  {' '}
                  <span className={alert.healthState === 'zombie' ? 'text-red-400' : 'text-yellow-400'}>
                    {alert.healthState === 'zombie' ? 'zombie' : 'stuck'}
                  </span>
                  {task?.title && (
                    <span className="text-mc-text/60"> on &quot;{task.title}&quot;</span>
                  )}
                  {alert.duration && (
                    <span className="text-mc-text/40"> ({alert.duration})</span>
                  )}
                  {!alert.sessionAlive && <span className="text-red-400"> — session dead</span>}
                  {alert.hasArtifacts && <span className="text-green-400"> — work may be complete</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleView(alert)}
                className="text-xs px-2 py-1 bg-mc-bg-tertiary hover:bg-mc-accent/20 text-mc-text-secondary rounded border border-mc-border transition-colors flex items-center gap-1"
                title="View task"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleNudge(alert)}
                disabled={nudging.includes(alert.agentId)}
                className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Nudge agent"
              >
                <RefreshCw className={`w-3 h-3 ${nudging.includes(alert.agentId) ? 'animate-spin' : ''}`} />
                {nudging.includes(alert.agentId) ? 'Nudging...' : 'Nudge'}
              </button>
              {alert.hasArtifacts && (
                <button
                  onClick={() => handleComplete(alert)}
                  disabled={completing.includes(alert.agentId)}
                  className="text-xs px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded border border-green-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Mark as complete"
                >
                  <CheckCircle className="w-3 h-3" />
                  {completing.includes(alert.agentId) ? 'Completing...' : 'Complete'}
                </button>
              )}
              <button
                onClick={() => handleDismiss(alert.agentId)}
                className="text-xs px-1 py-1 text-mc-text-secondary hover:text-mc-text"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
