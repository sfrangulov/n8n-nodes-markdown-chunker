import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { chunk } from './chunker';

export class MarkdownChunker implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Markdown Chunker',
		name: 'markdownChunker',
		icon: { light: 'file:markdownchunker.svg', dark: 'file:markdownchunker.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["sourceField"]}}',
		description:
			'Split Markdown into retrieval-ready chunks with heading-aware metadata for RAG and vector stores',
		defaults: {
			name: 'Markdown Chunker',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Source Field',
				name: 'sourceField',
				type: 'string',
				default: 'markdown',
				placeholder: 'markdown',
				description: 'Name of the input field that holds the Markdown text to chunk',
				required: true,
			},
			{
				displayName: 'Destination Output Field',
				name: 'destinationOutputField',
				type: 'string',
				default: 'text',
				placeholder: 'text',
				description: 'Name of the output field that will hold each chunk’s text',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Max Heading Depth',
						name: 'maxHeadingDepth',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 6 },
						default: 3,
						description:
							'Start a new chunk at ATX headings of this level or shallower (1 = only #, 6 = down to ######)',
					},
					{
						displayName: 'Target Chunk Size (Chars)',
						name: 'targetChunkSize',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 1000,
						description:
							'Soft target chunk size in characters. Set 0 to split on headings only. Fenced code blocks and tables are never broken, so a single large block may exceed this.',
					},
					{
						displayName: 'Chunk Overlap (Chars)',
						name: 'chunkOverlap',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description:
							'Characters of trailing context from the previous chunk to prepend when a chunk is split because of size',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const sourceField = this.getNodeParameter('sourceField', i) as string;
				const destinationOutputField = this.getNodeParameter(
					'destinationOutputField',
					i,
				) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				const value = items[i].json[sourceField];
				if (typeof value !== 'string') {
					throw new NodeOperationError(
						this.getNode(),
						`Input field "${sourceField}" is missing or not a string`,
						{ itemIndex: i },
					);
				}

				const chunks = chunk(value, {
					maxHeadingDepth:
						typeof options.maxHeadingDepth === 'number' ? options.maxHeadingDepth : undefined,
					targetChunkSize:
						typeof options.targetChunkSize === 'number' ? options.targetChunkSize : undefined,
					chunkOverlap:
						typeof options.chunkOverlap === 'number' ? options.chunkOverlap : undefined,
				});

				for (const c of chunks) {
					returnData.push({
						json: {
							[destinationOutputField]: c.text,
							headingPath: c.metadata.headingPath,
							index: c.metadata.index,
							charCount: c.metadata.charCount,
							approxTokens: c.metadata.approxTokens,
						},
						pairedItem: { item: i },
					});
				}
			} catch (err) {
				const wrapped =
					err instanceof NodeOperationError
						? err
						: new NodeOperationError(this.getNode(), err as Error, { itemIndex: i });
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (err as Error).message },
						error: wrapped,
						pairedItem: { item: i },
					});
				} else {
					throw wrapped;
				}
			}
		}

		return [returnData];
	}
}
