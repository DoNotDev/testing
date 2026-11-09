// packages/testing/src/client/testImageUpload.ts

/**
 * @fileoverview Browser-side image upload pipeline test — processImage → uploadImage → verify → cleanup
 *
 * Exercises the REAL upload pipeline using injected functions from @donotdev/crud.
 * Runs in browser (requires canvas, fetch). Not for Node/vitest.
 *
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { reportImageUpload } from '../common/reporter';
import type {
  TestImageUploadOptions,
  TestImageUploadResult,
  TestStepResult,
  TestStep,
  PipelinePicture,
  ProcessedImageResult,
} from '../common/types';

// ============================================================================
// Test image generation
// ============================================================================

/**
 * Create a 100x100 red PNG test image as a File object, with a white diagonal line.
 * Uses canvas so the output is a valid decodable image (not a raw byte array).
 */
export function createTestImageFile(name = 'dndev_test.png'): File {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  // Red background
  ctx.fillStyle = '#CC2200';
  ctx.fillRect(0, 0, 100, 100);

  // White diagonal line
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(100, 100);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], name, { type: 'image/png' });
}

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
 * Test the browser image upload pipeline: processImage → uploadImage → verify URLs → cleanup.
 *
 * Uses injection — consumer passes functions from @donotdev/crud. No static import
 * of crud from testing package.
 *
 * Steps:
 * 1. `process-image` — processImage(file) → { fullBlob, thumbBlob, width, height } (skipped if not provided)
 * 2. `upload-pipeline` — uploadImage(fullBlob, thumbBlob, filename, opts) → Picture
 * 3. `verify-full-url` — HEAD request to fullUrl (skipped if verifyUrls=false)
 * 4. `verify-thumb-url` — HEAD request to thumbUrl (skipped if verifyUrls=false)
 * 5. `cleanup-image` — deleteImage(picture) (skipped if cleanup=false or deleteImage not provided)
 *
 * @example
 * ```ts
 * import { testImageUpload } from '@donotdev/testing';
 * import { processImage, uploadImage, deleteImage } from '@donotdev/crud/utils/imageProcessing';
 *
 * await testImageUpload({
 *   fns: { processImage, uploadImage, deleteImage },
 *   storagePath: 'apartments',
 * });
 * ```
 */
