// packages/testing/src/client/debugC4all.ts

/**
 * @fileoverview Debug script for c4all car CRUD (FunctionsAdapter + Firebase)
 *
 * Run in browser console after importing providers:
 * ```ts
 * import { debugC4all } from '@donotdev/testing/debug';
 * await debugC4all(carEntity);
 * ```
 */

import { getProvider, hasProvider } from '@donotdev/core';

import { testEntity } from './testEntity';

/**
 * Debug c4all: test car entity CRUD via FunctionsAdapter
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: exported signature; narrowing it is a breaking change for importers (deferred to a major, any-audit 2026-11-11)
export async function debugC4all(carEntity: any): Promise<void> {
  const crud = getProvider('crud');
  const callable = getProvider('callable');

  if (!hasProvider('storage')) {
    throw new Error(
      '[debugC4all] Storage adapter required — car entity has required images field.\n' +
        'Ensure FirebaseStorageAdapter is registered via configureProviders().'
    );
  }
  const storage = getProvider('storage');

  console.log('=== Car entity CRUD test ===');
  console.log('Adapter: FunctionsAdapter (serverSideOnly)');
  console.log('Provider: FirebaseCallableProvider');
  console.log('Storage: FirebaseStorageAdapter');

  await testEntity(carEntity, {
    providers: { crud, storage, callable },
    payload: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2023,
      mileage: 15000,
      fuelType: 'Petrol',
      transmission: 'Manual',
      vin: `TEST${Date.now().toString(36).toUpperCase()}`,
      price: {
        amount: 15000,
        currency: 'EUR',
        vatIncluded: true,
        discountPercent: 0,
      },
      // images: handled by testEntity via storage upload
    },
  });
}
