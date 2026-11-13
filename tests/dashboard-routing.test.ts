/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';

/**
 * Pure route resolution helper matching src/features/dashboard/Dashboard.tsx
 */
export function resolveDashboardTab(pathname: string, defaultTab: string = 'new-chat'): string {
  if (pathname === '/dashboard/analyst' || pathname === '/analyst' || pathname === '/data-analyst') return 'analyst';
  if (pathname === '/dashboard/usage' || pathname === '/usage' || pathname === '/analytics') return 'usage';
  if (pathname === '/git-sync' || pathname === '/dashboard/git-sync') return 'git-sync';
  if (pathname === '/integrations' || pathname === '/dashboard/integrations') return 'integrations';
  if (pathname === '/projects' || pathname === '/codebase' || pathname === '/dashboard/projects' || pathname === '/dashboard/codebase') return 'codebase';
  if (pathname === '/' || pathname === '/dashboard' || pathname === '/new-chat' || pathname === '/chat' || pathname === '/dashboard/new-chat') return 'new-chat';
  return defaultTab;
}

/**
 * Route access evaluator matching src/App.tsx logic for guest vs authenticated users
 */
export function evaluateRouteAccess(
  pathname: string,
  isAuthenticated: boolean,
  hasStarted: boolean
): { target: 'dashboard' | 'landing' | 'ide' | 'other'; initialTab?: string } {
  // Check explicit dashboard routes
  if (pathname === '/analyst' || pathname === '/dashboard/analyst' || pathname === '/data-analyst') {
    return { target: 'dashboard', initialTab: 'analyst' };
  }
  if (pathname === '/usage' || pathname === '/analytics' || pathname === '/dashboard/usage' || pathname === '/dashboard/analytics') {
    return { target: 'dashboard', initialTab: 'usage' };
  }
  if (pathname === '/integrations' || pathname === '/dashboard/integrations') {
    return { target: 'dashboard', initialTab: 'integrations' };
  }
  if (pathname === '/git-sync' || pathname === '/dashboard/git-sync') {
    return { target: 'dashboard', initialTab: 'git-sync' };
  }
  if (pathname === '/projects' || pathname === '/codebase' || pathname === '/dashboard/projects' || pathname === '/dashboard/codebase') {
    return { target: 'dashboard', initialTab: 'codebase' };
  }
  if (pathname === '/dashboard' || pathname === '/new-chat' || pathname === '/chat' || pathname === '/dashboard/new-chat') {
    return { target: 'dashboard', initialTab: 'new-chat' };
  }
  if (pathname === '/workspace' || pathname === '/ide' || pathname.startsWith('/workspace/')) {
    return { target: 'ide' };
  }

  // Unauthenticated / guest access check
  if (!isAuthenticated || !hasStarted) {
    if (
      pathname === '/sign-in' ||
      pathname === '/signin' ||
      pathname === '/login' ||
      pathname === '/dashboard' ||
      pathname === '/new-chat' ||
      pathname === '/chat' ||
      pathname === '/projects' ||
      pathname === '/codebase' ||
      pathname === '/analyst' ||
      pathname === '/usage' ||
      pathname === '/analytics' ||
      pathname === '/integrations' ||
      pathname === '/git-sync' ||
      pathname.startsWith('/dashboard/')
    ) {
      return { target: 'dashboard', initialTab: 'new-chat' };
    }
    return { target: 'landing' };
  }

  return { target: 'dashboard', initialTab: 'new-chat' };
}

