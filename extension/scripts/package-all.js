const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASES_DIR = path.join(ROOT, 'releases');
const REGULAR_DIR = path.join(RELEASES_DIR, 'regular');
const RESTRICTED_DIR = path.join(RELEASES_DIR, 'restricted');

const targets = ['darwin-arm64', 'linux-x64'];
const builds = [
    { name: 'Full', flags: '', restricted: false },
    { name: 'Full+Intellisense', flags: '--intellisense', restricted: false },
    { name: 'Restricted', flags: '--restricted', restricted: true },
    { name: 'Restricted+Intellisense', flags: '--restricted --intellisense', restricted: true }
];

function ensureDirs() {
    [RELEASES_DIR, REGULAR_DIR, RESTRICTED_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
}

function deleteOldReleases() {
    console.log('\n[*] Cleaning old releases...');
    let deleted = 0;
    for (const dir of [REGULAR_DIR, RESTRICTED_DIR]) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.vsix') || f.endsWith('.zip'));
        for (const file of files) {
            fs.unlinkSync(path.join(dir, file));
            console.log(`  ✗ ${file}`);
            deleted++;
        }
    }
    if (deleted === 0) {
        console.log('  (no old releases to clean)');
    } else {
        console.log(`  ✓ ${deleted} file(s) removed`);
    }
}

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version;
}

function createLinuxIntlZip(version) {
    const vsixName = `ing-sql-intl-linux-x64-${version}.vsix`;
    const zipName = `ing-sql-intl-linux-x64-${version}.zip`;
    const vsixPath = path.join(REGULAR_DIR, vsixName);
    const zipPath = path.join(REGULAR_DIR, zipName);

    if (!fs.existsSync(vsixPath)) {
        console.log(`\n[!] Cannot create zip — ${vsixName} not found`);
        return;
    }

    console.log(`\n[*] Creating zip for Linux x64 Intellisense...`);
    try {
        execSync(`zip "${zipPath}" "${vsixName}"`, { cwd: REGULAR_DIR, stdio: 'inherit' });
        console.log(`  ✓ Created ${zipName}`);
    } catch (err) {
        console.error(`  [!] Failed to create zip: ${err.message}`);
    }
}

function runBuild() {
    const version = getVersion();
    console.log(`--- Starting Comprehensive Build v${version} for All Platforms ---`);

    ensureDirs();
    deleteOldReleases();

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

    // Create zip of Linux x64 Intellisense version
    createLinuxIntlZip(version);

    // Restore to full at the end
    execSync('node scripts/prepare.js', { stdio: 'inherit' });

    console.log('\n--- Build Process Completed ---');
    console.log(`\nRelease artifacts:`);
    console.log(`  releases/regular/    → Full builds`);
    console.log(`  releases/restricted/ → Restricted builds`);
}

runBuild();
