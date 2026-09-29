import { rmSync } from 'node:fs';
// Fixed build artifact path only; never delete application databases.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
