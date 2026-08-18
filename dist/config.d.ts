import type { AgentSetupBundle } from './types.js';
export interface LoadedConfig {
    bundle: AgentSetupBundle;
    source: 'file' | 'environment';
    configPath: string | null;
}
export declare function defaultConfigPath(environment?: NodeJS.ProcessEnv): string;
export declare function loadConfig(explicitPath?: string, environment?: NodeJS.ProcessEnv): Promise<LoadedConfig>;
export declare function saveConfig(bundle: AgentSetupBundle, explicitPath?: string, environment?: NodeJS.ProcessEnv): Promise<string>;
export declare function readSetupSource(source?: string): Promise<AgentSetupBundle>;
//# sourceMappingURL=config.d.ts.map