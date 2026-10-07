/**
 * FLOAT AI - Milestone 9 API Router
 *
 * Exposes REST endpoints for:
 * - Rules (User, Project, Repository)
 * - Skills (Discovery & Custom)
 * - MCP (Servers, Tools, Resources, Execution)
 * - Terminal Sessions
 * - Memory (Project & Agent)
 * - Automated Code Review
 * - Automations
 * - Error Diagnostics
 * - Execution Policies
 * - Browser Agent Environment & Actions
 * - Multi-Repo Workspaces
 * - Multi-Agent Coordinator
 * - Conversation Search
 */

import { Router } from 'express';
import { requireAuth } from './authMiddleware';
import { asyncRoute } from './asyncRoute';
import { RulesService } from './rules/rulesService';
import { SkillsService } from './skills/skillsService';
import { MCPService } from './mcp/mcpService';
import { TerminalService } from './terminal/terminalService';
import { MemoryService } from './memory/memoryService';
import { CodeReviewService } from './review/codeReviewService';
import { AutomationService } from './automations/automationService';
import { DiagnosticsService } from './diagnostics/diagnosticsService';
import { ExecutionPolicyManager, ExecutionPolicyMode } from './policy/executionPolicy';
import { BrowserAgentService } from './browser/browserAgent';
import { MultiRepoService } from './workspace/multiRepoService';
import { MultiAgentCoordinator } from './agent/subagents';
import { ConversationSearchService } from './conversation/conversationSearch';

export const milestone9Router = Router();

// ==========================================
// 1. RULES API
// ==========================================
milestone9Router.get('/rules/user', requireAuth, (req: any, res) => {
  res.json({ rules: RulesService.getUserRules(req.user.uid) });
});

milestone9Router.post('/rules/user', requireAuth, (req: any, res) => {
  const { id, name, content, priority, enabled } = req.body || {};
  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required.' });
  }
  const rule = RulesService.setUserRule(req.user.uid, {
    id: id || `rule-${Date.now()}`,
    name,
    content,
    priority: priority || 5,
    enabled: enabled !== false
  });
  res.json({ rule });
});

milestone9Router.delete('/rules/user/:ruleId', requireAuth, (req: any, res) => {
  const deleted = RulesService.deleteUserRule(req.user.uid, req.params.ruleId);
  res.json({ success: deleted });
});

milestone9Router.get('/projects/:projectId/rules', requireAuth, (req: any, res) => {
  const projectRules = RulesService.getProjectRules(req.params.projectId);
  res.json({ rules: projectRules });
});

milestone9Router.post('/projects/:projectId/rules', requireAuth, (req: any, res) => {
  const { id, name, content, priority, enabled } = req.body || {};
  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required.' });
  }
  const rule = RulesService.setProjectRule(req.params.projectId, {
    id: id || `proj-rule-${Date.now()}`,
    name,
    content,
    priority: priority || 3,
    enabled: enabled !== false
  });
  res.json({ rule });
});

milestone9Router.delete('/projects/:projectId/rules/:ruleId', requireAuth, (req: any, res) => {
  const deleted = RulesService.deleteProjectRule(req.params.projectId, req.params.ruleId);
  res.json({ success: deleted });
});

// ==========================================
// 2. SKILLS API
// ==========================================
milestone9Router.get('/skills', (_req, res) => {
  res.json({ skills: SkillsService.getAllSkills() });
});

milestone9Router.post('/skills', requireAuth, (req: any, res) => {
  const skill = req.body;
  if (!skill?.name || !skill?.instructions) {
    return res.status(400).json({ error: 'Skill name and instructions are required.' });
  }
  SkillsService.registerSkill({
    ...skill,
    id: skill.id || `custom-skill-${Date.now()}`,
    scope: 'user',
    enabled: skill.enabled !== false,
    keywords: Array.isArray(skill.keywords) ? skill.keywords : [],
    allowedTools: Array.isArray(skill.allowedTools) ? skill.allowedTools : [],
    permissionsRequired: Array.isArray(skill.permissionsRequired) ? skill.permissionsRequired : ['read']
  });
  res.json({ success: true, skill });
});

// ==========================================
// 3. MCP API
// ==========================================
milestone9Router.get('/mcp/servers', requireAuth, (_req, res) => {
  res.json({ servers: MCPService.listServers(true) });
});

milestone9Router.post('/mcp/servers', requireAuth, (req: any, res) => {
  const config = req.body;
  if (!config?.name || !config?.transport) {
    return res.status(400).json({ error: 'Server name and transport (http/stdio) are required.' });
  }
  MCPService.registerServer({
    ...config,
    id: config.id || `mcp-srv-${Date.now()}`,
    createdAt: Date.now()
  });
  res.json({ success: true, server: config });
});

milestone9Router.delete('/mcp/servers/:serverId', requireAuth, (req: any, res) => {
  const deleted = MCPService.deleteServer(req.params.serverId);
  res.json({ success: deleted });
});

milestone9Router.get('/mcp/tools', requireAuth, (req: any, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : undefined;
  res.json({ tools: MCPService.getDiscoveredTools(serverId) });
});

