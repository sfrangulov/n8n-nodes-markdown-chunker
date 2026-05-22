import type { IExecuteFunctions } from 'n8n-workflow';

import { MarkdownChunker } from '../nodes/MarkdownChunker/MarkdownChunker.node';

const MD = ['# Title', 'Intro.', '## Section', 'Body text here.'].join('\n');

interface ItemSpec {
	json: Record<string, unknown>;
	params?: Record<string, unknown>;
}

function makeContext(
	items: ItemSpec[],
	opts: {
		continueOnFail?: boolean;
		defaults?: Record<string, unknown>;
		throwPlainOn?: string;
	} = {},
): IExecuteFunctions {
	const defaults: Record<string, unknown> = {
		sourceField: 'markdown',
		destinationOutputField: 'text',
		options: {},
		...opts.defaults,
	};
	return {
		getInputData: () => items.map((it) => ({ json: it.json })),
		getNodeParameter: (name: string, i: number, fallback?: unknown) => {
			if (opts.throwPlainOn === name) {
				throw new Error(`boom on ${name}`);
			}
			const v = items[i]?.params?.[name] ?? defaults[name];
			return v === undefined ? fallback : v;
		},
		getNode: () => ({ name: 'Markdown Chunker' }),
		continueOnFail: () => opts.continueOnFail ?? false,
	} as unknown as IExecuteFunctions;
}

function run(ctx: IExecuteFunctions) {
	return new MarkdownChunker().execute.call(ctx);
}

describe('MarkdownChunker.execute', () => {
	it('emits one output item per chunk with text and metadata', async () => {
		const ctx = makeContext([{ json: { markdown: MD } }], {
			defaults: { options: { targetChunkSize: 0 } },
		});
		const [out] = await run(ctx);
		expect(out.length).toBeGreaterThan(1);
		expect(out[0].json).toHaveProperty('text');
		expect(out[0].json).toHaveProperty('headingPath');
		expect(out[0].json).toHaveProperty('index', 0);
		expect(out[0].json).toHaveProperty('charCount');
		expect(out[0].json).toHaveProperty('approxTokens');
		expect(out[0].pairedItem).toEqual({ item: 0 });
	});

	it('writes chunk text into a custom destination field with default options', async () => {
		// options left as the default {} — exercises the undefined-option branches.
		const ctx = makeContext([{ json: { markdown: MD } }], {
			defaults: { destinationOutputField: 'chunk' },
		});
		const [out] = await run(ctx);
		expect(out[0].json).toHaveProperty('chunk');
	});

	it('passes numeric options through to the chunker', async () => {
		const ctx = makeContext([{ json: { markdown: MD } }], {
			defaults: { options: { maxHeadingDepth: 1, targetChunkSize: 500, chunkOverlap: 10 } },
		});
		const [out] = await run(ctx);
		// maxHeadingDepth 1 keeps the ## section in the single chunk.
		expect(out).toHaveLength(1);
	});

	it('throws a NodeOperationError when the source field is missing', async () => {
		const ctx = makeContext([{ json: { other: 'x' } }]);
		await expect(run(ctx)).rejects.toThrow(/missing or not a string/);
	});

	it('reports the error per item when continueOnFail is on', async () => {
		const ctx = makeContext([{ json: { other: 'x' } }], { continueOnFail: true });
		const [out] = await run(ctx);
		expect(out[0].json).toHaveProperty('error');
		expect(out[0].error).toBeDefined();
	});

	it('wraps a non-NodeOperationError and rethrows it', async () => {
		const ctx = makeContext([{ json: { markdown: MD } }], { throwPlainOn: 'options' });
		await expect(run(ctx)).rejects.toThrow(/boom on options/);
	});

	it('wraps a non-NodeOperationError under continueOnFail', async () => {
		const ctx = makeContext([{ json: { markdown: MD } }], {
			throwPlainOn: 'options',
			continueOnFail: true,
		});
		const [out] = await run(ctx);
		expect(out[0].json.error).toBe('boom on options');
	});
});
