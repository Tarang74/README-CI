import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';

// Sync object
const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
};

export default config;