milestone9Router.get('/mcp/resources', requireAuth, (req: any, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : undefined;
  res.json({ resources: MCPService.getDiscoveredResources(serverId) });
});

milestone9Router.post('/mcp/execute', requireAuth, asyncRoute(async (req: any, res) => {
  const { serverId, toolName, args, userApproved } = req.body || {};
  if (!serverId || !toolName) {
    return res.status(400).json({ error: 'serverId and toolName are required.' });
  }
  const result = await MCPService.executeTool(serverId, toolName, args || {}, { userApproved });
  res.json(result);
}));

// ==========================================
// 4. TERMINAL SESSIONS API
// ==========================================
milestone9Router.get('/projects/:projectId/terminals', requireAuth, (req: any, res) => {
  res.json({ terminals: TerminalService.listSessions(req.params.projectId, req.user.uid) });
});

milestone9Router.post('/projects/:projectId/terminals', requireAuth, (req: any, res) => {
  const terminal = TerminalService.createSession(req.params.projectId, req.user.uid, req.body?.name);
  res.json({ terminal });
});

milestone9Router.delete('/projects/:projectId/terminals/:terminalId', requireAuth, (req: any, res) => {
  const deleted = TerminalService.deleteSession(req.params.terminalId, req.user.uid);
  res.json({ success: deleted });
});

milestone9Router.post('/projects/:projectId/terminals/:terminalId/command', requireAuth, (req: any, res) => {
  const { command, stdout, stderr, exitCode } = req.body || {};
  if (typeof command !== 'string') {
    return res.status(400).json({ error: 'Command string is required.' });
  }
  const updated = TerminalService.appendExecution(
    req.params.terminalId,
    req.user.uid,
    command,
    stdout || '',
    stderr || '',
    typeof exitCode === 'number' ? exitCode : 0
  );
  if (!updated) return res.status(404).json({ error: 'Terminal session not found.' });
  res.json({ terminal: updated });
});

// ==========================================
// 5. MEMORY API
// ==========================================
milestone9Router.get('/projects/:projectId/memory', requireAuth, (req: any, res) => {
  res.json({ memories: MemoryService.getProjectMemories(req.params.projectId, req.user.uid) });
});

milestone9Router.post('/projects/:projectId/memory', requireAuth, (req: any, res) => {
  const { key, value, category, scope, enabled } = req.body || {};
  if (!key || !value) {
    return res.status(400).json({ error: 'Memory key and value are required.' });
  }
  const result = MemoryService.setMemory({
    projectId: req.params.projectId,
    userId: req.user.uid,
    key,
    value,
    category: category || 'convention',
    scope: scope || 'project',
    enabled: enabled !== false
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ memory: result.memory });
});

milestone9Router.delete('/projects/:projectId/memory/:memoryId', requireAuth, (req: any, res) => {
  const deleted = MemoryService.deleteMemory(req.params.memoryId, req.user.uid);
  res.json({ success: deleted });
});

// ==========================================
// 6. CODE REVIEW API
// ==========================================
milestone9Router.post('/projects/:projectId/review', requireAuth, (req: any, res) => {
  const { diffText, files } = req.body || {};
  const report = CodeReviewService.analyzeDiff(
    req.params.projectId,
    diffText || '',
    Array.isArray(files) ? files : []
  );
  res.json({ report });
});

milestone9Router.get('/projects/:projectId/review/:reportId', requireAuth, (req: any, res) => {
  const report = CodeReviewService.getReport(req.params.reportId);
  if (!report) return res.status(404).json({ error: 'Review report not found.' });
  res.json({ report });
});

milestone9Router.post('/projects/:projectId/review/:reportId/dismiss/:findingId', requireAuth, (req: any, res) => {
  const dismissed = CodeReviewService.dismissFinding(req.params.reportId, req.params.findingId);
  res.json({ success: dismissed });
});

// ==========================================
// 7. AUTOMATIONS API
// ==========================================
milestone9Router.get('/projects/:projectId/automations', requireAuth, (req: any, res) => {
  res.json({ automations: AutomationService.listAutomations(req.params.projectId, req.user.uid) });
});

milestone9Router.post('/projects/:projectId/automations', requireAuth, (req: any, res) => {
  const { name, trigger, action, permissions, enabled, description } = req.body || {};
  if (!name || !trigger?.type || !action?.type) {
    return res.status(400).json({ error: 'Automation name, trigger, and action are required.' });
  }
  const automation = AutomationService.createAutomation({
    projectId: req.params.projectId,
    userId: req.user.uid,
    name,
    description,
    trigger,
    action,
    permissions: Array.isArray(permissions) ? permissions : ['read'],
    enabled: enabled !== false
  });
  res.json({ automation });
});

milestone9Router.delete('/projects/:projectId/automations/:automationId', requireAuth, (req: any, res) => {
  const deleted = AutomationService.deleteAutomation(req.params.automationId, req.user.uid);
  res.json({ success: deleted });
});

