/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type FimTemplateFamily = 'deepseek' | 'starcoder' | 'codellama' | 'chat';

export interface FimPromptFormatting {
  readonly prompt: string;
  readonly stopTokens: readonly string[];
  readonly template: FimTemplateFamily;
}

export interface FimCompletionRequest {
  readonly prefix: string;
  readonly suffix: string;
  readonly language?: string;
  readonly fileName?: string;
  readonly model?: string;
  readonly fimEndpoint?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly userApiKeys?: Record<string, string>;
}

export interface FimCompletionResult {
  readonly completion: string;
  readonly latencyMs: number;
  readonly template: FimTemplateFamily;
  readonly speculativeCacheHit: boolean;
  readonly raw?: string;
}

interface SpeculativeCacheEntry {
  readonly fileName: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly fullCompletion: string;
  readonly createdAt: number;
}

export class FimCompletionEngine {
  private readonly speculativeCache = new Map<string, SpeculativeCacheEntry>();
  private readonly maxSpeculativeEntries = 64;

  /**
   * Automatically detect the optimal FIM prompt formatting template
   * based on the model identifier.
   */
  public detectFimTemplate(modelName: string): FimTemplateFamily {
    const norm = (modelName || '').toLowerCase();
    if (norm.includes('starcoder') || norm.includes('santacoder')) {
      return 'starcoder';
    }
    if (norm.includes('codellama') || norm.includes('llama-code')) {
      return 'codellama';
    }
    if (
      norm.includes('deepseek') ||
      norm.includes('qwen') ||
      norm.includes('codeqwen') ||
      norm.includes('fim') ||
      norm.includes('cursor')
    ) {
      return 'deepseek';
    }
    return 'chat';
  }

  /**
   * Formats raw FIM prefix/suffix strings into provider-specific tokens
   * to eliminate chat formatting overhead and prevent markdown block wrapping.
   */
  public formatFimPrompt(
    prefix: string,
    suffix: string,
    modelName: string = 'deepseek-coder'
  ): FimPromptFormatting {
    const template = this.detectFimTemplate(modelName);

    switch (template) {
      case 'deepseek':
        return {
          prompt: `<｜fim begin｜>${prefix}<｜fim hole｜>${suffix}<｜fim end｜>`,
          stopTokens: [
            '<｜fim begin｜>',
            '<｜fim hole｜>',
            '<｜fim end｜>',
            '<|endoftext|>',
            '<|file_separator|>',
            '\n\n\n'
          ],
          template,
        };

      case 'starcoder':
        return {
          prompt: `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`,
          stopTokens: [
            '<fim_prefix>',
            '<fim_suffix>',
            '<fim_middle>',
            '<|endoftext|>',
            '<file_sep>',
            '\n\n\n'
          ],
          template,
        };

      case 'codellama':
        return {
          prompt: `<PRE> ${prefix} <SUF>${suffix} <MID>`,
          stopTokens: [
            '<PRE>',
            '<SUF>',
            '<MID>',
            '<EOT>',
            '\n\n\n'
          ],
          template,
        };

      case 'chat':
      default:
        return {
          prompt: `You are a high-speed code completion engine. Continue the code exactly where the cursor is located between <PREFIX> and <SUFFIX>.
Output ONLY the code continuation to be inserted directly at the cursor. Do not output markdown, do not output backticks, and do not repeat the prefix or suffix.
<PREFIX>
${prefix}
</PREFIX>
<SUFFIX>
${suffix}
</SUFFIX>`,
          stopTokens: ['</PREFIX>', '<PREFIX>', '</SUFFIX>', '```'],
          template: 'chat',
        };
    }
  }

  /**
   * Checks whether the user's keystrokes match an existing completion in the cache.
   * If the user typed 1 to N characters that match the start of the predicted completion,
   * returns the remaining substring instantly (0ms latency, zero API roundtrips).
   */
  public matchSpeculativeKeystroke(
    fileName: string,
    currentPrefix: string,
    currentSuffix: string
  ): string | null {
    const entry = this.speculativeCache.get(fileName);
    if (!entry) return null;

    // Cache valid for 15 seconds
    if (Date.now() - entry.createdAt > 15_000) {
      this.speculativeCache.delete(fileName);
      return null;
    }

    // Must still match original suffix
    if (currentSuffix !== entry.suffix) {
      return null;
    }

    // currentPrefix must start with entry.prefix
    if (!currentPrefix.startsWith(entry.prefix)) {
      return null;
    }

    const typedDelta = currentPrefix.slice(entry.prefix.length);
    if (typedDelta.length === 0) {
      return entry.fullCompletion;
    }

    // If typed delta is an exact prefix of entry.fullCompletion, return the rest!
    if (entry.fullCompletion.startsWith(typedDelta)) {
      return entry.fullCompletion.slice(typedDelta.length);
    }

    return null;
  }

  /**
   * Records a speculative completion entry for fast keystroke matching.
   */
  public recordSpeculative(
    fileName: string,
    prefix: string,
    suffix: string,
    fullCompletion: string
  ): void {
    if (!fileName || !fullCompletion) return;
    if (this.speculativeCache.size >= this.maxSpeculativeEntries) {
      const oldestKey = this.speculativeCache.keys().next().value;
      if (oldestKey) this.speculativeCache.delete(oldestKey);
    }
    this.speculativeCache.set(fileName, {
      fileName,
      prefix,
      suffix,
      fullCompletion,
      createdAt: Date.now(),
    });
  }

