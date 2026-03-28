import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function parseVersion(version) {
    return version.split('.').map((value) => Number(value));
}

function compareVersion(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < 3; i += 1) {
        const av = pa[i] ?? 0;
        const bv = pb[i] ?? 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function run(command) {
    execSync(command, { stdio: 'inherit' });
}

function runCapture(command) {
    return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] })
        .toString('utf8')
        .trim();
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageName = pkg.name;
const localVersion = pkg.version;
const npmRegistry = 'https://registry.npmjs.org';

let remoteVersion = null;
try {
    remoteVersion = runCapture(
        `npm view ${packageName} version --registry=${npmRegistry}`,
    );
} catch {
    remoteVersion = null;
}

if (remoteVersion) {
    const cmp = compareVersion(localVersion, remoteVersion);
    if (cmp <= 0) {
        console.log(`[release:auto] Local version ${localVersion} <= npm ${remoteVersion}. Bumping patch.`);
        run('npm version patch --no-git-tag-version');
    } else {
        console.log(`[release:auto] Local version ${localVersion} > npm ${remoteVersion}. No bump needed.`);
    }
} else {
    console.log('[release:auto] Package not found on npm. Keeping current version.');
}

run('npm run build');
run(`npm publish --access public --registry=${npmRegistry}`);
