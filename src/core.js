/**
 * Core implementation of the path collision resolver.
 *
 * The resolver is given a `exists` predicate (so it works in any environment —
 * Node's fs, an in-memory map, a remote store) and a `suffix` strategy that
 * turns a collision count into a string to insert before the extension.
 *
 * Design decisions, stated plainly:
 *
 *  - Suffixes are inserted BEFORE the final extension, so `report.txt` becomes
 *    `report (1).txt`, not `report.txt (1)`. This keeps the extension
 *    meaningful to downstream tools.
 *  - The original path is returned untouched when it does not exist. We do not
 *    add a suffix "just in case".
 *  - `numericSuffix` starts at 1, not 0, because `file (0).txt` reads as a bug
 *    to most users.
 *  - `timestampSuffix` formats as `YYYYMMDD-HHMMSS` using a clock function so
 *    tests can inject a deterministic time. If two calls within the same
 *    second collide (same timestamp), we fall back to appending `-2`, `-3`, …
 *    rather than silently overwriting.
 *  - There is a hard ceiling on attempts to prevent an accidental infinite
 *    loop if `exists` is misbehaving or a caller has pre-created thousands of
 *    files. The ceiling is configurable and defaults to 10000.
 */

/**
 * Append a numeric suffix `(n)` before the extension.
 *
 * @param {number} attempt - 1-based attempt counter.
 * @returns {(base: string, ext: string) => string}
 */
export function numericSuffix(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`numericSuffix attempt must be a positive integer, got ${attempt}`);
  }
  const tag = ` (${attempt})`;
  return (base, ext) => `${base}${tag}${ext}`;
}

/**
 * Append a timestamp suffix formatted `YYYYMMDD-HHMMSS`.
 *
 * The clock is a function returning milliseconds since the epoch, matching
 * `Date.now`. It is captured at call time so tests can pass a fake clock.
 *
 * If the timestamp itself already exists, a `-2`, `-3`, … counter is appended
 * (handled by the resolver loop, not here — this function only builds the
 * suffix string for a given attempt). Attempt 1 is the bare timestamp;
 * attempt >= 2 adds the counter.
 *
 * @param {number} attempt - 1-based attempt counter.
 * @param {() => number} [clock] - Returns epoch ms. Defaults to Date.now.
 * @returns {(base: string, ext: string) => string}
 */
export function timestampSuffix(attempt, clock = Date.now) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`timestampSuffix attempt must be a positive integer, got ${attempt}`);
  }
  const ms = clock();
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const tag = attempt === 1 ? ` ${stamp}` : ` ${stamp}-${attempt}`;
  return (base, ext) => `${base}${tag}${ext}`;
}

/**
 * Split a filename into [base, ext] where ext includes the leading dot and
 * refers only to the LAST dot segment. `archive.tar.gz` → ['archive.tar', '.gz'].
 * Dotfiles with no other dot (`.bashrc`) are treated as base='.bashrc', ext=''
 * so we don't produce `.bashrc (1)` → `(1).bashrc`-style nonsense.
 *
 * @param {string} name
 * @returns {[string, string]}
 */
function splitName(name) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) {
    // No dot, or leading dot only (dotfile).
    return [name, ''];
  }
  return [name.slice(0, lastDot), name.slice(lastDot)];
}

/**
 * Create a resolver.
 *
 * @param {object} opts
 * @param {(path: string) => boolean} opts.exists - Predicate; return true if the path is taken.
 * @param {(attempt: number) => (base: string, ext: string) => string} [opts.suffix]
 *        Strategy factory. Defaults to numericSuffix.
 * @param {number} [opts.maxAttempts=10000] - Hard ceiling to prevent runaway loops.
 * @returns {(path: string) => string} A function that returns a non-clobbering path.
 */
export function createResolver(opts) {
  if (!opts || typeof opts.exists !== 'function') {
    throw new TypeError('createResolver requires an `exists` predicate');
  }
  const exists = opts.exists;
  const makeSuffix = opts.suffix ?? numericSuffix;
  const maxAttempts = opts.maxAttempts ?? 10000;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(`maxAttempts must be a positive integer, got ${maxAttempts}`);
  }

  return function resolve(path) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError('resolve() requires a non-empty path string');
    }
    if (!exists(path)) {
      return path;
    }
    // Pull the directory off so the suffix lands on the filename, not the folder.
    const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    const dir = lastSep === -1 ? '' : path.slice(0, lastSep + 1);
    const filename = lastSep === -1 ? path : path.slice(lastSep + 1);
    const [base, ext] = splitName(filename);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = dir + makeSuffix(attempt)(base, ext);
      if (!exists(candidate)) {
        return candidate;
      }
    }
    throw new Error(
      `path-collision-resolver: gave up after ${maxAttempts} attempts for "${path}"`
    );
  };
}