  /**
   * Deduplicates completion tail if it collides with existing code immediately
   * following the cursor in suffix. Prevents duplicate brackets, semicolons, or lines.
   */
  public deduplicateSuffix(completion: string, suffix: string): string {
    if (!completion || !suffix) return completion;

    const trimmedSuffix = suffix.trimStart();
    if (!trimmedSuffix) return completion;

    // If completion ends with leading characters of suffix, slice the overlap
    const maxOverlap = Math.min(completion.length, 64);
    for (let len = maxOverlap; len > 0; len--) {
      const completionTail = completion.slice(-len);
      if (trimmedSuffix.startsWith(completionTail)) {
        return completion.slice(0, -len);
      }
    }

    return completion;
  }

  /**
   * Cleans model output by stripping markdown code blocks, FIM special tokens,
   * and trailing prompt echoes.
   */
  public cleanCompletionOutput(rawText: string): string {
    let text = rawText || '';

    // Strip markdown code fences if emitted
    text = text.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '');
    text = text.replace(/\r?\n?```\s*$/, '');

    // Strip special tokens that might leak through
    text = text.replace(/<｜fim (?:begin|hole|end)｜>/g, '');
    text = text.replace(/<fim_(?:prefix|suffix|middle)>/g, '');
    text = text.replace(/<(?:PRE|SUF|MID|EOT)>/g, '');
    text = text.replace(/<\|endoftext\|>/g, '');
    text = text.replace(/<\|file_separator\|>/g, '');

    return text;
  }

  /**
   * Execute low-latency FIM completion.
   * If a dedicated FIM endpoint is provided (FLOAT_FIM_ENDPOINT or options.fimEndpoint),
   * calls Ollama / vLLM / llama.cpp directly via raw completion.
   * Otherwise falls back to the active model router.
   */
  public async complete(
    req: FimCompletionRequest,
    options?: {
      modelRouter?: any;
    }
  ): Promise<FimCompletionResult> {
    const {
      prefix = '',
      suffix = '',
      fileName = 'active_file',
      model = 'gpt-4o-mini',
      fimEndpoint = process.env.FLOAT_FIM_ENDPOINT,
      maxTokens = 128,
      temperature = 0.1,
    } = req;

    // 1. Check speculative keystroke cache
    const speculativeMatch = this.matchSpeculativeKeystroke(fileName, prefix, suffix);
    if (speculativeMatch !== null) {
      return {
        completion: speculativeMatch,
        latencyMs: 0,
        template: this.detectFimTemplate(model),
        speculativeCacheHit: true,
      };
    }

    const startMs = Date.now();
    const formatting = this.formatFimPrompt(prefix, suffix, model);
    let rawOutput = '';

    // 2. Query dedicated FIM endpoint if configured
    if (fimEndpoint) {
      try {
        const parsedUrl = new URL(fimEndpoint);
        const isOllama = parsedUrl.pathname.includes('/api/generate') || parsedUrl.port === '11434';

        if (isOllama) {
          // Ollama raw generation format
          const targetUrl = parsedUrl.pathname === '/' ? `${fimEndpoint.replace(/\/$/, '')}/api/generate` : fimEndpoint;
          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: formatting.prompt,
              raw: true,
              stream: false,
              options: {
                stop: formatting.stopTokens,
                temperature,
                num_predict: maxTokens,
              },
            }),
          });
          if (res.ok) {
            const data: any = await res.json();
            rawOutput = data.response || '';
          }
        } else {
          // OpenAI-compatible /v1/completions endpoint (e.g. vLLM, llama.cpp, LocalAI)
          const targetUrl = parsedUrl.pathname === '/' ? `${fimEndpoint.replace(/\/$/, '')}/v1/completions` : fimEndpoint;
          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: formatting.prompt,
              max_tokens: maxTokens,
              temperature,
              stop: formatting.stopTokens,
            }),
          });
          if (res.ok) {
            const data: any = await res.json();
            rawOutput = data.choices?.[0]?.text || '';
          }
        }
      } catch (err: any) {
        console.warn(`[FimCompletionEngine] Dedicated FIM endpoint failed: ${err?.message || err}. Falling back to model router.`);
      }
    }

    // 3. Fallback to modelRouter if dedicated endpoint was not configured or failed
    if (!rawOutput && options?.modelRouter) {
      const result = await options.modelRouter.generateContent({
        model: model && model !== 'gpt-6-astra' ? model : 'gpt-4o-mini',
        messages: [{ role: 'user', content: formatting.prompt }],
        speed: 'fast',
        systemInstruction: 'You are an inline code autocompletion engine. Output only the immediate completion code without markdown fences.',
        userApiKeys: req.userApiKeys,
      });
      rawOutput = result.text || '';
    }

    const cleaned = this.cleanCompletionOutput(rawOutput);
    const finalCompletion = this.deduplicateSuffix(cleaned, suffix);
    const latencyMs = Date.now() - startMs;

    // Record in speculative cache for subsequent keystrokes
    if (finalCompletion) {
      this.recordSpeculative(fileName, prefix, suffix, finalCompletion);
    }

    return {
      completion: finalCompletion,
      latencyMs,
      template: formatting.template,
      speculativeCacheHit: false,
      raw: rawOutput,
    };
  }
}

export const defaultFimEngine = new FimCompletionEngine();
