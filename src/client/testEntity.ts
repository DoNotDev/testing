// packages/testing/src/client/testEntity.ts

/**
 * @fileoverview Full CRUD flow test for an entity: create → get → list → listCard → update → delete
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { EDITABLE, type Entity, type EntityField } from '@donotdev/core';

import type {
  TestEntityOptions,
  TestEntityResult,
  TestStepResult,
  TestStep,
} from '../common/types';
import {
  generatePayload,
  getFileFields,
  isMultiFileField,
} from '../common/payloadGenerator';
import { reportEntity } from '../common/reporter';
import { createTestImageBlob, createTestFileBlob } from './testStorage';

// ============================================================================
// Step runner
// ============================================================================

async function runStep(
  step: TestStep,
  fn: () => Promise<unknown>
): Promise<TestStepResult> {
  const start = performance.now();
  try {
    const data = await fn();
    return {
      step,
      passed: true,
      duration: Math.round(performance.now() - start),
      data,
    };
  } catch (err) {
    return {
      step,
      passed: false,
      duration: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
      errorDetail: err,
    };
  }
}

// ============================================================================
// File upload testing
// ============================================================================

async function uploadTestFiles(
  fileFields: EntityField[],
  storage: NonNullable<TestEntityOptions['providers']['storage']>,
  storagePath?: string,
  signal?: AbortSignal
): Promise<{ results: TestStepResult[]; values: Record<string, unknown> }> {
  const results: TestStepResult[] = [];
  const values: Record<string, unknown> = {};

  for (const field of fileFields) {
    const isImage = ['image', 'images', 'avatar'].includes(field.type);
    const isMulti = isMultiFileField(field);
    const fieldStoragePath =
      (field.options as any)?.fieldSpecific?.storagePath ?? storagePath;

    const stepName: TestStep = isImage ? 'upload-image' : 'upload-file';

    const result = await runStep(stepName, async () => {
      const blob = isImage ? createTestImageBlob() : createTestFileBlob();
      const ext = isImage ? 'png' : 'txt';
      const filename = `dndev_test_${field.name}_${Date.now()}.${ext}`;

      console.log(
        `  [${field.name}] uploading to ${fieldStoragePath ?? '(root)'}/${filename}`
      );

      const uploadResult = await storage.upload(blob, {
        storagePath: fieldStoragePath,
        filename,
        signal,
        onProgress: (pct) => {
          console.log(`  [${field.name}] progress: ${pct}%`);
        },
      });

      console.log(
        `  [${field.name}] uploaded: url=${uploadResult.url}, path=${uploadResult.path}`
      );

      // Image fields expect Picture shape, file fields expect FileAsset shape
      if (isImage) {
        const picture = {
          fullUrl: uploadResult.url,
          thumbUrl: uploadResult.url,
        };
        values[field.name] = isMulti ? [picture] : picture;
      } else {
        const asset = {
          url: uploadResult.url,
          filename,
          size: blob.size,
          mimeType: blob.type,
        };
        values[field.name] = isMulti ? [asset] : asset;
      }

      return uploadResult;
    });

    results.push({ ...result, step: `${stepName}` as TestStep });

    // If upload failed, still add empty value to prevent create from failing on missing required field
    if (!result.passed) {
      values[field.name] = isMulti ? [] : null;
    }
  }

  return { results, values };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run a full CRUD integration test on an entity.
 *
 * @example
 * ```ts
 * import { testEntity } from '@donotdev/testing';
 * import { apartmentEntity } from '../../entities/apartment';
 *
 * const result = await testEntity(apartmentEntity, {
 *   providers: { crud, storage, callable },
 * });
 * ```
 */
