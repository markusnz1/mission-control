/**
 * Browser Notifications for Mission Control
 */

import type { HealthAlert } from './types';

export function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function sendHealthNotification(alert: HealthAlert): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const title = alert.healthState === 'zombie'
    ? `⚠️ Agent session dead: ${alert.agentName}`
    : `⚠️ Agent stuck: ${alert.agentName}`;

  const body = `"${alert.taskTitle}" — ${alert.duration}${alert.hasArtifacts ? ' (work may be complete)' : ''}`;

  new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: `health-${alert.agentId}`,
    requireInteraction: true,
  });
}

export function sendTaskNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: `task-${Date.now()}`,
  });
}
