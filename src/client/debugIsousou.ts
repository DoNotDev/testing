// packages/testing/src/client/debugIsousou.ts

/**
 * @fileoverview Debug script for isousou apartment upload + CRUD
 *
 * Supports 3 test layers:
 * 1. Storage adapter test (raw upload/download/delete)
 * 2. CRUD pipeline test (pure data: form object → payload) via testImagePipeline
 * 3. Browser image upload test (processImage → uploadImage → verify URLs) via testImageUpload
 *
 * @version 0.3.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { getProvider } from '@donotdev/core';

import type { ImagePipelineFns, CrudPipelineFns } from '../common/types';
import { testStorage } from './testStorage';
import { testEntity } from './testEntity';
import { testImagePipeline } from './testImagePipeline';
import { testImageUpload } from './testImageUpload';

// ============================================================================
// Options
// ============================================================================

export interface DebugIsousouOptions {
  /** Pipeline functions for browser-side image upload test (processImage, uploadImage, deleteImage) */
  pipeline?: ImagePipelineFns;
  /** Pipeline functions for pure-data CRUD test (validate, createMetadata) */
  crudFns?: CrudPipelineFns;
  /** Pre-uploaded picture URLs to include in test payload */
  pictures?: Array<{ fullUrl: string; thumbUrl: string }>;
  /** Real image files to test with in browser pipeline */
  files?: File[];
  /** Skip storage adapter test */
  skipStorage?: boolean;
  /** Skip pipeline tests */
  skipPipeline?: boolean;
  /** Skip entity CRUD test */
  skipCrud?: boolean;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Debug isousou: test storage adapter, image pipeline, and apartment entity CRUD.
 * Each layer isolated so you know exactly where it breaks.
 */
export async function debugIsousou(
  apartmentEntity: any,
  options: DebugIsousouOptions = {}
): Promise<void> {
  const {
    pipeline,
    crudFns,
    pictures,
    files,
    skipStorage = false,
    skipPipeline = false,
    skipCrud = false,
  } = options;

  const storage = getProvider('storage');
  const crud = getProvider('crud');
  const callable = getProvider('callable');

  const apartmentInput: Record<string, unknown> = {
    reference: `TEST-${Date.now().toString(36).toUpperCase()}`,
    address: {
      formatted_address: '1 rue de Rivoli, 75001 Paris, France',
      latitude: 48.8606,
      longitude: 2.3376,
    },
    district_code: 1,
  };

  // ── STEP 1: Storage adapter ───────────────────────────────────────────

  if (!skipStorage) {
    console.log(
      '\n=== STEP 1: Storage adapter (raw upload/download/delete) ==='
    );

    console.log('\n--- 1a: Upload to bucket root (no storagePath) ---');
    const storageRoot = await testStorage({ storage });

    console.log('\n--- 1b: Upload to storagePath "test" ---');
    const storageSub = await testStorage({ storage, storagePath: 'test' });

    if (!storageRoot.passed && storageSub.passed) {
      console.log(
        '>>> ROOT fails, subfolder works — bucket root write restricted'
      );
    } else if (storageRoot.passed && !storageSub.passed) {
      console.log(
        '>>> ROOT works, subfolder fails — RLS restricts folder writes'
      );
    } else if (!storageRoot.passed && !storageSub.passed) {
      console.log(
        '>>> BOTH fail — storage adapter or bucket is broken. Stop here.'
      );
      return;
    } else {
      console.log('>>> Both pass — adapter is fine');
    }
  } else {
    console.log('\n=== STEP 1: Storage adapter — SKIPPED ===');
  }

  // ── STEP 2a: CRUD pipeline (pure data) ────────────────────────────────

  if (!skipPipeline) {
    console.log(
      '\n=== STEP 2a: CRUD pipeline (form object → adapter payload) ==='
    );

    const pipelineInput = { ...apartmentInput };
    if (pictures && pictures.length > 0) {
      pipelineInput.pictures = pictures;
    }

    await testImagePipeline({
      entity: apartmentEntity,
      input: pipelineInput,
      fns: crudFns,
    });

    // ── STEP 2b: Browser image upload ───────────────────────────────────

    if (pipeline) {
      console.log(
        '\n=== STEP 2b: Browser image upload (processImage → uploadImage → verify) ==='
      );

      // Generated test image
      console.log('\n--- Generated 100x100 test image ---');
      await testImageUpload({ fns: pipeline });

      // Real files if provided
      if (files && files.length > 0) {
        for (const file of files) {
          console.log(`\n--- Real file: ${file.name} (${file.size}B) ---`);
          await testImageUpload({ fns: pipeline, file });
        }
      }
    } else {
      console.log(
        '\n=== STEP 2b: Browser image upload — SKIPPED (no pipeline fns) ==='
      );
      console.log(
        '  Pass { pipeline: { processImage, uploadImage, deleteImage } }'
      );
    }
  } else {
    console.log('\n=== STEP 2: Pipeline tests — SKIPPED ===');
  }

  // ── STEP 3: Entity CRUD ───────────────────────────────────────────────

  if (!skipCrud && apartmentEntity) {
    console.log('\n=== STEP 3: Apartment entity CRUD (real backend) ===');
    await testEntity(apartmentEntity, {
      providers: { crud, storage, callable },
      payload: {
        ...apartmentInput,
        ...(pictures && pictures.length > 0 ? { pictures } : {}),
      },
    });
  } else {
    console.log('\n=== STEP 3: Entity CRUD — SKIPPED ===');
  }

  console.log('\n=== debugIsousou complete ===');
}
