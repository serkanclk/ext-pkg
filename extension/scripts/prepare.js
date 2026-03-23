const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJsonBackupPath = path.join(__dirname, '..', 'package.json.bak');
const buildConfigPath = path.join(__dirname, '..', 'src', 'buildConfig.ts');

const args = process.argv.slice(2);
const isRestricted = args.includes('--restricted');
const hasIntellisense = args.includes('--intellisense');

function prepare() {
    console.log(`--- Preparing Build: Restricted=${isRestricted}, Intellisense=${hasIntellisense} ---`);

    // 0. Backup original package.json (only if no backup exists yet).
    // package-all.js deletes the backup before each full build cycle
    // so the first prepare call captures the current canonical version.
    if (!fs.existsSync(packageJsonBackupPath)) {
        fs.copyFileSync(packageJsonPath, packageJsonBackupPath);
        console.log('✓ package.json backed up');
    }

    // 1. Update package.json
    const pkg = JSON.parse(fs.readFileSync(packageJsonBackupPath, 'utf8'));

    if (isRestricted) {
        pkg.name = 'ing-sql-restricted';
        if (hasIntellisense) {
            pkg.name += '-intl';
            pkg.displayName = 'ING SQL (Restricted) + Intellisense';
            pkg.description = 'ING Oracle SQL Developer (Restricted + Intellisense)';
        } else {
            pkg.displayName = 'ING SQL (Restricted)';
            pkg.description = 'ING Oracle SQL Developer (Restricted - No Export/Clipboard)';
        }

        // Remove restricted commands (export, copy snippet)
        const restrictedCommands = ['ingSql.exportData', 'ingSql.copySnippet'];
        if (pkg.contributes && pkg.contributes.commands) {
            pkg.contributes.commands = pkg.contributes.commands.filter(cmd => !restrictedCommands.includes(cmd.command));
        }
        if (pkg.contributes && pkg.contributes.menus) {
            for (const menuId in pkg.contributes.menus) {
                pkg.contributes.menus[menuId] = pkg.contributes.menus[menuId].filter(item => !restrictedCommands.includes(item.command));
            }
        }
    } else {
        pkg.name = 'ing-sql';
        if (hasIntellisense) {
            pkg.name += '-intl';
            pkg.displayName = 'ING SQL + Intellisense';
            pkg.description = 'ING Oracle SQL Developer (Full + Intellisense)';
        } else {
            pkg.displayName = 'ING SQL';
            pkg.description = 'Oracle SQL Developer for VS Code (ING Specific)';
        }
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('✓ package.json updated');

    // 2. Update buildConfig.ts
    const versionSuffix = (isRestricted ? '-restr' : '') + (hasIntellisense ? '-intl' : '');
    const buildConfigContent = `/**
 * Build-time configuration for feature toggling.
 * This file is modified during the build process.
 */
export const BUILD_CONFIG = {
    isRestricted: ${isRestricted},
    hasIntellisense: ${hasIntellisense},
    versionSuffix: "${versionSuffix}"
};
`;
    fs.writeFileSync(buildConfigPath, buildConfigContent, 'utf8');
    console.log(`✓ src/buildConfig.ts updated (isRestricted: ${isRestricted}, hasIntellisense: ${hasIntellisense})`);

    console.log('--- Ready to Package ---');
}

prepare();
