/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { RulesService } from '../src/server/rules/rulesService';

describe('Rules Service (Cascading .floatrules Injection)', () => {
  it('registers and retrieves user-level rule', () => {
    RulesService.setUserRule('user-1', {
      id: 'rule-typescript',
      name: 'TypeScript Only',
      content: 'Always use strict TypeScript with explicit types.',
      priority: 1,
      enabled: true,
    });

    const effective = RulesService.getEffectiveRules({ userId: 'user-1' });
    expect(effective.some(r => r.id === 'rule-typescript')).toBe(true);
    expect(effective.find(r => r.id === 'rule-typescript')?.content).toContain('strict TypeScript');
  });

  it('layers project-level rules over user rules', () => {
    RulesService.setProjectRule('proj-1', {
      id: 'rule-styling',
      name: 'Tailwind CSS',
      content: 'Use Tailwind CSS utility classes.',
      priority: 2,
      enabled: true,
    }, 'user-1');

    const effective = RulesService.getEffectiveRules({ userId: 'user-1', projectId: 'proj-1' });
    expect(effective.some(r => r.id === 'rule-typescript')).toBe(true);
    expect(effective.some(r => r.id === 'rule-styling')).toBe(true);
  });
});
