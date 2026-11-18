// packages/testing/src/common/__tests__/payloadGenerator.test.ts

/**
 * @fileoverview Payload generator reads the descriptor: write classes decide the
 * keys, value kinds + schemas decide the values, unknown / unsatisfiable fields throw.
 */

import * as v from 'valibot';
import { describe, it, expect } from 'vitest';

import { createSchemas, DEFAULT_STATUS_VALUE } from '@donotdev/core';

import { generatePayload, getFileFields } from '../payloadGenerator';
import { sampleValue } from '../sampleValues';
import { payloadEntity as product, requiredReferenceEntity, sampleTypesEntity, unsatisfiablePatternEntity } from '@dndev/test-entities';


describe('generatePayload (descriptor)', () => {
  it('writes classes user, derived and program; never class, status and files left out', () => {
    const payload = generatePayload(product);
    expect(Object.keys(payload).sort()).toEqual(
      ['address', 'email', 'kind', 'name', 'opensAt', 'paidAt', 'phone', 'price', 'qty', 'total', 'week'].sort()
    );
    expect(getFileFields(product).map((f) => f.name)).toEqual(['photo']);
  });

  it('every generated payload passes the create schema (status: DEFAULT_STATUS_VALUE, added on create)', () => {
    const payload = generatePayload(product);
    expect(v.safeParse(createSchemas(product).create, { ...payload, status: DEFAULT_STATUS_VALUE }).success).toBe(true);
    expect(payload.qty).toBeGreaterThanOrEqual(5);
    expect(Number.isInteger(payload.qty)).toBe(true);
  });

  it('a required reference must come from overrides', () => {
    const order = requiredReferenceEntity;
    expect(() => generatePayload(order)).toThrow(/Order\.productId/);
    expect(generatePayload(order, { productId: 'p1' })).toEqual({ productId: 'p1' });
  });

  it('a value no sample satisfies throws, naming entity.field', () => {
    const odd = unsatisfiablePatternEntity;
    expect(() => generatePayload(odd)).toThrow(/Odd\.code.*cannot generate/);
    expect(generatePayload(odd, { code: 'ZZ123456789' })).toEqual({ code: 'ZZ123456789' });
  });
});

describe('sampleValue per kind', () => {
  it('produces a value accepted by every built-in type with no constraints', () => {
    // sampleTypesEntity: one optional guest field per built-in type with a sample (not
    // reference, submit, reset).
    const payload = generatePayload(sampleTypesEntity);
    const { create } = createSchemas(sampleTypesEntity);
    const entries = (create as unknown as { entries: Record<string, v.GenericSchema> }).entries;
    for (const [name, value] of Object.entries(payload)) {
      const type = sampleTypesEntity.fields[name]!.type;
      expect({ type, ok: v.safeParse(entries[name]!, value).success }).toEqual({ type, ok: true });
    }
    expect(v.safeParse(create, { ...payload, status: DEFAULT_STATUS_VALUE }).success).toBe(true);
  });

  it('ref kind has no sample', () => {
    expect(() =>
      sampleValue({ entity: 'E', name: 'r', value: { kind: 'ref', schema: v.string() } }, { index: 0, rand: () => 0.5 })
    ).toThrow(/E\.r/);
  });
});
