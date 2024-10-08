#!/bun/node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type ReplacerType = 'range' | 'pattern'

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

const CONFIG: Config[] = [
  {
    packages: ['react-dom'],
    filenames: ['react-dom.development.js'],
    comment: 'Plugin advertising in browser console',
    replacer: {
      type: 'range',
      start: /console\.info\(["']%cDownload the React DevTools/,
      end: /["']font-weight:bold["']\)/,
      replacement: '(function(){})()',
    }
  }
]

function replacePattern(code: string, config: ReplacerPattern): string | null {
  const result = config.pattern.exec(code);
  if (!result) return null;

  const found = result[0];
  let patched = code.slice(0, result.index);
  patched += config.replacement;
  patched += code.slice(result.index + (found.length));

  return patched;
}

function replaceRange(code: string, config: ReplacerRange): string | null {
  let startIndex: number;
  if (typeof config.start === 'number') {
    startIndex = config.start;
  } else {
    const result = config.start.exec(code);
    if (!result) return null;
    startIndex = result.index;
  }

  const beginChunk = code.slice(0, startIndex);
  let endChunk: string;

  if (typeof config.end === 'number') {
    endChunk = code.slice(config.end);
  } else {
    endChunk = code.slice(startIndex);

    const matched = config.end.exec(endChunk);
    if (!matched) return null;
    endChunk = endChunk.slice(matched.index + matched[0].length);
  }

  return beginChunk + config.replacement + endChunk;
}

/**
 * Find a line in the file and replace it with replacer.
 *
 * @param {string} filepath
 * @param {{ pattern:RegExp,replace:string }} replacer
 * @returns {Promise<boolean>}
 */
async function searchAndPatch(filepath: string, replacer: Replacer): Promise<boolean> {
  const contents = await readFile(filepath, { encoding: 'utf8' });

  let patched: string | null = null;
  if (replacer.type === 'pattern') {
    patched = replacePattern(contents, replacer);
  } else if (replacer.type === 'range') {
    patched = replaceRange(contents, replacer);
  }

  if (!patched) return false;

  await writeFile(filepath, patched, { encoding: 'utf8' });

  return true;
}

/**
 *
 * @param {string} directory
 * @param {(string)[]} filenames
 * @param {{ pattern:RegExp,replace:string }} replace
 * @returns {Promise<Dirent[]>}
 */
async function searchFiles(directory: string, filenames: string[], replace: Replacer): Promise<string[]> {
  const patched: string[] = [];
  const files = await readdir(directory, {
    withFileTypes: true,
    recursive: true,
    encoding: 'utf8',
  })
    .catch(() => []);

  for (const file of files) {
    if (!file.isFile() || !filenames.includes(file.name)) {
      continue;
    }

    const absolute = resolve(file.parentPath, file.name);
    const result = await searchAndPatch(absolute, replace);
    if (!result) {
      continue;
    }

    patched.push(file.name);
  }

  return patched;
}

async function handleConfig(root: string, { packages, filenames, replacer }: Config) {
  const results = [];

  for (const pkg of packages) {
    const pkgPath = resolve(root, pkg);
    const patchedFilenames = await searchFiles(pkgPath, filenames, replacer);
    if (!patchedFilenames.length) {
      continue
    }
    results.push(...patchedFilenames.map(filename => ({ filename, package: pkg })));
  }

  return results as { filename: string, package: string }[];
}

function prepareTable(): TableData {
  return {
    headers: {
      package: 'Package',
      file: 'File',
      comment: 'Comment',
    },
    rows: [],
    widths: {
      package: 8,
      file: 4,
      comment: 7,
    }
  }
}

function renderTable(data: TableData): void {
  const widths = [3, data.widths.package + 2, data.widths.file + 2, data.widths.comment + 2];

  console.log(`┌${widths.map(width => '─'.repeat(width)).join('┬')}┐`);

  console.log(`│   │ ${data.headers.package.padEnd(data.widths.package)} │ ${data.headers.file.padEnd(data.widths.file)} │ ${data.headers.comment.padEnd(data.widths.comment)} │`);

  console.log(`├${widths.map(width => '─'.repeat(width)).join('┼')}┤`);

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];

    const render = `│ \x1b[0;92m✔\x1b[0m ` +
      `│ \x1b[0;93m${row.package.padEnd(data.widths.package)}\x1b[0m ` +
      `│ \x1b[0;93m${row.file.padEnd(data.widths.file)}\x1b[0m ` +
      `│ \x1b[2;95m${row.comment.padEnd(data.widths.comment)}\x1b[0m │`
    console.log(render);
  }

  console.log(`└${widths.map(width => '─'.repeat(width)).join('┴')}┘`);

}

async function run(_configs: Config[]): Promise<void> {
  const root = join(dirname(process.env.npm_package_json || './'), 'node_modules');

  console.log(`\n\x1b[0;36mChecking packages to patch vulnerable files\x1b[0m`);
  let isPatched = false;

  const table: TableData = prepareTable();

  for(const _config of _configs) {
    const patched = await handleConfig(root, _config);

    for (const file of patched) {
      table.rows.push({
        package: file.package,
        file: file.filename,
        comment: _config.comment,
      });
      table.widths.package = table.widths.package > file.package.length ? table.widths.package : file.package.length;
      table.widths.file = table.widths.file > file.filename.length ? table.widths.file : file.filename.length;
      table.widths.comment = table.widths.comment > _config.comment.length ? table.widths.comment :  _config.comment.length;

      isPatched = true;
    }
  }

  if (isPatched) {
    renderTable(table);
    console.log('\x1b[0;32m  Done!\x1b[0m');
  } else {
    console.log('\x1b[0;32m  No files found. It\'s good.\x1b[0m');
  }
}

run(CONFIG)
  .then(() => process.exit(0))
  .catch(err => {
    console.log(err);
    process.exit(1);
  });