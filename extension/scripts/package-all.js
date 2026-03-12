const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targets = ['darwin-arm64', 'linux-x64'];
const versions = ['full', 'restricted'];

function runBuild() {
    console.log('--- Starting Comprehensive Build for All Platforms ---');

    for (const version of versions) {
        console.log(`\n>>> Packaging ${version.toUpperCase()} version...`);

        // Prepare environment
        if (version === 'restricted') {
            execSync('node scripts/prepare-restricted.js', { stdio: 'inherit' });
        } else {
            execSync('node scripts/prepare-full.js', { stdio: 'inherit' });
        }

        for (const target of targets) {
            console.log(`\n[*] Target: ${target}`);
            try {
                // We use 'yes' to piping into the command to handle all (y/N) prompts
                // Note: on Mac/Linux 'yes' is standard.
                const cmd = `yes y | npx @vscode/vsce package --target ${target} --allow-star-activation`;
                execSync(cmd, { stdio: 'inherit' });
            } catch (err) {
                console.error(`[!] Failed to package ${version} for ${target}: ${err.message}`);
            }
        }

        // Always restore full config after restricted build
        if (version === 'restricted') {
            execSync('node scripts/prepare-full.js', { stdio: 'inherit' });
        }
    }

    console.log('\n--- Build Process Completed ---');
}

runBuild();
