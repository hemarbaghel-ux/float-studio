/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { MODEL_REGISTRY, getModelDescriptor, listSelectableModels } from '../src/server/providers/modelRegistry';
import { modelRouter } from '../src/server/providers/router';

describe('Model Gateway & Dynamic Model Registry', () => {
  it('loads valid model descriptors with declared capabilities', () => {
    expect(MODEL_REGISTRY.length).toBeGreaterThan(0);

    for (const descriptor of MODEL_REGISTRY) {
      expect(descriptor.id).toBeDefined();
      expect(descriptor.displayName).toBeDefined();
      expect(descriptor.providerId).toMatch(/^(openai|google|anthropic)$/);
      expect(descriptor.contextWindow).toBeGreaterThan(0);
      expect(descriptor.maxOutputTokens).toBeGreaterThan(0);
      expect(descriptor.capabilities).toBeDefined();
      expect(typeof descriptor.capabilities.tools).toBe('boolean');
      expect(typeof descriptor.capabilities.streaming).toBe('boolean');
    }
  });

  it('filters selectable models and excludes retired models', () => {
    const selectable = listSelectableModels();
    expect(selectable.length).toBeGreaterThan(0);

    for (const model of selectable) {
      expect(model.selectable).toBe(true);
    }
  });

  it('retrieves descriptor by model id or returns undefined for non-existent id', () => {
    const firstModel = MODEL_REGISTRY[0];
    const retrieved = getModelDescriptor(firstModel.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(firstModel.id);

    const nonExistent = getModelDescriptor('non_existent_model_id');
    expect(nonExistent).toBeUndefined();
  });

  it('resolves abstract role aliases into verified model IDs', () => {
    expect(modelRouter.resolveModelId('fast_coding')).toBeDefined();
    expect(modelRouter.resolveModelId('autocomplete')).toBeDefined();
    expect(modelRouter.resolveModelId('reasoning')).toBeDefined();
    expect(modelRouter.resolveModelId('composer')).toBeDefined();
    expect(modelRouter.resolveModelId('auto')).toBeDefined();
  });
});
