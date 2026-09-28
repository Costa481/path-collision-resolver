/**
 * Public entry point for the path-collision-resolver library.
 *
 * Re-exports the resolver factory and the two built-in suffix strategies so
 * callers can import everything from a single path:
 *
 *   import { createResolver, numericSuffix, timestampSuffix } from 'path-collision-resolver';
 */
export { createResolver } from './core.js';
export { numericSuffix, timestampSuffix } from './core.js';
