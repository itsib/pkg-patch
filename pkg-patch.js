#!/bun/node
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
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const CONFIG = [
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
];
function replacePattern(code, config) {
    const result = config.pattern.exec(code);
    if (!result)
        return null;
    const found = result[0];
    let patched = code.slice(0, result.index);
    patched += config.replacement;
    patched += code.slice(result.index + (found.length));
    return patched;
}
function replaceRange(code, config) {
    let startIndex;
    if (typeof config.start === 'number') {
        startIndex = config.start;
    }
    else {
        const result = config.start.exec(code);
        if (!result)
            return null;
        startIndex = result.index;
    }
    const beginChunk = code.slice(0, startIndex);
    let endChunk;
    if (typeof config.end === 'number') {
        endChunk = code.slice(config.end);
    }
    else {
        endChunk = code.slice(startIndex);
        const matched = config.end.exec(endChunk);
        if (!matched)
            return null;
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
function searchAndPatch(filepath, replacer) {
    return __awaiter(this, void 0, void 0, function* () {
        const contents = yield (0, promises_1.readFile)(filepath, { encoding: 'utf8' });
        let patched = null;
        if (replacer.type === 'pattern') {
            patched = replacePattern(contents, replacer);
        }
        else if (replacer.type === 'range') {
            patched = replaceRange(contents, replacer);
        }
        if (!patched)
            return false;
        yield (0, promises_1.writeFile)(filepath, patched, { encoding: 'utf8' });
        return true;
    });
}
/**
 *
 * @param {string} directory
 * @param {(string)[]} filenames
 * @param {{ pattern:RegExp,replace:string }} replace
 * @returns {Promise<Dirent[]>}
 */
function searchFiles(directory, filenames, replace) {
    return __awaiter(this, void 0, void 0, function* () {
        const patched = [];
        const files = yield (0, promises_1.readdir)(directory, {
            withFileTypes: true,
            recursive: true,
            encoding: 'utf8',
        })
            .catch(() => []);
        for (const file of files) {
            if (!file.isFile() || !filenames.includes(file.name)) {
                continue;
            }
            const absolute = (0, node_path_1.resolve)(file.parentPath, file.name);
            const result = yield searchAndPatch(absolute, replace);
            if (!result) {
                continue;
            }
            patched.push(file.name);
        }
        return patched;
    });
}
function handleConfig(root_1, _a) {
    return __awaiter(this, arguments, void 0, function* (root, { packages, filenames, replacer }) {
        const results = [];
        for (const pkg of packages) {
            const pkgPath = (0, node_path_1.resolve)(root, pkg);
            const patchedFilenames = yield searchFiles(pkgPath, filenames, replacer);
            if (!patchedFilenames.length) {
                continue;
            }
            results.push(...patchedFilenames.map(filename => ({ filename, package: pkg })));
        }
        return results;
    });
}
function prepareTable() {
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
    };
}
function renderTable(data) {
    const widths = [3, data.widths.package + 2, data.widths.file + 2, data.widths.comment + 2];
    console.log(`┌${widths.map(width => '─'.repeat(width)).join('┬')}┐`);
    console.log(`│   │ ${data.headers.package.padEnd(data.widths.package)} │ ${data.headers.file.padEnd(data.widths.file)} │ ${data.headers.comment.padEnd(data.widths.comment)} │`);
    console.log(`├${widths.map(width => '─'.repeat(width)).join('┼')}┤`);
    for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        const render = `│ \x1b[0;92m✔\x1b[0m ` +
            `│ \x1b[0;93m${row.package.padEnd(data.widths.package)}\x1b[0m ` +
            `│ \x1b[0;93m${row.file.padEnd(data.widths.file)}\x1b[0m ` +
            `│ \x1b[2;95m${row.comment.padEnd(data.widths.comment)}\x1b[0m │`;
        console.log(render);
    }
    console.log(`└${widths.map(width => '─'.repeat(width)).join('┴')}┘`);
}
function run(_configs) {
    return __awaiter(this, void 0, void 0, function* () {
        const root = (0, node_path_1.join)((0, node_path_1.dirname)(process.env.npm_package_json || './'), 'node_modules');
        console.log(`\n\x1b[0;36mChecking packages to patch vulnerable files\x1b[0m`);
        let isPatched = false;
        const table = prepareTable();
        for (const _config of _configs) {
            const patched = yield handleConfig(root, _config);
            for (const file of patched) {
                table.rows.push({
                    package: file.package,
                    file: file.filename,
                    comment: _config.comment,
                });
                table.widths.package = table.widths.package > file.package.length ? table.widths.package : file.package.length;
                table.widths.file = table.widths.file > file.filename.length ? table.widths.file : file.filename.length;
                table.widths.comment = table.widths.comment > _config.comment.length ? table.widths.comment : _config.comment.length;
                isPatched = true;
            }
        }
        if (isPatched) {
            renderTable(table);
            console.log('\x1b[0;32m  Done!\x1b[0m');
        }
        else {
            console.log('\x1b[0;32m  No files found. It\'s good.\x1b[0m');
        }
    });
}
run(CONFIG)
    .then(() => process.exit(0))
    .catch(err => {
    console.log(err);
    process.exit(1);
});