export async function testEntity(
  entity: Entity,
  options: TestEntityOptions
): Promise<TestEntityResult> {
  const {
    providers,
    payload: overrides,
    cleanup = true,
    skip = [],
    storagePath,
    signal,
  } = options;
  const { crud } = providers;
  const collection = entity.collection;
  const totalStart = performance.now();
  const steps: TestStepResult[] = [];
  let createdId: string | undefined;

  // ── Step 0: Generate payload ──────────────────────────────────────────

  const genResult = await runStep('generate-payload', async () => {
    return generatePayload(entity.fields, overrides);
  });
  steps.push(genResult);

  if (!genResult.passed) {
    return buildResult(
      entity,
      collection,
      steps,
      createdId,
      undefined,
      totalStart
    );
  }

  let payload = genResult.data as Record<string, unknown>;

  // ── Step 0b: Upload test files (if storage provided + entity has file fields) ──

  const fileFields = getFileFields(entity.fields);
  if (fileFields.length > 0 && providers.storage) {
    const { results: uploadResults, values: fileValues } =
      await uploadTestFiles(fileFields, providers.storage, storagePath, signal);
    steps.push(...uploadResults);
    payload = { ...payload, ...fileValues };
  } else if (fileFields.length > 0 && !providers.storage) {
    console.log(
      `  [warn] Entity has ${fileFields.length} file field(s) but no storage provider — skipping uploads`
    );
  }

  // ── Step 1: Create ────────────────────────────────────────────────────

  if (!skip.includes('create')) {
    const createResult = await runStep('create', async () => {
      console.log(
        `  [create] ${collection} — ${Object.keys(payload).length} fields`
      );
      const result = await crud.add(collection, payload);
      createdId = result.id;
      console.log(`  [create] id=${result.id}`);
      return result;
    });
    steps.push(createResult);

    if (!createResult.passed) {
      return buildResult(
        entity,
        collection,
        steps,
        createdId,
        payload,
        totalStart
      );
    }
  }

  // ── Step 2: Get ───────────────────────────────────────────────────────

  if (!skip.includes('get') && createdId) {
    const getResult = await runStep('get', async () => {
      const doc = await crud.get(collection, createdId!);
      if (!doc) throw new Error(`get returned null for id=${createdId}`);
      console.log(
        `  [get] found, keys: ${Object.keys(doc as object).join(', ')}`
      );
      return doc;
    });
    steps.push(getResult);
  }

  // ── Step 3: List (query) ──────────────────────────────────────────────

  if (!skip.includes('list')) {
    const listResult = await runStep('list', async () => {
      const result = await crud.query(collection, { limit: 5 });
      console.log(
        `  [list] items=${result.items.length}, hasMore=${result.hasMore}`
      );
      if (createdId) {
        const found = result.items.some((item: any) => item.id === createdId);
        if (!found) {
          console.log(
            `  [list] WARNING: created entity not found in list results`
          );
        }
      }
      return result;
    });
    steps.push(listResult);
  }

  // ── Step 4: ListCard (query with listCard schema type) ────────────────

  if (!skip.includes('listCard')) {
    const listCardResult = await runStep('listCard', async () => {
      const result = await crud.query(
        collection,
        { limit: 5 },
        undefined,
        'listCard'
      );
      console.log(
        `  [listCard] items=${result.items.length}, hasMore=${result.hasMore}`
      );
      return result;
    });
    steps.push(listCardResult);
  }

  // ── Step 5: Update ────────────────────────────────────────────────────

  if (!skip.includes('update') && createdId) {
    const updateResult = await runStep('update', async () => {
      // Find a simple text field to update
      const textField = Object.values(entity.fields).find(
        (f) =>
          f.type === 'text' &&
          f.editable !== false &&
          f.editable !== EDITABLE.GENERATED &&
          f.editable !== EDITABLE.COMPUTED &&
          f.editable !== EDITABLE.CREATE_ONLY &&
          f.visibility !== 'hidden' &&
          f.visibility !== 'technical'
      );
      const updateData: Record<string, unknown> = textField
        ? { [textField.name]: `updated_${Date.now().toString(36)}` }
        : {};

      if (Object.keys(updateData).length === 0) {
        console.log(
          `  [update] no updatable text field found, skipping update data`
        );
        return { skipped: true };
      }

      console.log(
        `  [update] ${createdId} — fields: ${Object.keys(updateData).join(', ')}`
      );
      await crud.update(collection, createdId!, updateData);
      return updateData;
    });
    steps.push(updateResult);
  }

  // ── Step 6: Delete ────────────────────────────────────────────────────

  if (!skip.includes('delete') && createdId && cleanup) {
    const deleteResult = await runStep('delete', async () => {
      console.log(`  [delete] ${createdId}`);
      await crud.delete(collection, createdId!);
    });
    steps.push(deleteResult);
  }

  return buildResult(entity, collection, steps, createdId, payload, totalStart);
}

// ============================================================================
// Helpers
// ============================================================================

function buildResult(
  entity: Entity,
  collection: string,
  steps: TestStepResult[],
  createdId: string | undefined,
  payload: Record<string, unknown> | undefined,
  totalStart: number
): TestEntityResult {
  const result: TestEntityResult = {
    entity: entity.name,
    collection,
    passed: steps.every((s) => s.passed),
    steps,
    createdId,
    payload,
    duration: Math.round(performance.now() - totalStart),
  };

  reportEntity(result);
  return result;
}
