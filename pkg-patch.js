#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const commander_1 = require("commander");
const glob_1 = require("glob");
const package_json_1 = __importDefault(require("./package.json"));
/**
 * Split string to lines  with max length 100
 * @param string
 * @param maxLength
 */
function splitString(string, maxLength = 100) {
    const words = string.split(' ');
    const result = [];
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
function logResult(file, result) {
    console.log('\x1b[0;97m  %s\x1b[0m', result.comment);
    console.log('\x1b[0;92m✔\x1b[0m \x1b[0;37m%s\x1b[0m\n', file);
    splitString(result.found).forEach(string => {
        console.log('\x1b[0;31m-   %s\x1b[0m', string.trim().padEnd(102));
    });
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
    console.log(`   npx %s --write`, package_json_1.default.name);
    console.log('\x1b[0m');
}
/**
 * Find replacer config for file path
 * @param filepath
 * @param config
 */
function getReplacerForFile(filepath, config) {
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
            return _segments.every((_segment, index) => _segment === route[lastRouteIndex - index]);
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
function searchPattern(content, replacer, comment) {
    const pattern = new RegExp(replacer.pattern);
    const result = pattern.exec(content.code);
    if (!result)
        return null;
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
function searchRange(content, replacer, comment) {
    const startPattern = new RegExp(replacer.start);
    const endPattern = new RegExp(replacer.end);
    let startIndex;
    const startMatched = startPattern.exec(content.code);
    if (!startMatched)
        return null;
    startIndex = startMatched.index;
    const endChunk = content.code.slice(startIndex);
    const endMatched = endPattern.exec(endChunk);
    if (!endMatched)
        return null;
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
function searchAndReplace(filepath, config) {
    return __awaiter(this, void 0, void 0, function* () {
        filepath = (0, node_path_1.join)(config.cwd, filepath);
        const content = {
            code: yield (0, promises_1.readFile)(filepath, { encoding: 'utf8' }),
            filepath,
        };
        const replaceConfig = getReplacerForFile(filepath, config);
        if (!replaceConfig) {
            throw new Error('No config found');
        }
        let prepared;
        switch (replaceConfig.replacer.type) {
            case 'pattern':
                prepared = searchPattern(content, replaceConfig.replacer, replaceConfig.comment);
                break;
            case 'range':
                prepared = searchRange(content, replaceConfig.replacer, replaceConfig.comment);
                break;
        }
        if (!prepared)
            return null;
        if (config.write) {
            let patched = content.code.slice(0, prepared.start);
            patched += prepared.replacement;
            patched += content.code.slice(prepared.end);
            yield (0, promises_1.writeFile)(filepath, patched, { encoding: 'utf8' });
        }
        return prepared;
    });
}
/**
 * Search files in packages for pattern search
 * @param config
 */
function searchFiles(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const paths = config.replacers.flatMap(({ packages, filenames }) => {
            return packages.map(pkg => filenames.map(filename => `**/node_modules/${pkg}/**/${filename}`));
        }).flat();
        return (0, glob_1.glob)(paths, { cwd: config.cwd });
    });
}
/**
 * Command action callback
 * @param params
 */
function action(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = Object.assign(Object.assign({}, package_json_1.default.config), params);
        const files = yield searchFiles(config);
        let isFound = false;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = yield searchAndReplace(file, config);
            if (!result)
                continue;
            logResult(file, result);
            isFound = true;
        }
        if (isFound) {
            if (params.write) {
                logHowRestore();
            }
            else {
                logHowToWrite();
            }
            console.log('\x1b[0;92m✔ Done!\x1b[0m');
        }
    });
}
const program = new commander_1.Command();
exports.default = program.name(package_json_1.default.name)
    .description(package_json_1.default.description)
    .option('-w, --write', 'Enable file change. Apply and save all found changes.', false)
    .option('-c, --cwd <path>', 'Base directory', process.cwd())
    .version(package_json_1.default.version, '-v, --version', 'output the current version')
    .action(action)
    .parse();
