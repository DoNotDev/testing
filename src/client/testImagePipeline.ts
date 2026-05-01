// packages/testing/src/client/testImagePipeline.ts

/**
 * @fileoverview Deterministic CRUD pipeline test - pure data, no browser APIs.
 *
 * Input: entity definition + form object (like the store/UI would give)
 * Process: real framework code (generate → validate → metadata → adapter)
 * Output: the exact payload that Supabase/Firebase would receive
 *
 * @version 0.2.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import type {
  TestImagePipelineOptions,
  TestImagePipelineResult,
  TestStepResult,
  TestStep,
  PipelinePicture,
} from '../common/types';
import { reportImagePipeline } from '../common/reporter';
import { generatePayload, getFileFields } from '../common/payloadGenerator';

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
// Public API
// ============================================================================

/**
 * Test the CRUD pipeline as pure data: form object in → framework processing → adapter payload out.
 *
 * No browser APIs. No File/Blob. No uploads. Just objects.
 *
 * Steps:
 * 1. `generate-payload` — generatePayload() from entity fields + your overrides
 * 2. `upload-pipeline` — merge image/file URLs you provide (no actual upload)
 * 3. `verify-full-url` — validate all Picture URLs are real https (not blob:)
 * 4. `verify-thumb-url` — same for thumb URLs
 * 5. `cleanup-image` — (skipped — nothing to clean in data-only mode)
 *
 * The output at each step is logged. You see exactly what goes in and what comes out.
 *
 * @example
 * ```ts
 * import { testImagePipeline } from '@donotdev/testing';
 * import { apartmentEntity } from '../entities/apartment';
 *
 * await testImagePipeline({
 *   entity: apartmentEntity,
 *   input: {
 *     reference: 'TEST-001',
 *     rent: 500,
 *     pictures: [{ fullUrl: 'https://storage.../full.webp', thumbUrl: 'https://storage.../thumb.webp' }],
 *   },
 * });
 * ```
 */
