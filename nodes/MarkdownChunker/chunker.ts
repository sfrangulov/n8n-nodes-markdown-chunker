// Markdown-aware chunker. Pure string logic — zero runtime dependencies, no
// fs/env access — so the node qualifies for the n8n Cloud verified panel.
//
// The splitter walks Markdown into atomic blocks (headings, fenced code,
// tables, paragraphs), then groups blocks into chunks that:
//   • start a fresh chunk at headings up to a configurable depth,
//   • never break a fenced code block or a table across a boundary,
//   • respect a target chunk size (in characters) with optional overlap,
//   • carry the parent-heading path plus size metadata on every chunk.

export interface ChunkOptions {
	/** Start a new chunk at ATX headings of this level or shallower (1–6). Default 3. */
	maxHeadingDepth?: number;
	/**
	 * Soft target chunk size in characters. A new chunk starts before a block
	 * that would push the current chunk past this size. 0 disables size-based
	 * splitting (split on headings only). Atomic blocks (code/tables) are never
	 * broken, so a single oversized block may exceed the target. Default 1000.
	 */
	targetChunkSize?: number;
	/**
	 * Characters of trailing context from the previous chunk to prepend when a
	 * new chunk is opened because of size (not because of a heading). Default 0.
	 */
	chunkOverlap?: number;
}

export interface ChunkMetadata {
	/** Parent ATX headings (outermost first) in effect where the chunk begins. */
	headingPath: string[];
	/** Zero-based position of the chunk in the output sequence. */
	index: number;
	/** Number of characters in the chunk text. */
	charCount: number;
	/**
	 * Approximate token count. Heuristic: ceil(charCount / 4) — deliberately
	 * avoids a real tokenizer (e.g. tiktoken) to keep the package dependency-free.
	 * Treat it as a rough estimate, not an exact count.
	 */
	approxTokens: number;
}

export interface Chunk {
	text: string;
	metadata: ChunkMetadata;
}

type BlockType = 'heading' | 'code' | 'table' | 'text';

interface Block {
	type: BlockType;
	text: string;
	/** For headings only: the ATX level (1–6) and the heading title. */
	headingLevel?: number;
	headingTitle?: string;
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/;

const APPROX_CHARS_PER_TOKEN = 4;

function approxTokens(charCount: number): number {
	return Math.ceil(charCount / APPROX_CHARS_PER_TOKEN);
}

function isBlank(line: string): boolean {
	return line.trim() === '';
}

// A GFM table separator row, e.g. `| --- | :--: |` or `---|---`.
function isTableSeparator(line: string): boolean {
	return /^[\s:|-]+$/.test(line) && line.includes('-') && line.includes('|');
}

// A candidate table row: contains a pipe and is not itself a separator.
function looksLikeTableRow(line: string): boolean {
	return line.includes('|') && !isBlank(line);
}

// Split raw Markdown into ordered atomic blocks. Fenced code and tables are
// captured whole; headings become their own blocks; everything else is grouped
// into paragraph blocks separated by blank lines.
export function parseBlocks(markdown: string): Block[] {
	const lines = markdown.split('\n');
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (isBlank(line)) {
			i++;
			continue;
		}

		// Fenced code block — consume until the matching closing fence or EOF.
		const fence = line.match(FENCE_RE);
		if (fence) {
			const marker = fence[2][0]; // ` or ~
			const len = fence[2].length;
			const closeRe = new RegExp(`^\\s*${marker === '`' ? '`' : '~'}{${len},}\\s*$`);
			const buf = [line];
			i++;
			while (i < lines.length) {
				buf.push(lines[i]);
				const closed = closeRe.test(lines[i]);
				i++;
				if (closed) break;
			}
			blocks.push({ type: 'code', text: buf.join('\n') });
			continue;
		}

		// Table — a row followed by a separator row, then more rows.
		if (looksLikeTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
			const buf = [line, lines[i + 1]];
			i += 2;
			while (i < lines.length && looksLikeTableRow(lines[i])) {
				buf.push(lines[i]);
				i++;
			}
			blocks.push({ type: 'table', text: buf.join('\n') });
			continue;
		}

		// Heading.
		const heading = line.match(HEADING_RE);
		if (heading) {
			blocks.push({
				type: 'heading',
				text: line.trimEnd(),
				headingLevel: heading[1].length,
				headingTitle: heading[2].trim(),
			});
			i++;
			continue;
		}

		// Paragraph / generic text — until a blank line or a special block start.
		const buf = [line];
		i++;
		while (i < lines.length && !isBlank(lines[i])) {
			const next = lines[i];
			if (FENCE_RE.test(next)) break;
			if (HEADING_RE.test(next)) break;
			if (looksLikeTableRow(next) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
			buf.push(next);
			i++;
		}
		blocks.push({ type: 'text', text: buf.join('\n') });
	}

	return blocks;
}

interface RawChunk {
	parts: string[];
	headingPath: string[];
	/** True when this chunk was opened because of size, not a heading. */
	sizeSplit: boolean;
}

function joinParts(parts: string[]): string {
	return parts.join('\n\n');
}

/**
 * Split Markdown into retrieval-ready chunks.
 *
 * @param markdown Raw Markdown text.
 * @param options  Splitting controls (see {@link ChunkOptions}).
 */
export function chunk(markdown: string, options: ChunkOptions = {}): Chunk[] {
	const maxHeadingDepth = options.maxHeadingDepth ?? 3;
	const targetChunkSize = options.targetChunkSize ?? 1000;
	const chunkOverlap = Math.max(0, options.chunkOverlap ?? 0);

	const blocks = parseBlocks(markdown);
	const stack: Array<{ level: number; title: string }> = [];
	const raw: RawChunk[] = [];
	let current: RawChunk | null = null;

	const pathTitles = () => stack.map((h) => h.title);

	const open = (headingPath: string[], sizeSplit: boolean): RawChunk => {
		const rc: RawChunk = { parts: [], headingPath, sizeSplit };
		raw.push(rc);
		return rc;
	};

	for (const block of blocks) {
		if (block.type === 'heading') {
			const level = block.headingLevel as number;
			// Ancestor path is the stack *before* this heading is pushed.
			while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
			const ancestors = pathTitles();
			stack.push({ level, title: block.headingTitle as string });

			if (level <= maxHeadingDepth || current === null) {
				current = open(ancestors, false);
			}
			current.parts.push(block.text);
			continue;
		}

		const path = pathTitles();
		if (current === null) {
			current = open(path, false);
		} else if (
			targetChunkSize > 0 &&
			current.parts.length > 0 &&
			joinParts(current.parts).length + block.text.length + 2 > targetChunkSize
		) {
			current = open(path, true);
		}
		current.parts.push(block.text);
	}

	// Assemble final chunks: apply overlap for size-driven boundaries, drop
	// empties, and compute metadata.
	const chunks: Chunk[] = [];
	let prevText = '';
	for (const rc of raw) {
		let text = joinParts(rc.parts).trim();
		if (rc.sizeSplit && chunkOverlap > 0) {
			const overlap = prevText.slice(-chunkOverlap);
			text = `${overlap}\n\n${text}`;
		}
		const charCount = text.length;
		chunks.push({
			text,
			metadata: {
				headingPath: rc.headingPath,
				index: chunks.length,
				charCount,
				approxTokens: approxTokens(charCount),
			},
		});
		prevText = text;
	}

	return chunks;
}