milestone9Router.post('/projects/:projectId/automations/:automationId/trigger', requireAuth, asyncRoute(async (req: any, res) => {
  const result = await AutomationService.trigger(req.params.automationId, {
    triggerType: req.body?.triggerType || 'manual',
    payload: req.body?.payload,
    userId: req.user.uid
  });
  res.json(result);
}));

milestone9Router.get('/projects/:projectId/automations/:automationId/logs', requireAuth, (req: any, res) => {
  res.json({ logs: AutomationService.getRunLogs(req.params.automationId) });
});

// ==========================================
// 8. DIAGNOSTICS API
// ==========================================
milestone9Router.get('/projects/:projectId/diagnostics', requireAuth, (req: any, res) => {
  const source = req.query.source ? String(req.query.source) : undefined;
  res.json({ diagnostics: DiagnosticsService.getDiagnostics(req.params.projectId, source as any) });
});

milestone9Router.post('/projects/:projectId/diagnostics', requireAuth, (req: any, res) => {
  const { source, severity, filePath, line, column, message, code } = req.body || {};
  if (!source || !message) {
    return res.status(400).json({ error: 'Diagnostic source and message are required.' });
  }
  const diagnostic = DiagnosticsService.addDiagnostic(req.params.projectId, {
    source,
    severity: severity || 'error',
    filePath,
    line,
    column,
    message,
    code
  });
  res.json({ diagnostic });
});

milestone9Router.delete('/projects/:projectId/diagnostics', requireAuth, (req: any, res) => {
  const source = req.query.source ? String(req.query.source) : undefined;
  DiagnosticsService.clearDiagnostics(req.params.projectId, source as any);
  res.json({ success: true });
});

// ==========================================
// 9. EXECUTION POLICY API
// ==========================================
milestone9Router.get('/policy', requireAuth, (req: any, res) => {
  res.json({ mode: ExecutionPolicyManager.getPolicyMode(req.user.uid) });
});

milestone9Router.post('/policy', requireAuth, (req: any, res) => {
  const { mode } = req.body || {};
  if (!['safe', 'review', 'allowlist', 'manual', 'sandboxed'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid execution policy mode.' });
  }
  ExecutionPolicyManager.setPolicyMode(req.user.uid, mode as ExecutionPolicyMode);
  res.json({ success: true, mode });
});

// ==========================================
// 10. BROWSER AGENT STATUS & ACTION API
// ==========================================
milestone9Router.get('/browser/status', (_req, res) => {
  res.json({ status: BrowserAgentService.detectEnvironment() });
});

milestone9Router.post('/browser/action', requireAuth, asyncRoute(async (req: any, res) => {
  const action = req.body;
  if (!action?.type) return res.status(400).json({ error: 'Browser action type is required.' });
  const result = await BrowserAgentService.executeAction(action);
  res.json(result);
}));

// ==========================================
// 11. MULTI-REPO WORKSPACES API
// ==========================================
milestone9Router.get('/projects/:projectId/workspace', requireAuth, (req: any, res) => {
  const ws = MultiRepoService.getWorkspace(req.params.projectId, req.user.uid);
  res.json({ workspace: ws || null });
});

milestone9Router.post('/projects/:projectId/workspace/repositories', requireAuth, (req: any, res) => {
  const repo = req.body;
  if (!repo?.name || !repo?.subpath) {
    return res.status(400).json({ error: 'Repository name and subpath are required.' });
  }
  let ws = MultiRepoService.getWorkspace(req.params.projectId, req.user.uid);
  if (!ws) {
    ws = {
      id: `ws-${Date.now()}`,
      projectId: req.params.projectId,
      userId: req.user.uid,
      name: repo.name,
      repositories: [],
      updatedAt: Date.now()
    };
    MultiRepoService.registerWorkspace(ws);
  }
  const added = MultiRepoService.addRepository(req.params.projectId, req.user.uid, {
    ...repo,
    id: repo.id || `repo-${Date.now()}`,
    permissions: repo.permissions || { canRead: true, canWrite: true, canPush: false }
  });
  res.json({ success: added, workspace: MultiRepoService.getWorkspace(req.params.projectId, req.user.uid) });
});

// ==========================================
// 12. MULTI-AGENT COORDINATOR API
// ==========================================
milestone9Router.post('/projects/:projectId/coordinate', requireAuth, asyncRoute(async (req: any, res) => {
  const { goal, tasks } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'Goal is required.' });
  const result = await MultiAgentCoordinator.coordinate(
    goal,
    Array.isArray(tasks) ? tasks : [],
    { userId: req.user.uid, projectId: req.params.projectId }
  );
  res.json(result);
}));

// ==========================================
// 13. CONVERSATION SEARCH API
// ==========================================
milestone9Router.get('/conversations/search', requireAuth, (req: any, res) => {
  const q = String(req.query.q || '');
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  const modelId = req.query.modelId ? String(req.query.modelId) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  const result = ConversationSearchService.search(req.user.uid, {
    queryText: q,
    projectId,
    modelId,
    limit,
    offset
  });
  res.json(result);
});
