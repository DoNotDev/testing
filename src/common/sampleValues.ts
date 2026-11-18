// packages/testing/src/common/sampleValues.ts

/**
 * @fileoverview Sample values per value kind
 * @description Generates a sample value for an entity field from its descriptor
 * (`describeEntity(entity).fields[name].value`: `kind` + presence-free `schema`) and
 * keeps the first candidate the schema accepts. No table by field type: the kind
 * decides the candidates (dates, times, text, numbers…), the schema structure fills
 * objects, arrays and picklists, and the schema has the last word. A field no
 * candidate satisfies throws, naming `entity.field`.
 *
 * Shared by `@donotdev/testing` (payloads) and `@donotdev/tooling` (seed rows,
 * imported as `@donotdev/testing/samples`): no imports, so the subpath export
 * carries no dependency into the tooling bundle; structural reads only (Valibot
 * schema objects and their Standard Schema `~standard.validate`).
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

/** Value kinds of the descriptor (`ValueKind` in `@donotdev/core`). */
export type SampleKind =
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'json'
  | 'ref';

/** What the sampler reads of a field: its descriptor value and validation hints. */
export interface SampleInput {
  /** Entity name, for error messages and text samples */
  entity: string;
  /** Field name */
  name: string;
  /** Field label, for text samples */
  label?: string;
  /** Descriptor value: kind + presence-free Valibot schema */
  value: { kind: SampleKind; schema: unknown };
  /** `field.validation` (min / max / minLength / maxLength / static options) */
  validation?: {
    readonly min?: unknown;
    readonly max?: unknown;
    readonly minLength?: unknown;
    readonly maxLength?: unknown;
    readonly options?: unknown;
  };
}

/** Row index (varies samples across rows) and a [0, 1) random source. */
export interface SampleContext {
  index: number;
  rand: () => number;
}

/** Standard Schema result (sync validation only). */
interface StandardResult {
  issues?: readonly unknown[];
}

