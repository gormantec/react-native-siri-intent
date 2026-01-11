const { createRunOncePlugin, withEntitlementsPlist, withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
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

  // 3. Patch the Podfile after it's generated to use subspecs for each target
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.projectRoot, 'ios', 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn('Podfile not found, skipping Podfile patch.');
        return modConfig;
      }
      let podfile = fs.readFileSync(podfilePath, 'utf-8');

      // Example: Patch to use subspecs for react-native-siri-intent
      // Replace:
      //   pod 'react-native-siri-intent', :path => '../node_modules/react-native-siri-intent'
      // With:
      //   pod 'react-native-siri-intent/Core', :path => '../node_modules/react-native-siri-intent'
      //   pod 'react-native-siri-intent/IntentExtension', :path => '../node_modules/react-native-siri-intent', :configurations => ['Debug', 'Release'], :target => 'SimpleHealthSiriIntent'

      // Patch for main app target (Core subspec)
      podfile = podfile.replace(
        /pod ['"]react-native-siri-intent['"],\s*:path => ['"][^'"]+['"]/g,
        "pod 'react-native-siri-intent/Core', :path => '../node_modules/react-native-siri-intent'"
      );

      // Patch for extension target (IntentExtension subspec)
      // This is a simple example; you may need to adjust for your Podfile structure
      if (!podfile.includes("pod 'react-native-siri-intent/IntentExtension")) {
        podfile += `\n\n# Add IntentExtension subspec for Siri Intent extension target\npod 'react-native-siri-intent/IntentExtension', :path => '../node_modules/react-native-siri-intent', :target => 'SimpleHealthSiriIntent'\n`;
      }

      fs.writeFileSync(podfilePath, podfile);
      return modConfig;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(withMyModuleConfig, pkg.name, pkg.version);
