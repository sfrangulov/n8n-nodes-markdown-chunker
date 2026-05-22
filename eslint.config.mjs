import { config } from '@n8n/node-cli/eslint';

// Cloud-eligible community node: pure string logic, zero runtime dependencies,
// no fs/env access. The full `config` (with cloud support) keeps the
// `@n8n/community-nodes/no-runtime-dependencies` rule ON — that rule is the
// gate for the n8n Cloud verified-node panel, so we deliberately do NOT
// disable it here (unlike sibling nodes that ship runtime deps).
export default [{ ignores: ['dist', 'coverage'] }, ...config];
