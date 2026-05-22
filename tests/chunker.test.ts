import { chunk, parseBlocks } from '../nodes/MarkdownChunker/chunker';

describe('parseBlocks', () => {
	it('returns no blocks for empty or blank-only input', () => {
		expect(parseBlocks('')).toEqual([]);
		expect(parseBlocks('\n\n   \n\t\n')).toEqual([]);
	});

	it('captures a fenced code block whole (backticks)', () => {
		const md = ['```js', 'const a = 1;', '', '## not a heading', '```', 'after'].join('\n');
		const blocks = parseBlocks(md);
		expect(blocks[0]).toMatchObject({ type: 'code' });
		expect(blocks[0].text).toContain('## not a heading');
		expect(blocks[1]).toMatchObject({ type: 'text', text: 'after' });
	});

	it('captures a tilde-fenced code block', () => {
		const md = ['~~~', 'plain', '~~~'].join('\n');
		expect(parseBlocks(md)[0]).toMatchObject({ type: 'code' });
	});

	it('handles an unterminated fence (runs to EOF)', () => {
		const md = ['```', 'no close'].join('\n');
		const blocks = parseBlocks(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ type: 'code' });
		expect(blocks[0].text).toContain('no close');
	});

	it('captures a GFM table whole', () => {
		const md = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |', '', 'tail'].join('\n');
		const blocks = parseBlocks(md);
		expect(blocks[0]).toMatchObject({ type: 'table' });
		expect(blocks[0].text.split('\n')).toHaveLength(4);
		expect(blocks[1]).toMatchObject({ type: 'text', text: 'tail' });
	});

	it('parses ATX headings with trailing hashes and levels', () => {
		const blocks = parseBlocks('## Title ##');
		expect(blocks[0]).toMatchObject({ type: 'heading', headingLevel: 2, headingTitle: 'Title' });
	});

	it('ends a text run at a following heading, fence, and table', () => {
		expect(parseBlocks('para\n# H')).toMatchObject([{ type: 'text' }, { type: 'heading' }]);
		expect(parseBlocks('para\n```\nx\n```')).toMatchObject([{ type: 'text' }, { type: 'code' }]);
		expect(parseBlocks('para\n| a | b |\n| - | - |')).toMatchObject([
			{ type: 'text' },
			{ type: 'table' },
		]);
	});

	it('does not treat a pipe line without a separator as a table', () => {
		const blocks = parseBlocks('| just | text |\nmore');
		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe('text');
	});
});

describe('chunk — heading hierarchy', () => {
	const md = [
		'# Guide',
		'Intro paragraph.',
		'## Setup',
		'Install steps.',
		'### Details',
		'Fine print.',
	].join('\n');

	it('splits at headings up to max depth and tracks the parent path', () => {
		const chunks = chunk(md, { maxHeadingDepth: 3, targetChunkSize: 0 });
		expect(chunks).toHaveLength(3);
		expect(chunks[0].metadata.headingPath).toEqual([]);
		expect(chunks[0].text).toContain('# Guide');
		expect(chunks[1].metadata.headingPath).toEqual(['Guide']);
		expect(chunks[2].metadata.headingPath).toEqual(['Guide', 'Setup']);
	});

	it('keeps headings deeper than max depth inside the current chunk', () => {
		const chunks = chunk(md, { maxHeadingDepth: 1, targetChunkSize: 0 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toContain('### Details');
		expect(chunks[0].metadata.headingPath).toEqual([]);
	});

	it('opens the first chunk when the document starts with a deep heading', () => {
		const chunks = chunk('### Deep\nbody', { maxHeadingDepth: 1, targetChunkSize: 0 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toContain('### Deep');
	});

	it('pops sibling/deeper headings off the path on a shallower heading', () => {
		const nested = ['# A', '## B', 'b body', '# C', 'c body'].join('\n');
		const chunks = chunk(nested, { maxHeadingDepth: 6, targetChunkSize: 0 });
		const cChunk = chunks.find((c) => c.text.includes('# C'));
		expect(cChunk?.metadata.headingPath).toEqual([]);
	});
});

describe('chunk — atomicity', () => {
	it('never splits a fenced code block even when it exceeds the target size', () => {
		const big = ['```', 'x'.repeat(500), '```'].join('\n');
		const chunks = chunk(big, { targetChunkSize: 50 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].metadata.charCount).toBeGreaterThan(50);
	});

	it('never splits a table mid-rows', () => {
		const table = ['| a | b |', '| - | - |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
		const chunks = chunk(table, { targetChunkSize: 10 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toContain('| 3 | 4 |');
	});
});

describe('chunk — size and overlap', () => {
	const longBody = [
		'# Doc',
		'Para one is reasonably long and descriptive.',
		'Para two continues the discussion at length.',
		'Para three wraps things up with more text here.',
	].join('\n');

	it('splits oversized sections into multiple chunks by block boundary', () => {
		const chunks = chunk(longBody, { maxHeadingDepth: 1, targetChunkSize: 60, chunkOverlap: 0 });
		expect(chunks.length).toBeGreaterThan(1);
		// The first chunk holds the heading itself (no ancestors); size-split
		// continuations live under it.
		expect(chunks[0].metadata.headingPath).toEqual([]);
		expect(chunks[chunks.length - 1].metadata.headingPath).toEqual(['Doc']);
	});

	it('prepends trailing context on size-driven splits when overlap is set', () => {
		const chunks = chunk(longBody, { maxHeadingDepth: 1, targetChunkSize: 60, chunkOverlap: 15 });
		const sizeSplit = chunks[1];
		const prevTail = chunks[0].text.slice(-15);
		expect(sizeSplit.text.startsWith(prevTail)).toBe(true);
	});

	it('does not add overlap across heading boundaries', () => {
		const chunks = chunk(
			['# A', 'aaaa', '## B', 'bbbb'].join('\n'),
			{ maxHeadingDepth: 6, targetChunkSize: 0, chunkOverlap: 10 },
		);
		expect(chunks[1].text).toBe('## B\n\nbbbb');
	});

	it('clamps a negative overlap to zero', () => {
		const chunks = chunk(longBody, { maxHeadingDepth: 1, targetChunkSize: 60, chunkOverlap: -5 });
		expect(chunks[1].text).not.toMatch(/^.{1,5}\n\n/);
	});
});

describe('chunk — metadata and defaults', () => {
	it('computes index, charCount and approxTokens (chars / 4 heuristic)', () => {
		const chunks = chunk('# T\nsome body text', { targetChunkSize: 0 });
		const c = chunks[0];
		expect(c.metadata.index).toBe(0);
		expect(c.metadata.charCount).toBe(c.text.length);
		expect(c.metadata.approxTokens).toBe(Math.ceil(c.text.length / 4));
	});

	it('applies defaults when no options are passed', () => {
		const chunks = chunk('# T\nbody');
		expect(chunks).toHaveLength(1);
		expect(chunks[0].metadata.index).toBe(0);
	});

	it('returns an empty array for whitespace-only input', () => {
		expect(chunk('   \n\n')).toEqual([]);
	});

	it('starts with a text block when there is no leading heading', () => {
		const chunks = chunk('plain paragraph', { targetChunkSize: 0 });
		expect(chunks[0].metadata.headingPath).toEqual([]);
		expect(chunks[0].text).toBe('plain paragraph');
	});
});
