// packages/testing/src/common/payloadGenerator.ts

/**
 * @fileoverview Generate test payloads from the entity descriptor
 * @description Write classes and value kinds come from `describeEntity`; values are
 * sampled per kind (`sampleValues.ts`) and checked against each field's schema.
 * No table by field type; an unknown or unsatisfiable field throws.
 *
 * @version 0.2.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { describeEntity } from '@donotdev/core';
import type { AnyEntity, EntityField, FieldDescriptor } from '@donotdev/core';

import { sampleValue } from './sampleValues';

// ============================================================================
// Helpers
// ============================================================================

/**
 * True when the create payload carries the field: every write class but `never`
 * (`user`, `derived`, `program`: the fields of `createSchemas(entity).create`).
 * `status` is left out so the create gets `DEFAULT_STATUS_VALUE`.
 */
function isWritten(name: string, descriptor: FieldDescriptor): boolean {
  return name !== 'status' && descriptor.write !== 'never';
}

/**
 * Returns true if the field holds a file/image that needs upload
 */
export function isFileField(field: EntityField): boolean {
  return [
    'image',
    'images',
    'file',
    'files',
    'document',
    'documents',
    'avatar',
  ].includes(field.type);
}

/**
 * Returns true if the field is a multi-file field
 */
export function isMultiFileField(field: EntityField): boolean {
  return ['images', 'files', 'documents'].includes(field.type);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a test create payload for an entity, from its descriptor
 * (`describeEntity`): fields of the create schema (write classes `user`,
 * `derived`, `program`), minus `status` (the create gets `DEFAULT_STATUS_VALUE`)
 * and file fields (uploaded separately). Each value is sampled per value kind and
 * checked against the field's value schema.
 *
 * @param entity - Entity from `defineEntity()`
 * @param overrides - Values that replace generated ones (extra keys, e.g. scope fields, are kept)
 * @returns The payload
 * @throws When a field has no value overrides can supply and no sample passes its
 * schema (e.g. a required reference): names `entity.field`
 *
 * @version 0.2.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */
export function generatePayload(
  entity: AnyEntity,
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  const descriptor = describeEntity(entity);
  const payload: Record<string, unknown> = {};
  let index = 0;

  for (const [key, field] of Object.entries(entity.fields)) {
    const described = descriptor.fields[key];
    if (!described || !isWritten(key, described)) continue;

    // Skip file fields — they're tested separately via storage
    if (isFileField(field)) continue;

    if (overrides && key in overrides) {
      payload[key] = overrides[key];
      continue;
    }

    // A reference needs a real row id: required → the caller passes it
    if (described.value.kind === 'ref') {
      if (described.required === 'always') {
        throw new Error(
          `${entity.name}.${key}: required reference; pass its id in overrides`
        );
      }
      continue;
    }

    payload[key] = sampleValue(
      {
        entity: entity.name,
        name: key,
        label: field.label,
        value: described.value,
        validation: field.validation,
      },
      { index: index++, rand: () => 0.5 }
    );
  }

  // Merge remaining overrides (may include fields not in entity — e.g. scope fields)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (!(key in payload)) {
        payload[key] = value;
      }
    }
  }

  return payload;
}

/**
 * Extract the file fields the create payload writes (uploaded by the test runner).
 *
 * @param entity - Entity from `defineEntity()`
 * @returns File / image fields of write classes `user`, `derived`, `program`
 *
 * @version 0.2.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */
export function getFileFields(entity: AnyEntity): EntityField[] {
  const descriptor = describeEntity(entity);
  return Object.entries(entity.fields)
    .filter(([key, field]) => {
      const described = descriptor.fields[key];
      return !!described && isWritten(key, described) && isFileField(field);
    })
    .map(([, field]) => field);
}
