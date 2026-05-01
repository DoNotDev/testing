// packages/testing/src/common/types.ts

/**
 * @fileoverview Types for @donotdev/testing
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import type {
  ICrudAdapter,
  IStorageAdapter,
  ICallableProvider,
} from '@donotdev/core';

// ============================================================================
// Provider Options
// ============================================================================

/** Providers needed to run entity tests */
export interface TestProviders {
  /** CRUD adapter (required) */
  crud: ICrudAdapter;
  /** Storage adapter (required for image/file field tests) */
  storage?: IStorageAdapter;
  /** Callable provider (required for FunctionsAdapter) */
  callable?: ICallableProvider;
}

// ============================================================================
// Test Configuration
// ============================================================================

/** Options for testEntity() */
export interface TestEntityOptions {
  /** Provider instances to test against */
  providers: TestProviders;
  /** Partial payload overrides (merged with generated values) */
  payload?: Record<string, unknown>;
  /** Delete created entity after test (default: true) */
  cleanup?: boolean;
  /** Role to test as (affects field visibility) — default: 'admin' */
  role?: 'guest' | 'user' | 'admin' | 'super';
  /** Skip specific steps */
  skip?: Array<'create' | 'get' | 'list' | 'listCard' | 'update' | 'delete'>;
  /** Storage path override for file/image uploads */
  storagePath?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Options for testStorage() */
export interface TestStorageOptions {
  /** Storage adapter to test */
  storage: IStorageAdapter;
  /** Folder path within bucket */
  storagePath?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// Test Results
// ============================================================================

export type TestStep =
  | 'generate-payload'
  | 'upload-image'
  | 'upload-file'
  | 'create'
  | 'get'
  | 'list'
  | 'listCard'
  | 'update'
  | 'delete'
  | 'storage-upload'
  | 'storage-get-url'
  | 'storage-delete'
  // Image pipeline steps (testImagePipeline)
  | 'process-image'
  | 'upload-pipeline'
  | 'verify-full-url'
  | 'verify-thumb-url'
  | 'cleanup-image';

export interface TestStepResult {
  /** Step name */
  step: TestStep;
  /** Whether the step passed */
  passed: boolean;
  /** Duration in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Full error object for debugging */
  errorDetail?: unknown;
  /** Data returned by the step (for debugging) */
  data?: unknown;
}

export interface TestEntityResult {
  /** Entity name */
  entity: string;
  /** Collection name */
  collection: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Per-step results */
  steps: TestStepResult[];
  /** ID of created entity (if any) */
  createdId?: string;
  /** Generated payload used for create */
  payload?: Record<string, unknown>;
  /** Total duration in ms */
  duration: number;
}

export interface TestStorageResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Per-step results */
  steps: TestStepResult[];
  /** Total duration in ms */
  duration: number;
}

// ============================================================================
// CRUD Pipeline Testing (pure data, no browser APIs)
// ============================================================================

/** Picture shape (matches @donotdev/core Picture) */
export interface PipelinePicture {
  fullUrl: string;
  thumbUrl: string;
}

/** Injectable pipeline functions for transformation steps */
export interface CrudPipelineFns {
  /** Validate payload against entity schema — return validated data or throw */
  validate?: (
    data: Record<string, unknown>
  ) => Record<string, unknown> | boolean;
  /** Create metadata fields (createdAt, createdById, etc.) */
  createMetadata?: () => Record<string, unknown>;
}

/** Options for testImagePipeline() */
export interface TestImagePipelineOptions {
  /** Entity definition */
  entity: import('@donotdev/core').Entity;
  /** Form input object — like what the store/UI would give. Merged with generated defaults. */
  input?: Record<string, unknown>;
  /** Optional pipeline functions for validation + metadata steps */
  fns?: CrudPipelineFns;
}

/** Result from testImagePipeline() */
export interface TestImagePipelineResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Per-step results */
  steps: TestStepResult[];
  /** Final payload that adapter.add() would receive */
  payload?: Record<string, unknown>;
  /** Total duration in ms */
  duration: number;
}

// ============================================================================
// Browser Image Upload Testing (real pipeline: processImage → uploadImage)
// ============================================================================

/** Processed image output shape (matches @donotdev/crud processImage return) */
export interface ProcessedImageResult {
  fullBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
}

/** Injectable browser pipeline functions from @donotdev/crud */
export interface ImagePipelineFns {
  /** processImage from crud — File → { fullBlob, thumbBlob, width, height } */
  processImage?: (file: File) => Promise<ProcessedImageResult>;
  /** uploadImage from crud — (fullBlob, thumbBlob, filename, opts) → Picture */
  uploadImage: (
    fullBlob: Blob,
    thumbBlob: Blob,
    filename: string,
    options?: {
      storagePath?: string;
      onProgress?: (p: {
        bytesTransferred: number;
        totalBytes: number;
        progress: number;
      }) => void;
      signal?: AbortSignal;
    }
  ) => Promise<PipelinePicture>;
  /** deleteImage from crud — cleanup (optional) */
  deleteImage?: (picture: PipelinePicture) => Promise<void>;
}

/** Options for testImageUpload() */
export interface TestImageUploadOptions {
  /** Pipeline functions to test (injected from @donotdev/crud) */
  fns: ImagePipelineFns;
  /** Test image file — if not provided, uses generated 100x100 test image */
  file?: File;
  /** Storage path (folder within bucket) */
  storagePath?: string;
  /** Verify uploaded URLs are accessible via fetch HEAD (default: true) */
  verifyUrls?: boolean;
  /** Delete uploaded images after test (default: true) */
  cleanup?: boolean;
  /** AbortSignal */
  signal?: AbortSignal;
}

/** Result from testImageUpload() */
export interface TestImageUploadResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Per-step results */
  steps: TestStepResult[];
  /** Picture returned by uploadImage (if succeeded) */
  picture?: PipelinePicture;
  /** Processed image info (if processImage was provided) */
  processed?: {
    fullSize: number;
    thumbSize: number;
    width: number;
    height: number;
  };
  /** Total duration in ms */
  duration: number;
}