export async function testImagePipeline(
  options: TestImagePipelineOptions
): Promise<TestImagePipelineResult> {
  const { entity, input = {}, fns } = options;

  const totalStart = performance.now();
  const steps: TestStepResult[] = [];
  let finalPayload: Record<string, unknown> | undefined;

  console.log('=== CRUD PIPELINE TEST ===');
  console.log(`  Entity: ${entity.name} (${entity.collection})`);
  console.log(`  Input keys: [${Object.keys(input).join(', ')}]`);
  console.log(
    `  Pipeline fns: validate=${!!fns?.validate}, metadata=${!!fns?.createMetadata}`
  );

  // ── Step 1: Generate payload ──────────────────────────────────────────

  const genResult = await runStep('generate-payload', async () => {
    const generated = generatePayload(entity.fields, input);

    console.log(
      `\n  [generate-payload] OUT (${Object.keys(generated).length} fields):`
    );

    // Show each field with its value type and preview
    for (const [key, value] of Object.entries(generated)) {
      const preview = formatValue(value);
      const fromOverride = key in input ? ' (override)' : '';
      console.log(`    ${key}: ${preview}${fromOverride}`);
    }

    // Show file fields separately
    const fileFields = getFileFields(entity.fields);
    if (fileFields.length > 0) {
      console.log(`\n  [generate-payload] File fields (${fileFields.length}):`);
      for (const f of fileFields) {
        const val = generated[f.name];
        console.log(`    ${f.name} [${f.type}]: ${formatValue(val)}`);
      }
    }

    return generated;
  });
  steps.push(genResult);

  if (!genResult.passed) {
    return buildResult(steps, undefined, totalStart);
  }

  finalPayload = genResult.data as Record<string, unknown>;

  // ── Step 2: Validate (if validate fn provided) ────────────────────────

  if (fns?.validate) {
    const validateResult = await runStep('upload-pipeline', async () => {
      console.log(
        `\n  [validate] IN: ${Object.keys(finalPayload!).length} fields`
      );

      const validated = fns.validate!(finalPayload!);

      console.log(`  [validate] OUT: ${validated ? 'PASS' : 'FAIL'}`);
      if (typeof validated === 'object' && validated !== null) {
        // If validate returns transformed data, use it
        finalPayload = validated as Record<string, unknown>;
        console.log(
          `  [validate] Transformed payload (${Object.keys(finalPayload).length} fields)`
        );
      }

      return validated;
    });
    steps.push(validateResult);

    if (!validateResult.passed) {
      return buildResult(steps, finalPayload, totalStart);
    }
  }

  // ── Step 3: Check image URLs are real ─────────────────────────────────

  const fileFields = getFileFields(entity.fields);
  const imageFields = fileFields.filter((f) =>
    ['image', 'images', 'avatar'].includes(f.type)
  );

  if (imageFields.length > 0) {
    const verifyFullResult = await runStep('verify-full-url', async () => {
      console.log(
        `\n  [verify-urls] Checking ${imageFields.length} image field(s):`
      );
      const issues: string[] = [];

      for (const f of imageFields) {
        const val = finalPayload![f.name];
        if (val === null || val === undefined) {
          console.log(`    ${f.name}: null/undefined (skipped)`);
          continue;
        }

        const pictures: PipelinePicture[] = Array.isArray(val) ? val : [val];
        pictures.forEach((pic, i) => {
          const prefix = `${f.name}[${i}]`;

          if (!pic.fullUrl) {
            issues.push(`${prefix}.fullUrl is empty`);
          } else if (pic.fullUrl.startsWith('blob:')) {
            issues.push(`${prefix}.fullUrl is blob: ${pic.fullUrl}`);
          } else {
            console.log(`    ${prefix}.fullUrl: ${pic.fullUrl}`);
          }
        });
      }

      if (issues.length > 0) {
        console.log(`  [verify-urls] ISSUES:`);
        for (const issue of issues) console.log(`    x ${issue}`);
        throw new Error(`${issues.length} URL issue(s): ${issues.join('; ')}`);
      }

      console.log(`  [verify-urls] All fullUrls are valid https`);
      return { checked: imageFields.length };
    });
    steps.push(verifyFullResult);

    const verifyThumbResult = await runStep('verify-thumb-url', async () => {
      const issues: string[] = [];

      for (const f of imageFields) {
        const val = finalPayload![f.name];
        if (val === null || val === undefined) continue;

        const pictures: PipelinePicture[] = Array.isArray(val) ? val : [val];
        pictures.forEach((pic, i) => {
          const prefix = `${f.name}[${i}]`;

          if (!pic.thumbUrl) {
            issues.push(`${prefix}.thumbUrl is empty`);
          } else if (pic.thumbUrl.startsWith('blob:')) {
            issues.push(`${prefix}.thumbUrl is blob: ${pic.thumbUrl}`);
          } else {
            console.log(`    ${prefix}.thumbUrl: ${pic.thumbUrl}`);
          }
        });
      }

      if (issues.length > 0) {
        console.log(`  [verify-thumbs] ISSUES:`);
        for (const issue of issues) console.log(`    x ${issue}`);
        throw new Error(
          `${issues.length} thumbUrl issue(s): ${issues.join('; ')}`
        );
      }

      console.log(`  [verify-thumbs] All thumbUrls are valid https`);
      return { checked: imageFields.length };
    });
    steps.push(verifyThumbResult);
  }

  // ── Step 4: Add metadata (if createMetadata fn provided) ──────────────

  if (fns?.createMetadata) {
    const metadataResult = await runStep('cleanup-image', async () => {
      console.log(
        `\n  [metadata] IN: ${Object.keys(finalPayload!).length} fields`
      );

      const metadata = fns.createMetadata!();

      console.log(`  [metadata] Generated metadata:`);
      for (const [key, value] of Object.entries(metadata)) {
        console.log(`    ${key}: ${formatValue(value)}`);
      }

      finalPayload = { ...finalPayload!, ...metadata };
      console.log(
        `  [metadata] OUT: ${Object.keys(finalPayload).length} fields total`
      );

      return metadata;
    });
    steps.push(metadataResult);
  }

  // ── Final: Show complete payload ──────────────────────────────────────

  console.log(`\n  === FINAL PAYLOAD (what adapter.add() receives) ===`);
  console.log(`  Fields: ${Object.keys(finalPayload!).length}`);
  for (const [key, value] of Object.entries(finalPayload!)) {
    console.log(`    ${key}: ${formatValue(value)}`);
  }
  console.log(`  === RAW JSON ===`);
  console.log(JSON.stringify(finalPayload, null, 2));

  const result = buildResult(steps, finalPayload, totalStart);
  reportImagePipeline(result);
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    return value.length > 60 ? `"${value.slice(0, 57)}..."` : `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', ...' : ''}}`;
  }
  return String(value);
}

function buildResult(
  steps: TestStepResult[],
  payload: Record<string, unknown> | undefined,
  totalStart: number
): TestImagePipelineResult {
  return {
    passed: steps.every((s) => s.passed),
    steps,
    payload,
    duration: Math.round(performance.now() - totalStart),
  };
}