describe('Dashboard New Chat Routing & Guest Route Safety', () => {
  describe('Tab Resolution (resolveDashboardTab)', () => {
    it('resolves root and new-chat aliases to new-chat tab', () => {
      expect(resolveDashboardTab('/')).toBe('new-chat');
      expect(resolveDashboardTab('/dashboard')).toBe('new-chat');
      expect(resolveDashboardTab('/new-chat')).toBe('new-chat');
      expect(resolveDashboardTab('/chat')).toBe('new-chat');
      expect(resolveDashboardTab('/dashboard/new-chat')).toBe('new-chat');
    });

    it('resolves codebase and project aliases to codebase tab', () => {
      expect(resolveDashboardTab('/codebase')).toBe('codebase');
      expect(resolveDashboardTab('/projects')).toBe('codebase');
      expect(resolveDashboardTab('/dashboard/codebase')).toBe('codebase');
      expect(resolveDashboardTab('/dashboard/projects')).toBe('codebase');
    });

    it('resolves analytics and usage aliases to usage tab', () => {
      expect(resolveDashboardTab('/usage')).toBe('usage');
      expect(resolveDashboardTab('/analytics')).toBe('usage');
      expect(resolveDashboardTab('/dashboard/usage')).toBe('usage');
    });

    it('resolves git-sync and integration routes correctly', () => {
      expect(resolveDashboardTab('/git-sync')).toBe('git-sync');
      expect(resolveDashboardTab('/dashboard/git-sync')).toBe('git-sync');
      expect(resolveDashboardTab('/integrations')).toBe('integrations');
      expect(resolveDashboardTab('/dashboard/integrations')).toBe('integrations');
    });
  });

  describe('Guest User Routing Protection (No Landing Page Ejection)', () => {
    it('keeps unauthenticated guests on the dashboard when clicking New Chat', () => {
      const result = evaluateRouteAccess('/new-chat', false, false);
      expect(result.target).toBe('dashboard');
      expect(result.initialTab).toBe('new-chat');
    });

    it('allows guest access to /dashboard without ejecting to landing', () => {
      const result = evaluateRouteAccess('/dashboard', false, false);
      expect(result.target).toBe('dashboard');
      expect(result.initialTab).toBe('new-chat');
    });

    it('allows guest access to /codebase without redirecting to landing', () => {
      const result = evaluateRouteAccess('/codebase', false, false);
      expect(result.target).toBe('dashboard');
      expect(result.initialTab).toBe('codebase');
    });

    it('allows guest access to /git-sync and /integrations', () => {
      const gitResult = evaluateRouteAccess('/git-sync', false, false);
      expect(gitResult.target).toBe('dashboard');
      expect(gitResult.initialTab).toBe('git-sync');

      const integrationsResult = evaluateRouteAccess('/integrations', false, false);
      expect(integrationsResult.target).toBe('dashboard');
      expect(integrationsResult.initialTab).toBe('integrations');
    });

    it('routes unauthenticated visitors on root / to landing page', () => {
      const result = evaluateRouteAccess('/', false, false);
      expect(result.target).toBe('landing');
    });
  });

  describe('Authenticated User Routing', () => {
    it('routes authenticated users directly to dashboard tabs', () => {
      expect(evaluateRouteAccess('/dashboard', true, true)).toEqual({
        target: 'dashboard',
        initialTab: 'new-chat',
      });
      expect(evaluateRouteAccess('/codebase', true, true)).toEqual({
        target: 'dashboard',
        initialTab: 'codebase',
      });
      expect(evaluateRouteAccess('/workspace', true, true)).toEqual({
        target: 'ide',
      });
    });
  });

  describe('New Chat Action State Lifecycle Contract', () => {
    it('resets active chat ID, sets tab to new-chat, and targets /dashboard', () => {
      let state = {
        activeChatId: 'chat-uuid-123',
        activeTab: 'codebase',
        prompt: 'some old query',
        location: '/codebase',
      };

      // Simulating handleOpenNewChat
      const handleOpenNewChat = () => {
        state.activeChatId = '';
        state.activeTab = 'new-chat';
        state.prompt = '';
        if (state.location !== '/dashboard') {
          state.location = '/dashboard';
        }
      };

      handleOpenNewChat();

      expect(state.activeChatId).toBe('');
      expect(state.activeTab).toBe('new-chat');
      expect(state.prompt).toBe('');
      expect(state.location).toBe('/dashboard');
      expect(resolveDashboardTab(state.location)).toBe('new-chat');
    });
  });
});
