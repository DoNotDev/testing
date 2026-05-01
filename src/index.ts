// packages/testing/src/index.ts

/**
 * @donotdev/testing — Entity CRUD and storage integration testing
 *
 * @example Browser console:
 * ```ts
 * import { testEntity } from '@donotdev/testing';
 * import { apartmentEntity } from '../../entities/apartment';
 * import { getProvider } from '@donotdev/core';
 *
 * await testEntity(apartmentEntity, {
 *   providers: {
 *     crud: getProvider('crud'),
 *     storage: getProvider('storage'),
 *     callable: getProvider('callable'),
 *   },
 * });
 * ```
 *
 * @example Image pipeline (full trace):
 * ```ts
 * import { testImagePipeline } from '@donotdev/testing';
 * import { processImage } from '@donotdev/crud/utils/imageProcessing';
 * import { uploadImage, deleteImage } from '@donotdev/crud/utils/imageStorage';
 *
 * await testImagePipeline({
 *   fns: { processImage, uploadImage, deleteImage },
 *   storagePath: 'apartments',
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client-side exports (browser + test runner)
export { testEntity } from './client/testEntity';
export {
  testStorage,
  createTestImageBlob,
  createTestFileBlob,
} from './client/testStorage';
export { testImagePipeline } from './client/testImagePipeline';
export { testImageUpload, createTestImageFile } from './client/testImageUpload';
export { debugIsousou } from './client/debugIsousou';
export { debugC4all } from './client/debugC4all';

// Utilities
export {
  generatePayload,
  getFileFields,
  isFileField,
  isMultiFileField,
} from './common/payloadGenerator';
export {
  reportEntity,
  reportStorage,
  reportImagePipeline,
  reportImageUpload,
} from './common/reporter';

// Types
export type {
  TestProviders,
  TestEntityOptions,
  TestStorageOptions,
  TestImagePipelineOptions,
  TestImagePipelineResult,
  CrudPipelineFns,
  PipelinePicture,
  TestStep,
  TestStepResult,
  TestEntityResult,
  TestStorageResult,
  TestImageUploadOptions,
  TestImageUploadResult,
  ImagePipelineFns,
  ProcessedImageResult,
} from './common/types';
