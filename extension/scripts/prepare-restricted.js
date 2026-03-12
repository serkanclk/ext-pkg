const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJsonBackupPath = path.join(__dirname, '..', 'package.json.bak');
const buildConfigPath = path.join(__dirname, '..', 'src', 'buildConfig.ts');

const restrictedCommands = [
    'ingSql.exportData',
    'ingSql.importData',
    'ingSql.copySnippet'
];

function prepareRestricted() {
    console.log('--- Preparing Restricted Build ---');

    // 0. Backup package.json
    fs.copyFileSync(packageJsonPath, packageJsonBackupPath);
    console.log('✓ package.json backed up to package.json.bak');

    // 1. Update package.json
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    pkg.name = 'ing-sql-restricted';
    pkg.displayName = 'ING SQL (Restricted)';
    pkg.description = 'ING Oracle SQL Developer (Restricted - No Export/Clipboard)';

    // Remove restricted commands from contributes.commands
    if (pkg.contributes && pkg.contributes.commands) {
        pkg.contributes.commands = pkg.contributes.commands.filter(cmd => !restrictedCommands.includes(cmd.command));
    }

    // Remove restricted commands from contributes.menus
    if (pkg.contributes && pkg.contributes.menus) {
        for (const menuId in pkg.contributes.menus) {
            pkg.contributes.menus[menuId] = pkg.contributes.menus[menuId].filter(item => !restrictedCommands.includes(item.command));
        }
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('✓ package.json updated (name, displayName, commands removed)');

    // 2. Update buildConfig.ts
    const buildConfigContent = `/**
 * Build-time configuration for feature toggling.
 * This file is modified during the build process to enable/disable restricted features.
 */
export const BUILD_CONFIG = {
    isRestricted: true,
    versionSuffix: "-restricted"
};
`;
    fs.writeFileSync(buildConfigPath, buildConfigContent, 'utf8');
    console.log('✓ src/buildConfig.ts updated (isRestricted: true)');

    console.log('--- Ready to Package Restricted Version ---');
}

prepareRestricted();
