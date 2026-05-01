// packages/testing/src/common/reporter.ts

/**
 * @fileoverview Test result reporter — console output for browser + vitest
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import type {
  TestStepResult,
  TestEntityResult,
  TestStorageResult,
  TestImagePipelineResult,
  TestImageUploadResult,
} from './types';

// ============================================================================
// Formatting
// ============================================================================

function badge(passed: boolean): string {
  return passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatStep(step: TestStepResult): string {
  const icon = step.passed ? '  +' : '  x';
  const dur = formatDuration(step.duration);
  const err = step.error ? ` — ${step.error}` : '';
  return `${icon} ${step.step} (${dur})${err}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Print entity test results to console (works in browser + Node)
 */
export function reportEntity(result: TestEntityResult): void {
  const header = `[${badge(result.passed)}] ${result.entity} (${result.collection}) — ${formatDuration(result.duration)}`;
  console.log(`\n${header}`);

  if (result.createdId) {
    console.log(`  id: ${result.createdId}`);
  }

  for (const step of result.steps) {
    console.log(formatStep(step));
  }

  // Show payload for debugging failed creates
  if (!result.passed && result.payload) {
    const failedCreate = result.steps.find(
      (s) => s.step === 'create' && !s.passed
    );
    if (failedCreate) {
      console.log('\n  Payload sent:');
      console.log(JSON.stringify(result.payload, null, 2));
    }
  }

  // Show detailed errors
  for (const step of result.steps) {
    if (!step.passed && step.errorDetail) {
      console.log(`\n  [${step.step}] Error detail:`);
      console.error(step.errorDetail);
    }
  }

  console.log('');
}

/**
 * Print storage test results to console
 */
export function reportStorage(result: TestStorageResult): void {
  const header = `[${badge(result.passed)}] Storage test — ${formatDuration(result.duration)}`;
  console.log(`\n${header}`);

  for (const step of result.steps) {
    console.log(formatStep(step));
  }

  for (const step of result.steps) {
    if (!step.passed && step.errorDetail) {
      console.log(`\n  [${step.step}] Error detail:`);
      console.error(step.errorDetail);
    }
  }

  console.log('');
}

/**
 * Print image upload test results to console (real browser pipeline)
 */
export function reportImageUpload(result: TestImageUploadResult): void {
  const header = `[${badge(result.passed)}] Image Upload — ${formatDuration(result.duration)}`;
  console.log(`\n${header}`);

  if (result.processed) {
    console.log(
      `  processed: full=${result.processed.fullSize}B, thumb=${result.processed.thumbSize}B, ${result.processed.width}x${result.processed.height}`
    );
  }

  if (result.picture) {
    console.log(`  fullUrl:  ${result.picture.fullUrl}`);
    console.log(`  thumbUrl: ${result.picture.thumbUrl}`);
  }

  for (const step of result.steps) {
    console.log(formatStep(step));
  }

  for (const step of result.steps) {
    if (!step.passed && step.errorDetail) {
      console.log(`\n  [${step.step}] Error detail:`);
      console.error(step.errorDetail);
    }
  }

  console.log('');
}

/**
 * Print image pipeline test results to console
 */
export function reportImagePipeline(result: TestImagePipelineResult): void {
  const header = `[${badge(result.passed)}] Image Pipeline — ${formatDuration(result.duration)}`;
  console.log(`\n${header}`);

  for (const step of result.steps) {
    console.log(formatStep(step));
  }

  for (const step of result.steps) {
    if (!step.passed && step.errorDetail) {
      console.log(`\n  [${step.step}] Error detail:`);
      console.error(step.errorDetail);
    }
  }

  console.log('');
}
