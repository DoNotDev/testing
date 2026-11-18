// packages/testing/src/client/__tests__/testEntity.test.ts

/**
 * @fileoverview testEntity update step: the role it writes as
 * @description Default role = `entity.access.update` (the most restrictive role
 * that can update), not `super`: the updated field is one that role may edit. An
 * explicit `role` picks its own fields; a role below `access.update` fails the step.
 */

import { describe, it, expect, vi } from 'vitest';

import type { ICrudAdapter } from '@donotdev/core';

import { testEntity } from '../testEntity';
import { superOnlyFieldEntity as note } from '@dndev/test-entities';


function crud() {
  const update = vi.fn(async () => undefined);
  const adapter = {
    add: vi.fn(async () => ({ id: 'n1' })),
    get: vi.fn(async () => ({ id: 'n1' })),
    query: vi.fn(async () => ({ items: [{ id: 'n1' }], hasMore: false })),
    update,
    delete: vi.fn(async () => undefined),
  } as unknown as ICrudAdapter;
  return { adapter, update };
}

const run = (role?: 'guest' | 'user' | 'admin' | 'super') => {
  const { adapter, update } = crud();
  const result = testEntity(note, { providers: { crud: adapter }, skip: ['get', 'list', 'listCard'], ...(role ? { role } : {}) });
  return { result, update };
};

describe('testEntity — update role', () => {
  it('defaults to access.update: never writes a super-only field', async () => {
    const { result, update } = run();
    const r = await result;
    expect(r.steps.find((s) => s.step === 'update')?.passed).toBe(true);
    expect(update).toHaveBeenCalledWith('super_notes', 'n1', { title: expect.any(String) });
  });

  it('an explicit role picks the fields it may edit', async () => {
    const { result, update } = run('super');
    await result;
    expect(update).toHaveBeenCalledWith('super_notes', 'n1', { superOnly: expect.any(String) });
  });

  it('a role below access.update fails the update step', async () => {
    const { result, update } = run('user');
    const step = (await result).steps.find((s) => s.step === 'update');
    expect(step).toMatchObject({ passed: false, error: expect.stringContaining("role 'user' cannot update Note") });
    expect(update).not.toHaveBeenCalled();
  });
});
