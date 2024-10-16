#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { glob } from 'glob';
import pkg from './package.json';
import { Config, ReplacerConfig, ReplacerPattern, ReplacerRange } from './types';
import { Result } from './types/result';

/**
 * Split string to lines  with max length 100
 * @param string
 * @param maxLength
 */
function splitString(string: string, maxLength = 100): string[] {
  const words = string.split(' ');
  const result: string[] = [];
  let index = 0;
  for (let i = 0; i < words.length; i++) {
    if ((result[index] || '').length + words[i].length > maxLength) {
      index++;
    }
    result[index] = `${result[index] || ''} ${words[i]}`;
  }
  return result;
}

/**
 * Display patched files
 * @param file
 * @param result
 */
function logResult(file: string, result: Result): void {
  console.log('\x1b[0;97m  %s\x1b[0m', result.comment);

  console.log('\x1b[0;92m✔\x1b[0m \x1b[0;37m%s\x1b[0m\n', file);

  splitString(result.found).forEach(string => {
    console.log('\x1b[0;31m-   %s\x1b[0m', string.trim().padEnd(102));
  })

  splitString(result.replacement).forEach(string => {
    console.log('\x1b[0;32m+   %s\x1b[0m', string.trim().padEnd(102));
  });
  console.log('');

  console.log('%s', '—'.repeat(100));
}

function logHowRestore() {
  console.log('To restore them to their previous state, you need to \nreinstall the npm packages.');
  console.log('Just run:');

  console.log('\x1b[0;34m');
  console.log('   rm -rf node_modules');
  console.log('   npm install');
  console.log('\x1b[0m');
}

function logHowToWrite() {
  console.log('By default, the script does not modify the npm package files.');
  console.log('To overwrite the found files, run the command with the --write flag');

  console.log('\x1b[0;34m');
  console.log(`   npx %s --write`, pkg.name);
  console.log('\x1b[0m');
}

/**
 * Find replacer config for file path
 * @param filepath
 * @param config
 */
function getReplacerForFile(filepath: string, config: Config): ReplacerConfig | undefined {
  const parts = filepath.split('/node_modules/');
  const last = parts[parts.length - 1];
  const segments = last.split('/');
  const pkg = last.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
  const route = last.startsWith('@') ? segments.slice(2) : segments.slice(1);

  for (let i = 0; i < config.replacers.length; i++) {
    const replacer = config.replacers[i];
    if (!replacer.packages.includes(pkg)) {
      continue;
    }

    const isMatch = replacer.filenames.some(_filename => {
      const _segments = _filename.split('/').reverse();
      const lastRouteIndex = route.length - 1;

      return _segments.every((_segment, index) => _segment === route[lastRouteIndex - index])
    });
    if (isMatch) {
      return replacer;
    }
  }

  return undefined;
}

/**
 * Search with pattern replacer config
 * @param content
 * @param replacer
 * @param comment
 */
function searchPattern(content: { code: string; }, replacer: ReplacerPattern, comment: string): null | Result {
  const pattern = new RegExp(replacer.pattern);
  const result = pattern.exec(content.code);
  if (!result) return null;

  const found = result[0];
  return {
    start: result.index,
    end: result.index + (found.length),
    replacement: replacer.replacement,
    comment,
    found,
  };
}

/**
 * Search with range replacer config
 * @param content
 * @param replacer
 * @param comment
 */
function searchRange(content: { code: string; }, replacer: ReplacerRange, comment: string): null | Result {
  const startPattern = new RegExp(replacer.start);
  const endPattern = new RegExp(replacer.end);

  let startIndex: number;
  const startMatched = startPattern.exec(content.code);
  if (!startMatched) return null;
  startIndex = startMatched.index;

  const endChunk = content.code.slice(startIndex);
  const endMatched = endPattern.exec(endChunk);
  if (!endMatched) return null;

  const endIndexChunk = endMatched.index + endMatched[0].length;
  return {
    start: startIndex,
    end: startIndex + endIndexChunk,
    replacement: replacer.replacement,
    comment,
    found: endChunk.slice(0, endIndexChunk),
  };
}

/**
 * Check file content and prepare replace configuration
 * @param filepath
 * @param config
 */
async function searchAndReplace(filepath: string, config: Config): Promise<null | Result> {
  filepath = join(config.cwd, filepath);
  const content: { code: string; filepath: string } = {
    code: await readFile(filepath, { encoding: 'utf8' }),
    filepath,
  };
  const replaceConfig = getReplacerForFile(filepath, config);
  if (!replaceConfig) {
    throw new Error('No config found');
  }

  let prepared: Result | null;
  switch (replaceConfig.replacer.type) {
    case 'pattern':
      prepared = searchPattern(content, replaceConfig.replacer, replaceConfig.comment);
      break;
    case 'range':
      prepared = searchRange(content, replaceConfig.replacer, replaceConfig.comment);
      break;
  }

  if (!prepared) return null;

  if (config.write) {
    let patched = content.code.slice(0, prepared.start);
    patched += prepared.replacement;
    patched += content.code.slice(prepared.end);

    await writeFile(filepath, patched, { encoding: 'utf8' });
  }

  return prepared;
}

/**
 * Search files in packages for pattern search
 * @param config
 */
async function searchFiles(config: Config): Promise<string[]> {
  const paths = config.replacers.flatMap(({ packages, filenames }) => {
    return packages.map(pkg => filenames.map(filename => `**/node_modules/${pkg}/**/${filename}`));
  }).flat();

  return glob(paths, { cwd: config.cwd });
}

/**
 * Command action callback
 * @param params
 */
async function action(params: Pick<Config, 'cwd' | 'write'>) {
  const config = { ...(pkg.config as Config), ...params };
  const files = await searchFiles(config);

  let isFound = false;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const result = await searchAndReplace(file, config);
    if (!result) continue;

    logResult(file, result);
    isFound = true;
  }

  if (isFound) {
    if (params.write) {
      logHowRestore();
    } else {
      logHowToWrite();
    }
    console.log('\x1b[0;92m✔ Done!\x1b[0m');
  }
}

const program = new Command();

export default program.name(pkg.name)
  .description(pkg.description)
  .option('-w, --write', 'Enable file change. Apply and save all found changes.', false)
  .option('-c, --cwd <path>', 'Base directory', process.cwd())
  .version(pkg.version, '-v, --version', 'output the current version')
  .action(action)
  .parse();

