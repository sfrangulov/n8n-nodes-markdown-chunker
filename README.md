# n8n-nodes-markdown-chunker

[![npm version](https://img.shields.io/npm/v/n8n-nodes-markdown-chunker.svg)](https://www.npmjs.com/package/n8n-nodes-markdown-chunker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

An [n8n](https://n8n.io) community node that splits Markdown into **retrieval-ready chunks** with heading-aware metadata — the missing link between document conversion and your vector store.

> **convert → chunk → embed.** Pair it with [n8n-nodes-docx-to-md](https://github.com/sfrangulov/n8n-nodes-docx-to-md) or [n8n-nodes-url-to-md](https://github.com/sfrangulov/n8n-nodes-url-to-md) to turn any document or web page into clean Markdown, then slice it into chunks an embeddings model can actually use.

## Why this node

Generic text splitters cut on character counts. They happily slice a code block in half, tear a table apart, and strip the heading context a retriever needs to rank a passage. **Markdown Chunker** understands document structure:

- **Heading-hierarchy splitting** — start a fresh chunk at `#`/`##`/`###` headings, down to a configurable depth.
- **Parent-heading path on every chunk** — `metadata.headingPath` carries the ancestor headings (e.g. `["Guide", "Setup"]`), so a retrieved chunk keeps its context.
- **Atomic code blocks & tables** — fenced code (` ``` `/`~~~`) and GFM tables are never broken across a chunk boundary.
- **Size target + overlap** — a soft character target with optional overlap for size-driven splits.
- **Zero runtime dependencies, no fs/env access** — eligible for the n8n Cloud verified-node panel.
- **`usableAsTool: true`** — callable directly by AI agents.

## Installation

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-markdown-chunker`.

Or with npm in a self-hosted instance:

```bash
npm install n8n-nodes-markdown-chunker
```

## Parameters

| Field | Default | Description |
| --- | --- | --- |
| **Source Field** | `markdown` | Input field holding the Markdown text to chunk. |
| **Destination Output Field** | `text` | Output field that receives each chunk's text. |
| **Max Heading Depth** | `3` | Start a new chunk at ATX headings of this level or shallower (1 = only `#`). |
| **Target Chunk Size (Chars)** | `1000` | Soft target in characters. `0` splits on headings only. Code/tables are never broken, so a single large block may exceed this. |
| **Chunk Overlap (Chars)** | `0` | Trailing context from the previous chunk to prepend when a chunk is split because of size. |

## Output

One n8n item **per chunk**:

```json
{
  "text": "## Setup\n\nInstall the package...",
  "headingPath": ["Guide", "Setup"],
  "index": 1,
  "charCount": 312,
  "approxTokens": 78
}
```

> `approxTokens` is a `charCount / 4` heuristic — deliberately no `tiktoken` dependency, to keep the package dependency-free. Treat it as a rough estimate.

## Before / after retrieval

Without structure-aware chunking, a naive splitter might produce:

```
...end of the authentication section. # Billing You are charged monthly...
```

— two unrelated topics fused into one chunk, and a heading buried mid-text. Markdown Chunker instead yields a clean `Billing` chunk whose `headingPath` is `["Billing"]`, so your retriever ranks it correctly and your LLM sees the right context.

## Example workflow

```
HTTP Request / Read File
        │
        ▼
  URL to MD / Docx to MD      (convert → Markdown)
        │
        ▼
   Markdown Chunker           (chunk → {text, headingPath, ...})
        │
        ▼
 Embeddings + Vector Store    (embed → store)
```

## Development

```bash
npm install
npm test           # jest, 100% coverage gate
npm run lint       # n8n-node lint (cloud-eligibility checks)
npm run build      # n8n-node build
```

## License

[MIT](LICENSE.md) © Sergei Frangulov
