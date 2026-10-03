import React from 'react';
import { Dashboard } from '../dashboard/Dashboard';

/**
 * AppShell previously hosted the raw IDE workspace.
 * In response to the user's explicit request to "Remove this whole page",
 * AppShell renders the primary FLOAT AI Dashboard so users remain in the
 * central developer dashboard workspace.
 */
export function AppShell() {
  return <Dashboard initialTab="new-chat" />;
}
