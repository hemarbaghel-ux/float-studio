/**
 * FLOAT Studio - VSCodium Backend API Client
 *
 * Implements:
 * 1. Real progressive SSE streaming from FLOAT's backend (/api/ai/chat).
 * 2. Strict authentication & authorization header injection (Bearer token).
 * 3. Client-side stream cancellation via AbortController.
 * 4. Comprehensive error handling (401 Auth, 403 Forbidden, 429 Rate Limit, Network failure).
 * 5. Strict conversation and project isolation (zero cross-talk between conversations).
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ConversationState {
  id: string;
  projectId: string;
  messages: ChatMessage[];
  activeProposalId?: string;
  createdAt: number;
}

export interface StreamCallbacks {
  onDelta?: (delta: string) => void;
  onContext?: (contextInfo: any) => void;
  onDone?: (fullText: string, usage?: any) => void;
  onError?: (error: Error) => void;
  onCancelled?: () => void;
}

export class FloatApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private currentProjectId: string = 'default-project';
  private activeConversationId: string;
  private conversations: Map<string, ConversationState> = new Map();
  private activeAbortController: AbortController | null = null;

  constructor(baseUrl: string = 'http://localhost:3000', defaultProjectId: string = 'default-project') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.currentProjectId = defaultProjectId;
    this.activeConversationId = `conv-${Date.now()}`;
    this.initConversation(this.activeConversationId, defaultProjectId);
  }

  // --- Configuration ---
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    const active = this.conversations.get(this.activeConversationId);
    if (active) {
      active.projectId = projectId;
    } else {
      this.initConversation(this.activeConversationId, projectId);
    }
  }

  getProjectId(): string {
    return this.currentProjectId;
  }

  // --- Conversation Isolation ---
  private initConversation(conversationId: string, projectId: string): ConversationState {
    const conv: ConversationState = {
      id: conversationId,
      projectId,
      messages: [],
      createdAt: Date.now()
    };
    this.conversations.set(conversationId, conv);
    return conv;
  }

  getActiveConversation(): ConversationState {
    let conv = this.conversations.get(this.activeConversationId);
    if (!conv) {
      conv = this.initConversation(this.activeConversationId, this.currentProjectId);
    }
    return conv;
  }

  switchConversation(conversationId: string): ConversationState {
    this.cancelActiveStream();
    let conv = this.conversations.get(conversationId);
    if (!conv) {
      conv = this.initConversation(conversationId, this.currentProjectId);
    }
    this.activeConversationId = conversationId;
    return conv;
  }

  createNewConversation(projectId?: string): ConversationState {
    this.cancelActiveStream();
    const newId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conv = this.initConversation(newId, projectId || this.currentProjectId);
    this.activeConversationId = newId;
    return conv;
  }

  listConversations(projectId?: string): ConversationState[] {
    const list = Array.from(this.conversations.values());
    if (projectId) {
      return list.filter(c => c.projectId === projectId);
    }
    return list;
  }

  // --- Authentication Probe ---
  async checkHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const url = `${this.baseUrl}/api/health`;
      const res = await this.makeRequest(url, 'GET');
      return { ok: res.statusCode === 200, status: res.statusCode };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  // --- Streaming Chat with Cancellation and Error Handling ---
  async streamChat(
    userPrompt: string,
    contextItems: Array<{ path: string; content: string }> = [],
    callbacks: StreamCallbacks = {},
    model: string = 'gpt-6.1-sol'
  ): Promise<string> {
    const conv = this.getActiveConversation();

    // Append user message to active conversation history
    conv.messages.push({ role: 'user', content: userPrompt });

    // Cancel any previous stream
    this.cancelActiveStream();

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const requestPayload = {
      stream: true,
      model,
      projectId: conv.projectId,
      conversationId: conv.id,
      messages: conv.messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      })),
      contextItems
    };

    return new Promise<string>((resolve, reject) => {
      const parsedUrl = new URL(`${this.baseUrl}/api/ai/chat`);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      };

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const postData = JSON.stringify(requestPayload);
      headers['Content-Length'] = Buffer.byteLength(postData).toString();

      const req = transport.request(
        parsedUrl,
        {
          method: 'POST',
          headers,
          signal: abortController.signal
        },
        (res) => {
          abortController.signal.addEventListener('abort', () => {
            try { res.destroy(); } catch {}
          });
          const statusCode = res.statusCode || 500;

          // Error handling based on status codes
          if (statusCode === 401) {
            const err = new Error('Authentication required. Missing or invalid authentication token.');
            (err as any).statusCode = 401;
            callbacks.onError?.(err);
            return reject(err);
          }

          if (statusCode === 403) {
            const err = new Error(`Permission denied. You do not have authorized access to project "${conv.projectId}".`);
            (err as any).statusCode = 403;
            callbacks.onError?.(err);
            return reject(err);
          }

          if (statusCode === 429) {
            const err = new Error('Rate limit exceeded. Please wait a moment before sending another request.');
            (err as any).statusCode = 429;
            callbacks.onError?.(err);
            return reject(err);
          }

          if (statusCode >= 400) {
            let errorBody = '';
            res.on('data', chunk => { errorBody += chunk.toString(); });
            res.on('end', () => {
              let parsedMsg = errorBody;
              try {
                const json = JSON.parse(errorBody);
                parsedMsg = json.error || json.message || errorBody;
              } catch {}
              const err = new Error(`FLOAT Server Error (${statusCode}): ${parsedMsg}`);
              (err as any).statusCode = statusCode;
              callbacks.onError?.(err);
              reject(err);
            });
            return;
          }

          // Progressive SSE chunk stream processing
          let fullResponseText = '';
          let sseBuffer = '';

          res.setEncoding('utf8');

          res.on('data', (chunk: string) => {
            if (abortController.signal.aborted) return;
            sseBuffer += chunk;

            const lines = sseBuffer.split('\n\n');
            sseBuffer = lines.pop() || ''; // Keep incomplete trailing chunk

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();

              try {
                const event = JSON.parse(jsonStr);

                if (event.type === 'delta' && typeof event.text === 'string') {
                  fullResponseText += event.text;
                  callbacks.onDelta?.(event.text);
                } else if (event.type === 'context_info') {
                  callbacks.onContext?.(event.contextExplanation);
                } else if (event.type === 'done') {
                  const finalText = event.text || fullResponseText;
                  conv.messages.push({ role: 'model', content: finalText });
                  callbacks.onDone?.(finalText, event.usage);
                  this.activeAbortController = null;
                  resolve(finalText);
                } else if (event.type === 'error') {
                  const err = new Error(event.error || 'Server stream error');
                  callbacks.onError?.(err);
                  this.activeAbortController = null;
                  reject(err);
                }
              } catch (parseErr) {
                // Skip malformed SSE line safely
              }
            }
          });

          res.on('end', () => {
            this.activeAbortController = null;
            if (!fullResponseText && !abortController.signal.aborted) {
              const err = new Error('Server closed stream without emitting content.');
              callbacks.onError?.(err);
              reject(err);
            }
          });

          res.on('error', (err) => {
            this.activeAbortController = null;
            if (abortController.signal.aborted) {
              callbacks.onCancelled?.();
              resolve('');
            } else {
              callbacks.onError?.(err);
              reject(err);
            }
          });
        }
      );

      req.on('error', (err: any) => {
        this.activeAbortController = null;
        if (abortController.signal.aborted || err.name === 'AbortError') {
          callbacks.onCancelled?.();
          resolve('');
        } else {
          const networkErr = new Error(`Connection to FLOAT backend failed at ${this.baseUrl}: ${err.message}`);
          callbacks.onError?.(networkErr);
          reject(networkErr);
        }
      });

      // Write payload
      req.write(postData);
      req.end();
    });
  }

  // --- Cancellation ---
  cancelActiveStream(): boolean {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      return true;
    }
    return false;
  }

  isStreaming(): boolean {
    return this.activeAbortController !== null;
  }

  private makeRequest(urlStr: string, method: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {};
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const req = transport.request(parsedUrl, { method, headers }, (res) => {
        resolve(res);
      });
      req.on('error', reject);
      req.end();
    });
  }
}
