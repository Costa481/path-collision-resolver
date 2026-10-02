# Path Collision Resolver

Generates non-clobbering filenames by appending numeric or timestamp suffixes when target paths already exist.

## Usage

```js
import { createResolver, numericSuffix, timestampSuffix } from 'path-collision-resolver';
import * as fs from 'node:fs';

// Numeric strategy (default): file.txt → file (1).txt → file (2).txt …
const resolve = createResolver({ exists: (p) => fs.existsSync(p) });
resolve('/tmp/report.txt'); // '/tmp/report.txt' if free, otherwise '/tmp/report (1).txt'

// Timestamp strategy: file.txt → file 20240102-030405.txt
const resolveTs = createResolver({
  exists: (p) => fs.existsSync(p),
  suffix: (attempt) => timestampSuffix(attempt, () => Date.now()),
});
```

## Why this exists

When a process writes many files into a shared directory — exports, logs, scraped attachments — silently overwriting an existing file is a data-loss bug. Renaming by hand is tedious and racy. This library gives you a single pure function that, given an `exists` predicate, returns the first path that does not collide.

The trade-off: the resolver does no locking. If two processes both ask for `report.txt` at the same instant, both will receive `report (1).txt` and one will still clobber the other. Use this for single-writer scenarios, or wrap the `exists` check and the subsequent write in your own lock. Adding locking here would force a dependency on a specific filesystem or IPC mechanism, which is exactly the kind of opinion this library refuses to take.

## Edge cases worth knowing

- The suffix goes **before** the final extension: `archive.tar.gz` → `archive.tar (1).gz`. Only the last dot segment counts as the extension.
- Dotfiles like `.bashrc` are treated as the whole name, so you get `.bashrc (1)`, not `(1).bashrc`.
- `timestampSuffix` formats in **UTC**. If you need local time, pass a clock that offsets accordingly. Two writes in the same second collide on the same stamp; the resolver then falls back to `-2`, `-3`, … so you never silently overwrite.
- There is a hard ceiling (default 10000 attempts) after which `resolve()` throws. Without it, a hostile `exists` predicate could loop forever.

## Exports

- `createResolver({ exists, suffix?, maxAttempts? })` → `(path: string) => string`
- `numericSuffix(attempt: number)` → `(base, ext) => string`
- `timestampSuffix(attempt: number, clock?: () => number)` → `(base, ext) => string`

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

