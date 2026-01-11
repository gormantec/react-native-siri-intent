const { createRunOncePlugin, withEntitlementsPlist, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist'); // Required to parse/write plist files
const pkg = require('./package.json');

const withMyModuleConfig = (config) => {
  // 1. Target the Extension's Info.plist via Xcode Project
  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const extensionTargetName = "SimpleHealthSiriIntent"; // Replace with your extension target name
    
    // Find the target in the Xcode project
    const target = project.pbxTargetByName(extensionTargetName);
    if (!target) {
      console.warn(`Target ${extensionTargetName} not found. Skipping Info.plist injection.`);
      return modConfig;
    }

    // Get the Info.plist path for this specific target
    const xcBuildConf = project.pbxXCBuildConfigurationSection();
    const buildSettings = Object.values(xcBuildConf).find(
      (conf) => conf.buildSettings && conf.buildSettings.INFOPLIST_FILE
    )?.buildSettings;

    if (buildSettings?.INFOPLIST_FILE) {
      // Resolve the actual file path on disk
      const plistPath = path.join(modConfig.modRequest.projectRoot, 'ios', buildSettings.INFOPLIST_FILE.replace(/"/g, ''));
      
      if (fs.existsSync(plistPath)) {
        const content = fs.readFileSync(plistPath, 'utf8');
        const data = plist.parse(content);

        // Inject your specific keys into the module's plist
        data['EXAppExtensionAttributes'] = {
          EXExtensionPointIdentifier: 'com.apple.appintents-extension',
        };

        fs.writeFileSync(plistPath, plist.build(data));
      }
    }

    return modConfig;
  });

  // 2. Keep your existing Entitlements logic (App Groups)
  config = withEntitlementsPlist(config, (modConfig) => {
    const APP_GROUP = "group.com.gormantec.simplehealth";
    const ENTITLEMENT_KEY = "com.apple.security.application-groups";
    const existingGroups = modConfig.modResults[ENTITLEMENT_KEY] || [];
    if (!existingGroups.includes(APP_GROUP)) {
      modConfig.modResults[ENTITLEMENT_KEY] = [...existingGroups, APP_GROUP];
    }
    return modConfig;
  });

  return config;
};

module.exports = createRunOncePlugin(withMyModuleConfig, pkg.name, pkg.version);
