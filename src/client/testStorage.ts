// packages/testing/src/client/testStorage.ts

/**
 * @fileoverview Standalone storage adapter test — upload, getUrl, delete
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { reportStorage } from '../common/reporter';
import type {
  TestStorageOptions,
  TestStorageResult,
  TestStepResult,
} from '../common/types';

// ============================================================================
// Test blob generation
// ============================================================================

/**
 * Generate a minimal valid PNG blob for testing image uploads
 */
export function createTestImageBlob(): Blob {
  // 1x1 red PNG (68 bytes)
  const png = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x08,
    0x02,
    0x00,
    0x00,
    0x00,
    0x90,
    0x77,
    0x53,
    0xde,
    0x00,
    0x00,
    0x00,
    0x0c,
    0x49,
    0x44,
    0x41, // IDAT chunk
    0x54,
    0x08,
    0xd7,
    0x63,
    0xf8,
    0xcf,
    0xc0,
    0x00,
    0x00,
    0x00,
    0x02,
    0x00,
    0x01,
    0xe2,
    0x21,
    0xbc,
    0x33,
    0x00,
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4e, // IEND chunk
    0x44,
    0xae,
    0x42,
    0x60,
    0x82,
  ]);
  return new Blob([png], { type: 'image/png' });
}

/**
 * Generate a minimal test file blob
 */
export function createTestFileBlob(): Blob {
  return new Blob(['test file content from @donotdev/testing'], {
    type: 'text/plain',
  });
}

// ============================================================================
// Step runner
// ============================================================================

async function runStep(
  step: TestStepResult['step'],
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
// Public API
// ============================================================================

/**
 * Test a storage adapter: upload → getUrl → delete
 *
 * @example
 * ```ts
 * import { testStorage } from '@donotdev/testing';
 * import { SupabaseStorageAdapter } from '@donotdev/supabase';
 *
 * const result = await testStorage({
 *   storage: new SupabaseStorageAdapter(supabase, 'uploads'),
 *   storagePath: 'test',
 * });
 * ```
 */
export async function testStorage(
  options: TestStorageOptions
): Promise<TestStorageResult> {
  const { storage, storagePath, signal } = options;
  const totalStart = performance.now();
  const steps: TestStepResult[] = [];
  let uploadedPath: string | undefined;

  // Step 1: Upload
  const uploadResult = await runStep('storage-upload', async () => {
    const blob = createTestImageBlob();
    const result = await storage.upload(blob, {
      storagePath,
      filename: `dndev_test_${Date.now()}.png`,
      signal,
    });
    uploadedPath = result.path;
    return result;
  });
  steps.push(uploadResult);

  // Step 2: Get URL (only if upload succeeded)
  if (uploadResult.passed && uploadedPath) {
    const getUrlResult = await runStep('storage-get-url', async () => {
      return storage.getUrl(uploadedPath!);
    });
    steps.push(getUrlResult);
  }

  // Step 3: Delete (cleanup, only if upload succeeded)
  if (uploadResult.passed && uploadedPath) {
    const deleteResult = await runStep('storage-delete', async () => {
      await storage.delete(uploadedPath!);
    });
    steps.push(deleteResult);
  }

  const result: TestStorageResult = {
    passed: steps.every((s) => s.passed),
    steps,
    duration: Math.round(performance.now() - totalStart),
  };

  reportStorage(result);
  return result;
}
