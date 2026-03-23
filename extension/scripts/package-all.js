const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASES_DIR = path.join(ROOT, 'releases');
const REGULAR_DIR = path.join(RELEASES_DIR, 'regular');
const RESTRICTED_DIR = path.join(RELEASES_DIR, 'restricted');
const ARCHIVE_DIR = path.join(RELEASES_DIR, 'archive');

const targets = ['darwin-arm64', 'linux-x64'];
const builds = [
    { name: 'Full', flags: '', restricted: false },
    { name: 'Full+Intellisense', flags: '--intellisense', restricted: false },
    { name: 'Restricted', flags: '--restricted', restricted: true },
    { name: 'Restricted+Intellisense', flags: '--restricted --intellisense', restricted: true }
];

function ensureDirs() {
    [RELEASES_DIR, REGULAR_DIR, RESTRICTED_DIR, ARCHIVE_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
}

function archiveOldReleases() {
    console.log('\n[*] Archiving old releases...');
    let archived = 0;
    for (const dir of [REGULAR_DIR, RESTRICTED_DIR]) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.vsix'));
        for (const file of files) {
            const src = path.join(dir, file);
            const dest = path.join(ARCHIVE_DIR, file);
            fs.renameSync(src, dest);
            console.log(`  → ${file}`);
            archived++;
        }
    }
    if (archived === 0) {
        console.log('  (no old releases to archive)');
    } else {
        console.log(`  ✓ ${archived} file(s) archived`);
    }
}

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version;
}

function runBuild() {
    const version = getVersion();
    console.log(`--- Starting Comprehensive Build v${version} for All Platforms ---`);

    ensureDirs();
    archiveOldReleases();

    // Delete stale backup so prepare.js captures the current canonical version
    const bakPath = path.join(ROOT, 'package.json.bak');
    if (fs.existsSync(bakPath)) {
        fs.unlinkSync(bakPath);
    }

    for (const build of builds) {
        console.log(`\n>>> Packaging ${build.name.toUpperCase()} version...`);

        // Prepare environment
        execSync(`node scripts/prepare.js ${build.flags}`, { stdio: 'inherit' });

        for (const target of targets) {
            console.log(`\n[*] Target: ${target}`);
            try {
                const cmd = `yes y | npx @vscode/vsce package --target ${target} --allow-star-activation`;
                execSync(cmd, { stdio: 'inherit' });

                // Move the generated VSIX to the correct releases folder
                const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.vsix'));
                const destDir = build.restricted ? RESTRICTED_DIR : REGULAR_DIR;
                for (const file of files) {
                    const src = path.join(ROOT, file);
                    const dest = path.join(destDir, file);
                    fs.renameSync(src, dest);
                    console.log(`  ✓ Moved to releases/${build.restricted ? 'restricted' : 'regular'}/${file}`);
                }
            } catch (err) {
                console.error(`[!] Failed to package ${build.name} for ${target}: ${err.message}`);
            }
        }
    }

    // Restore to full at the end
    execSync('node scripts/prepare.js', { stdio: 'inherit' });

    console.log('\n--- Build Process Completed ---');
    console.log(`\nRelease artifacts:`);
    console.log(`  releases/regular/    → Full builds`);
    console.log(`  releases/restricted/ → Restricted builds`);
    console.log(`  releases/archive/    → Previous versions`);
}

runBuild();