export async function testImageUpload(
  options: TestImageUploadOptions
): Promise<TestImageUploadResult> {
  const {
    fns,
    storagePath,
    verifyUrls = true,
    cleanup = true,
    signal,
  } = options;

  const file = options.file ?? createTestImageFile();
  const totalStart = performance.now();
  const steps: TestStepResult[] = [];

  let picture: PipelinePicture | undefined;
  let processed: TestImageUploadResult['processed'] | undefined;

  // Working blobs — set after process-image (or fallback)
  let fullBlob: Blob;
  let thumbBlob: Blob;

  console.log('=== IMAGE UPLOAD TEST ===');
  console.log(`  File: ${file.name} (${file.size}B, ${file.type})`);
  console.log(`  processImage: ${!!fns.processImage}`);
  console.log(`  deleteImage:  ${!!fns.deleteImage}`);
  console.log(`  storagePath:  ${storagePath ?? '(root)'}`);
  console.log(`  verifyUrls:   ${verifyUrls}`);
  console.log(`  cleanup:      ${cleanup}`);

  // ── Step 1: Process image ─────────────────────────────────────────────────

  if (fns.processImage) {
    const processResult = await runStep('process-image', async () => {
      console.log(
        `\n  [process-image] IN: name=${file.name}, size=${file.size}B, type=${file.type}`
      );

      const out: ProcessedImageResult = await fns.processImage!(file);

      console.log(`  [process-image] OUT:`);
      console.log(
        `    fullBlob:  ${out.fullBlob.size}B, type=${out.fullBlob.type}`
      );
      console.log(
        `    thumbBlob: ${out.thumbBlob.size}B, type=${out.thumbBlob.type}`
      );
      console.log(`    dimensions: ${out.width}x${out.height}`);

      if (out.fullBlob.size === 0)
        console.warn('  [process-image] WARN: fullBlob is empty');
      if (out.thumbBlob.size === 0)
        console.warn('  [process-image] WARN: thumbBlob is empty');
      if (out.fullBlob.type !== 'image/webp')
        console.warn(
          `  [process-image] WARN: fullBlob type is ${out.fullBlob.type}, expected image/webp`
        );
      if (out.thumbBlob.type !== 'image/webp')
        console.warn(
          `  [process-image] WARN: thumbBlob type is ${out.thumbBlob.type}, expected image/webp`
        );

      fullBlob = out.fullBlob;
      thumbBlob = out.thumbBlob;
      processed = {
        fullSize: out.fullBlob.size,
        thumbSize: out.thumbBlob.size,
        width: out.width,
        height: out.height,
      };

      return {
        fullSize: out.fullBlob.size,
        thumbSize: out.thumbBlob.size,
        width: out.width,
        height: out.height,
      };
    });
    steps.push(processResult);

    if (!processResult.passed) {
      return buildResult(steps, picture, processed, totalStart);
    }
  } else {
    // Fallback: use raw file as both blobs
    console.log(
      '\n  [process-image] SKIPPED (fns.processImage not provided) — using raw file as blobs'
    );
    fullBlob = file;
    thumbBlob = file;
  }

  // ── Step 2: Upload ────────────────────────────────────────────────────────

  const uploadResult = await runStep('upload-pipeline', async () => {
    console.log(`\n  [upload-pipeline] IN:`);
    console.log(`    fullBlob:   ${fullBlob!.size}B`);
    console.log(`    thumbBlob:  ${thumbBlob!.size}B`);
    console.log(`    filename:   ${file.name}`);
    console.log(`    storagePath: ${storagePath ?? '(root)'}`);

    const out = await fns.uploadImage(fullBlob!, thumbBlob!, file.name, {
      storagePath,
      signal,
      onProgress: (p) => {
        console.log(`    progress: ${Math.round(p.progress)}%`);
      },
    });

    console.log(`  [upload-pipeline] OUT:`);
    console.log(`    fullUrl:  ${out.fullUrl}`);
    console.log(`    thumbUrl: ${out.thumbUrl}`);

    if (!out.fullUrl) throw new Error('uploadImage returned empty fullUrl');
    if (!out.thumbUrl) throw new Error('uploadImage returned empty thumbUrl');
    if (out.fullUrl.startsWith('blob:'))
      throw new Error(`fullUrl is a blob URL: ${out.fullUrl}`);
    if (out.thumbUrl.startsWith('blob:'))
      throw new Error(`thumbUrl is a blob URL: ${out.thumbUrl}`);

    picture = out;
    return out;
  });
  steps.push(uploadResult);

  if (!uploadResult.passed) {
    return buildResult(steps, picture, processed, totalStart);
  }

  // ── Step 3: Verify full URL ───────────────────────────────────────────────

  if (verifyUrls && picture) {
    const verifyFullResult = await runStep('verify-full-url', async () => {
      console.log(`\n  [verify-full-url] HEAD ${picture!.fullUrl}`);

      const res = await fetch(picture!.fullUrl, { method: 'HEAD', signal });

      console.log(`    status:         ${res.status}`);
      console.log(
        `    content-type:   ${res.headers.get('content-type') ?? '(none)'}`
      );
      console.log(
        `    content-length: ${res.headers.get('content-length') ?? '(none)'}`
      );

      if (!res.ok) throw new Error(`fullUrl returned HTTP ${res.status}`);

      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
      };
    });
    steps.push(verifyFullResult);

    // ── Step 4: Verify thumb URL ──────────────────────────────────────────

    const verifyThumbResult = await runStep('verify-thumb-url', async () => {
      console.log(`\n  [verify-thumb-url] HEAD ${picture!.thumbUrl}`);

      const res = await fetch(picture!.thumbUrl, { method: 'HEAD', signal });

      console.log(`    status:         ${res.status}`);
      console.log(
        `    content-type:   ${res.headers.get('content-type') ?? '(none)'}`
      );
      console.log(
        `    content-length: ${res.headers.get('content-length') ?? '(none)'}`
      );

      if (!res.ok) throw new Error(`thumbUrl returned HTTP ${res.status}`);

      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
      };
    });
    steps.push(verifyThumbResult);
  }

  // ── Step 5: Cleanup ───────────────────────────────────────────────────────

  if (cleanup && fns.deleteImage && picture) {
    const cleanupResult = await runStep('cleanup-image', async () => {
      console.log(`\n  [cleanup-image] Deleting:`);
      console.log(`    fullUrl:  ${picture!.fullUrl}`);
      console.log(`    thumbUrl: ${picture!.thumbUrl}`);

      await fns.deleteImage!(picture!);

      console.log(`  [cleanup-image] Deleted`);
      return { deleted: [picture!.fullUrl, picture!.thumbUrl] };
    });
    steps.push(cleanupResult);
  } else if (cleanup && !fns.deleteImage) {
    console.log('\n  [cleanup-image] SKIPPED (fns.deleteImage not provided)');
  }

  const result = buildResult(steps, picture, processed, totalStart);
  reportImageUpload(result);
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function buildResult(
  steps: TestStepResult[],
  picture: PipelinePicture | undefined,
  processed: TestImageUploadResult['processed'] | undefined,
  totalStart: number
): TestImageUploadResult {
  return {
    passed: steps.every((s) => s.passed),
    steps,
    picture,
    processed,
    duration: Math.round(performance.now() - totalStart),
  };
}
