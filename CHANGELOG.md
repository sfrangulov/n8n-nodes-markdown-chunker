# Changelog

## 0.1.0

Initial release.

- Heading-hierarchy splitting on ATX headings with configurable max depth.
- Fenced code blocks and Markdown tables are never broken across chunks.
- Parent-heading path plus `index`, `charCount`, and `approxTokens` metadata on every chunk.
- Target chunk size (chars) with optional overlap; `approxTokens` is a `chars / 4` heuristic (no tokenizer dependency).
- Zero runtime dependencies, no fs/env access — eligible for the n8n Cloud verified-node panel.
- `usableAsTool: true` — callable by AI agents.
