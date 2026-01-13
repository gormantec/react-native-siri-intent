const { 
  createRunOncePlugin, 
  withEntitlementsPlist, 
  withXcodeProject
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');

const EXTENSION_NAME = "SimpleHealthSiriIntent";
const EXTENSION_BUNDLE_ID_SUFFIX = ".siriintent";
const APP_GROUP_IDENTIFIER = `group.${pkg.name}`; // Dynamically use package name

const withSiriIntentModule = (config) => {

  console.warn(`[withSiriIntentModule] STARTING configuration for Siri Intent Extension...`);
  
  // 1. Add App Group Entitlement to the MAIN APP
  config = withEntitlementsPlist(config, (modConfig) => {
    const existingGroups = modConfig.modResults["com.apple.security.application-groups"] || [];
    if (!existingGroups.includes(APP_GROUP_IDENTIFIER)) {
      modConfig.modResults["com.apple.security.application-groups"] = [
        ...existingGroups,
        APP_GROUP_IDENTIFIER,
      ];
    }
    return modConfig;
  });

  // 2. Create the Extension Target & Embed it
  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectRoot = modConfig.modRequest.projectRoot;
    const appName = modConfig.modRequest.projectName;
    
    // A. Define Paths
    const sourceDir = path.join(projectRoot, 'node_modules', 'react-native-siri-intent', 'ios', 'SiriExtension');
    const destDir = path.join(projectRoot, 'ios', EXTENSION_NAME);

    // B. Copy Extension Files to ios/ project folder
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    const filesToCopy = ['SimpleHealthSiriIntentExtension.swift', 'Info.plist', 'SiriIntent.swift'];
    
    filesToCopy.forEach(file => {
        const src = path.join(sourceDir, file);
        const dst = path.join(destDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
        } else {
            console.warn(`[SiriExtension] Could not find source file: ${src}`);
        }
    });

    // C. Create and Configure the Target in Xcode
    const targetName = EXTENSION_NAME;
    const bundleId = `${config.ios.bundleIdentifier}${EXTENSION_BUNDLE_ID_SUFFIX}`;
    
    let target = project.pbxTargetByName(targetName);
    
    if (!target) {
        console.log(`[SiriExtension] Creating new App Extension Target: ${targetName}`);
        
        // 1. Add the Target
        target = project.addTarget(targetName, 'app_extension', targetName, bundleId);

        // 2. Create a PBXGroup for the extension files
        const pbxGroup = project.addPbxGroup([], targetName, targetName);

        // 3. Add the copied files to the Xcode project and the new group
        // This is the critical change: we get file reference objects back
        const sourceFiles = [];
        const resourceFiles = [];

        filesToCopy.forEach(file => {
            const filePath = path.join(destDir, file);
            const fileRef = project.addFile(filePath, pbxGroup.uuid);

            if (file.endsWith('.swift')) {
                sourceFiles.push(fileRef);
            } else if (file.endsWith('.plist')) {
                resourceFiles.push(fileRef);
            }
        });
        
        // 4. Add Build Phases using the file references
        // Sources
        project.addBuildPhase(sourceFiles.map(f => f.uuid), 'PBXSourcesBuildPhase', 'Sources', target.uuid);
        
        // Resources (for the Info.plist)
        project.addBuildPhase(resourceFiles.map(f => f.uuid), 'PBXResourcesBuildPhase', 'Resources', target.uuid);

        // 5. Update Build Settings
        const configurations = project.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const conf = configurations[key];
            if (conf.buildSettings && conf.buildSettings.PRODUCT_NAME === `"${targetName}"`) {
                conf.buildSettings.INFOPLIST_FILE = `${targetName}/Info.plist`;
                conf.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0'; // Or your desired version
                conf.buildSettings.SWIFT_VERSION = '5.0';
                conf.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = bundleId;
                conf.buildSettings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
                conf.buildSettings.CODE_SIGN_STYLE = "Automatic";
                conf.buildSettings.DEVELOPMENT_TEAM = config.ios.appleTeamId;
            }
        }
        
        // 6. Create entitlements file for the extension
        const entitlementsPath = path.join(destDir, `${targetName}.entitlements`);
        const entitlementsContent = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>${APP_GROUP_IDENTIFIER}</string>
	</array>
</dict>
</plist>
`;
        fs.writeFileSync(entitlementsPath, entitlementsContent.trim());
        project.addFile(entitlementsPath, pbxGroup.uuid);


        // 7. Embed the Extension into the Main App
        const mainTarget = project.getFirstTarget();
        const mainTargetName = mainTarget.firstOptions.name.replace(/"/g, '');
        if (mainTargetName === appName) { // Ensure we're modifying the main app target
            project.addBuildPhase(
                [target.productFile.basename],
                'PBXCopyFilesBuildPhase',
                'Embed App Extensions',
                mainTarget.uuid,
                'app_extension'
            );
        }
    }

    return modConfig;
  });

  return config;
};

module.exports = createRunOncePlugin(withSiriIntentModule, pkg.name, pkg.version);
