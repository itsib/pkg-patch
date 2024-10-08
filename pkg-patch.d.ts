#!/bun/node
export type ReplacerType = 'range' | 'pattern';
export interface ReplacerBase {
    type: ReplacerType;
    replacement: string;
}
export interface ReplacerRange extends ReplacerBase {
    type: 'range';
    start: RegExp | number;
    end: RegExp | number;
}
export interface ReplacerPattern extends ReplacerBase {
    type: 'pattern';
    pattern: RegExp;
}
export type Replacer = ReplacerPattern | ReplacerRange;
export interface Config {
    packages: string[];
    filenames: string[];
    comment: string;
    replacer: Replacer;
}
export interface TableRow {
    package: string;
    file: string;
    comment: string;
}
export interface TableWidths {
    package: number;
    file: number;
    comment: number;
}
export interface TableData {
    headers: TableRow;
    rows: TableRow[];
    widths: TableWidths;
}
