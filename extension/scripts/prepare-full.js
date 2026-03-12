const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const buildConfigPath = path.join(__dirname, '..', 'src', 'buildConfig.ts');

// We don't actually need to "filter out" anything here, but we might want to restore
// the package.json to the state where it HAS all commands.
// Actually, it's easier to just use `git checkout package.json` if possible, 
// but for a pure script approach, we can just hardcode the restoration of name/displayName
// and the buildConfig.

function prepareFull() {
    console.log('--- Restoring Full Build Config ---');

    // 1. Update package.json (Basic restoration)
    // Note: This script assumes you are running it after prepare-restricted.
    // If you want to be safe, you should probably backup package.json before restricted.
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    pkg.name = 'ing-sql';
    pkg.displayName = 'ING SQL';
    pkg.description = 'Oracle SQL Developer for VS Code (ING Specific)';

    // Restoring commands/menus is hard without a backup.
    // Recommending the user to use Git or I should have the script backup package.json.

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('✓ package.json basic info restored');

    // 2. Update buildConfig.ts
    const buildConfigContent = `/**
 * Build-time configuration for feature toggling.
 * This file is modified during the build process to enable/disable restricted features.
 */
export const BUILD_CONFIG = {
    isRestricted: false,
    versionSuffix: ""
};
`;
    fs.writeFileSync(buildConfigPath, buildConfigContent, 'utf8');
    console.log('✓ src/buildConfig.ts updated (isRestricted: false)');

    console.log('--- Full Build Config Restored ---');
    console.log('NOTE: To fully restore package.json commands, it is recommended to run: git checkout package.json');
}

prepareFull();
