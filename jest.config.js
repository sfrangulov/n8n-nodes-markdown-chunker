/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/?(*.)+(test|spec).ts'],
	moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'cjs', 'json', 'node'],
	collectCoverageFrom: ['nodes/**/*.ts', '!**/*.d.ts'],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'text-summary', 'lcov'],
	coverageThreshold: {
		global: {
			branches: 100,
			functions: 100,
			lines: 100,
			statements: 100,
		},
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				tsconfig: {
					esModuleInterop: true,
					target: 'es2019',
					module: 'commonjs',
					strict: true,
					resolveJsonModule: true,
				},
			},
		],
		'^.+\\.(mjs|js)$': 'babel-jest',
	},
	transformIgnorePatterns: [],
};