interface StandardSchema {
  '~standard': { validate(value: unknown): StandardResult | Promise<StandardResult> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStandardSchema(value: unknown): value is StandardSchema {
  if (!isRecord(value)) return false;
  const standard = value['~standard'];
  return isRecord(standard) && typeof standard.validate === 'function';
}

/**
 * True when `schema` accepts `value` (Valibot via Standard Schema).
 *
 * @param schema - Valibot schema
 * @param value - Candidate value
 * @returns Whether the value passes the schema
 * @throws When `schema` is not a schema, or validates asynchronously
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */
export function schemaAccepts(schema: unknown, value: unknown): boolean {
  if (!isStandardSchema(schema)) {
    throw new Error('schemaAccepts: not a Valibot (Standard Schema) schema');
  }
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new Error('schemaAccepts: async schemas are not supported');
  }
  return !result.issues || result.issues.length === 0;
}

/** Wrapper schema types whose value is the wrapped schema's */
const WRAPPERS = new Set([
  'optional',
  'exact_optional',
  'nullable',
  'nullish',
  'undefinedable',
  'non_nullable',
  'non_nullish',
  'non_optional',
]);

/** Optional entry wrappers: an object sample leaves these keys out */
const OPTIONAL_WRAPPERS = new Set(['optional', 'exact_optional', 'nullish', 'undefinedable']);

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Static option values (`[{ value }]` or strings); functions and ranges give none. */
function optionValues(options: unknown): unknown[] {
  if (!Array.isArray(options)) return [];
  return options.map((opt: unknown) => (isRecord(opt) && 'value' in opt ? opt.value : opt));
}

/** Requirement of the first pipe action of `type` (e.g. `min_value`), if any */
function pipeRequirement(schema: Record<string, unknown>, type: string): unknown {
  const pipe = schema.pipe;
  if (!Array.isArray(pipe)) return undefined;
  for (const action of pipe) {
    if (isRecord(action) && action.type === type) return action.requirement;
  }
  return undefined;
}

/** String candidates of a kind: dates, times and text shapes. */
function stringCandidates(input: SampleInput, ctx: SampleContext, schema: Record<string, unknown>): unknown[] {
  const day = new Date(Date.UTC(2026, ctx.index % 12, 1 + (ctx.index % 28), 10, 30));
  const isoDate = day.toISOString().slice(0, 10);
  switch (input.value.kind) {
    case 'date':
      return [isoDate, day.toISOString()];
    case 'timestamp':
      return [day.toISOString(), isoDate];
    case 'time':
      return [`${pad(8 + (ctx.index % 10))}:30`, `${pad(8 + (ctx.index % 10))}:30:00`];
    default:
      break;
  }
  const n = ctx.index + 1;
  const label = input.label ?? input.name;
  const text = `${input.entity} ${label} ${n}`;
  const minLength = Number(pipeRequirement(schema, 'min_length') ?? input.validation?.minLength ?? 0);
  const maxLength = Number(pipeRequirement(schema, 'max_length') ?? input.validation?.maxLength ?? Infinity);
  const sized = text.padEnd(minLength, ' lorem ipsum').slice(0, maxLength);
  return [
    sized,
    text,
    `user${n}@example.com`,
    `https://example.com/${input.entity.toLowerCase()}/${n}`,
    `+33 6 12 34 ${pad(10 + (ctx.index % 90))} 78`,
    `#${(0x336699 + ctx.index).toString(16).padStart(6, '0').slice(-6)}`,
    'FR7630006000011234567890189',
    `2026-W${pad(1 + (ctx.index % 52))}`,
    `2026-${pad(1 + (ctx.index % 12))}`,
    isoDate,
    `${pad(8 + (ctx.index % 10))}:30`,
    `Sample${n}Pass!word`,
    String(n),
  ];
}

/** Number candidates inside the bounds of the schema (pipe) or the field validation. */
function numberCandidates(input: SampleInput, ctx: SampleContext, schema: Record<string, unknown>): unknown[] {
  const min = Number(pipeRequirement(schema, 'min_value') ?? input.validation?.min ?? 1);
  const max = Number(pipeRequirement(schema, 'max_value') ?? input.validation?.max ?? Math.max(min, 1) * 100);
  const value = min + ctx.rand() * (max - min);
  const rounded = Math.round(value);
  return [
    input.value.kind === 'integer' ? rounded : Math.round(value * 100) / 100,
    rounded,
    min,
    max,
    0,
  ];
}

/**
 * Candidate values for a schema, walked structurally. Objects take, per entry, the
 * first candidate the entry accepts; optional entries are left out.
 */
function candidates(schema: unknown, input: SampleInput, ctx: SampleContext, depth: number): unknown[] {
  if (!isRecord(schema) || depth > 8) return [];
  const type = schema.type;
  if (typeof type !== 'string') return [];
  if (WRAPPERS.has(type)) return candidates(schema.wrapped, input, ctx, depth + 1);
  switch (type) {
    case 'string':
      return stringCandidates(input, ctx, schema);
    case 'number':
      return numberCandidates(input, ctx, schema);
    case 'boolean':
      return [ctx.index % 2 === 0, ctx.index % 2 !== 0];
    case 'literal':
      return [schema.literal];
    case 'picklist': {
      const options = Array.isArray(schema.options) ? schema.options : [];
      return options.length > 0 ? [options[ctx.index % options.length], ...options] : [];
    }
    case 'enum':
      return isRecord(schema.enum) ? Object.values(schema.enum) : [];
    case 'union':
    case 'variant': {
      const options = Array.isArray(schema.options) ? schema.options : [];
      return options.flatMap((option) => candidates(option, input, ctx, depth + 1));
    }
    case 'array': {
      const item = firstAccepted(schema.item, candidates(schema.item, input, ctx, depth + 1));
      return item === NONE ? [[]] : [[item], []];
    }
    case 'record':
      return [{}];
    case 'object':
    case 'loose_object':
    case 'strict_object': {
      if (!isRecord(schema.entries)) return [];
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(schema.entries)) {
        if (isRecord(entry) && typeof entry.type === 'string' && OPTIONAL_WRAPPERS.has(entry.type)) continue;
        const value = firstAccepted(entry, candidates(entry, input, ctx, depth + 1));
        if (value === NONE) return [];
        out[key] = value;
      }
      return [out];
    }
    case 'unknown':
    case 'any':
      return [`${input.entity} ${input.name} ${ctx.index + 1}`];
    default:
      return [];
  }
}

const NONE = Symbol('none');

function firstAccepted(schema: unknown, values: readonly unknown[]): unknown {
  for (const value of values) {
    if (schemaAccepts(schema, value)) return value;
  }
  return NONE;
}

/**
 * Sample value of a field, from its descriptor kind and schema.
 *
 * Static options come first (row `index` picks one), then the kind's candidates
 * and the schema's structure; the first value the schema accepts is returned.
 * `ref` fields have no sample (the caller links rows or passes an id).
 *
 * @param input - Field descriptor value and validation hints
 * @param ctx - Row index and random source
 * @returns A value accepted by `input.value.schema`
 * @throws When the kind is `ref`, or no candidate passes the schema (names `entity.field`)
 *
 * @example
 * ```typescript
 * const d = describeEntity(productEntity).fields.price;
 * sampleValue({ entity: 'Product', name: 'price', value: d.value }, { index: 0, rand: Math.random });
 * ```
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */
export function sampleValue(input: SampleInput, ctx: SampleContext): unknown {
  const { kind, schema } = input.value;
  if (kind === 'ref') {
    throw new Error(`${input.entity}.${input.name}: a reference has no sample value; link it to a row id`);
  }
  const options = optionValues(input.validation?.options);
  const rotated = options.length > 0 ? [options[ctx.index % options.length], ...options] : [];
  const value = firstAccepted(schema, [...rotated, ...candidates(schema, input, ctx, 0)]);
  if (value === NONE) {
    throw new Error(
      `${input.entity}.${input.name}: cannot generate a sample ${kind} value accepted by its schema; pass the value explicitly`
    );
  }
  return value;
}
