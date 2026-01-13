const { 
  createRunOncePlugin, 
  withEntitlementsPlist, 
  withXcodeProject, 
  IOSConfig 
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');

const EXTENSION_NAME = "SimpleHealthSiriIntent";
const EXTENSION_BUNDLE_ID_SUFFIX = ".siriintent";
const APP_GROUP_IDENTIFIER = "group.com.gormantec.simplehealth"; // Ensure this matches your Apple Developer Portal

const withSiriIntentModule = (config) => {
  
  // 1. Add App Group Entitlement to the MAIN APP
  // (Kept from your old script)
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
  config = withXcodeProject(config, async (modConfig) => {
    const project = modConfig.modResults;
    const projectRoot = modConfig.modRequest.projectRoot;
    
    // A. Define Paths
    // We assume the source files are in your node_modules/react-native-siri-intent/ios/SiriExtension
    // Adjust 'sourceDir' if you are running this locally in the library repo vs inside an app
    const sourceDir = path.join(projectRoot, 'node_modules', 'react-native-siri-intent', 'ios', 'SiriExtension');
    const destDir = path.join(projectRoot, 'ios', EXTENSION_NAME);

    // B. Copy Extension Files to ios/ project folder
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Copy the specific files needed for the extension
    // Ensure these exist in your source folder!
    const filesToCopy = ['SimpleHealthSiriIntentExtension.swift', 'Info.plist','SiriIntent.swift'];
    
    filesToCopy.forEach(file => {
        const src = path.join(sourceDir, file);
        const dst = path.join(destDir, file);
        // Only copy if source exists (prevents crash if path is wrong)
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
        } else {
            console.warn(`[SiriExtension] Could not find source file: ${src}`);
        }
    });

    // C. Create the Target in Xcode
    const targetName = EXTENSION_NAME;
    const bundleId = `${config.ios.bundleIdentifier}${EXTENSION_BUNDLE_ID_SUFFIX}`;
    
    // Check if target exists to avoid duplication
    let target = project.pbxTargetByName(targetName);
    
    if (!target) {
        console.log(`[SiriExtension] Creating new App Extension Target: ${targetName}`);
        
        // 1. Add Target
        target = project.addTarget(
            targetName,
            'app_extension', 
            targetName,
            bundleId
        );

        // 2. Create a PBXGroup for the files
        const pbxGroup = project.addPbxGroup(
            filesToCopy,
            targetName,
            targetName
        );
        
        // Add group to main project
        const mainGroup = project.pbxGroupByName('CustomTemplate');
        if (mainGroup) {
            mainGroup.children.push({ value: pbxGroup.uuid, comment: targetName });
        }

        // 3. Add Build Phases
        // Sources
        project.addBuildPhase(
            ['SimpleHealthSiriIntentExtension.swift','SiriIntent.swift'],
            'PBXSourcesBuildPhase',
            'Sources',
            target.uuid
        );
        
        // Resources
        project.addBuildPhase(
            ['Info.plist'],
            'PBXResourcesBuildPhase',
            'Resources',
            target.uuid
        );

        // 4. Update Build Settings
        const configurations = project.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const conf = configurations[key];
            if (!conf.buildSettings) continue;
            
            // Only modify settings for our specific target
            // Note: xcode lib doesn't make it easy to filter by target in this loop, 
            // but usually we set specific props based on the product name.
            if (conf.buildSettings.PRODUCT_NAME === `"${targetName}"` || conf.buildSettings.PRODUCT_NAME === targetName) {
                conf.buildSettings.INFOPLIST_FILE = `${targetName}/Info.plist`;
                conf.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
                conf.buildSettings.SWIFT_VERSION = '5.0';
                conf.buildSettings.MARKETING_VERSION = '1.0';
                conf.buildSettings.CURRENT_PROJECT_VERSION = '1';
                // Ensure the extension has the App Group entitlement too!
                // (You would ideally create a .entitlements file and link it here, 
                // but for simplicity, we are skipping the file creation for now).
            }
        }

        // 5. Embed the Extension into the Main App
        // This is the critical step to make it install on the phone
        const mainTarget = project.getFirstTarget();
        
        // Check if "Embed Foundation Extensions" phase exists, if not, we might need to create it
        // For simplicity, we use the raw addBuildPhase with the correct destination code (13)
        project.addBuildPhase(
            [target.productFile.basename], 
            'PBXCopyFilesBuildPhase',
            'Embed Foundation Extensions', 
            mainTarget.uuid, 
            'app_extension',
            '13' // 13 == PlugIns directory
        );
    }

    return modConfig;
  });

  return config;
};

module.exports = createRunOncePlugin(withSiriIntentModule, pkg.name, pkg.version);
