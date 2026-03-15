const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targets = ['darwin-arm64', 'linux-x64'];
const builds = [
    { name: 'Full', flags: '' },
    { name: 'Full+Intellisense', flags: '--intellisense' },
    { name: 'Restricted', flags: '--restricted' },
    { name: 'Restricted+Intellisense', flags: '--restricted --intellisense' }
];

function runBuild() {
    console.log('--- Starting Comprehensive Build for All Platforms (1.0.0) ---');

    for (const build of builds) {
        console.log(`\n>>> Packaging ${build.name.toUpperCase()} version...`);

        // Prepare environment
        execSync(`node scripts/prepare.js ${build.flags}`, { stdio: 'inherit' });

        for (const target of targets) {
            console.log(`\n[*] Target: ${target}`);
            try {
                // We use 'yes' to piping into the command to handle all (y/N) prompts
                const cmd = `yes y | npx @vscode/vsce package --target ${target} --allow-star-activation`;
                execSync(cmd, { stdio: 'inherit' });
            } catch (err) {
                console.error(`[!] Failed to package ${build.name} for ${target}: ${err.message}`);
            }
        }
    }

    // Restore to full at the end
    execSync('node scripts/prepare.js', { stdio: 'inherit' });

    console.log('\n--- Build Process Completed ---');
}

runBuild();
