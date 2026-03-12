const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJsonBackupPath = path.join(__dirname, '..', 'package.json.bak');
const buildConfigPath = path.join(__dirname, '..', 'src', 'buildConfig.ts');

function prepareFull() {
    console.log('--- Restoring Full Build Config ---');

    // 1. Restore package.json from backup if it exists
    if (fs.existsSync(packageJsonBackupPath)) {
        fs.copyFileSync(packageJsonBackupPath, packageJsonPath);
        fs.unlinkSync(packageJsonBackupPath);
        console.log('✓ package.json restored from backup');
    } else {
        // Fallback restoration
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        pkg.name = 'ing-sql';
        pkg.displayName = 'ING SQL';
        pkg.description = 'Oracle SQL Developer for VS Code (ING Specific)';
        fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
        console.log('✓ package.json basic info restored (no backup found)');
    }

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
}

prepareFull();
