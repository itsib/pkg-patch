export type ReplacerType = 'range' | 'pattern';
export interface ReplacerBase {
    type: ReplacerType;
    replacement: string;
}
export interface ReplacerRange extends ReplacerBase {
    type: 'range';
    start: string;
    end: string;
}
export interface ReplacerPattern extends ReplacerBase {
    type: 'pattern';
    pattern: string;
}
export type Replacer = ReplacerPattern | ReplacerRange;
export interface ReplacerConfig {
    packages: string[];
    filenames: string[];
    comment: string;
    replacer: Replacer;
}
export interface Config {
    /**
     * Replacers configurations
     */
    readonly replacers: ReplacerConfig[];
    /**
     * Root directory for search packages
     */
    readonly cwd: string;
    /**
     * If true then file content will be replaced and saved
     */
    readonly write: boolean;
}
