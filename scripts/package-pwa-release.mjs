import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const releaseId = process.env.SERVEOS_VERSION || execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{7,40}$/.test(releaseId)) throw new Error('SERVEOS_VERSION must be a Git SHA (7 to 40 hexadecimal characters).');
const source = path.join(root, 'dist');
const releaseRoot = path.join(root, 'release', 'web');
const destination = path.join(releaseRoot, releaseId);
const temporary = path.join(releaseRoot, `.${releaseId}.tmp-${process.pid}`);
if (!existsSync(path.join(source, 'index.html')) || !existsSync(path.join(source, 'sw.js'))) throw new Error('Build the PWA before packaging a release.');
if (existsSync(destination)) throw new Error(`Release already exists: ${releaseId}`);
mkdirSync(releaseRoot, {recursive: true});
rmSync(temporary, {recursive: true, force: true});
cpSync(source, temporary, {recursive: true, errorOnExist: true});

const hashFile = filename => createHash('sha256').update(readFileSync(filename)).digest('hex');
const files = [];
const walk = directory => {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('PWA artifact cannot contain symbolic links.');
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) files.push({path: path.relative(temporary, absolute).split(path.sep).join('/'), bytes: statSync(absolute).size, sha256: hashFile(absolute)});
  }
};

try {
  walk(temporary);
  files.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(path.join(temporary, 'release-manifest.json'), `${JSON.stringify({releaseId, createdAt: new Date().toISOString(), files}, null, 2)}\n`, {flag: 'wx'});
  renameSync(temporary, destination);
  console.log(JSON.stringify({event: 'pwa_release_packaged', releaseId, files: files.length, destination}));
} catch (error) {
  rmSync(temporary, {recursive: true, force: true});
  throw error;
}
