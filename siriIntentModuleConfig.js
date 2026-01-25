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
const APP_GROUP_IDENTIFIER = "group.com.gormantec.simplehealth"; // Dynamically use package name

const withSiriIntentModule = (config) => {

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
    const sourceDir = path.join(projectRoot, 'node_modules', 'react-native-siri-intent', 'ios', EXTENSION_NAME);
    const destDir = path.join(projectRoot, 'ios', EXTENSION_NAME);

    // B. Copy Extension Files to ios/ project folder
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      console.info(`[SiriExtension] Created destDir:`, destDir);
    }
    
    const filesToCopy = ['SimpleHealthSiriIntentExtension.swift', 'Info.plist', 'SiriIntent.swift'];
    
    filesToCopy.forEach(file => {
        const src = path.join(sourceDir, file);
        const dst = path.join(destDir, file);
        console.info(`[SiriExtension] Copying file: ${file}`);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
            console.info(`[SiriExtension] Copied ${src} to ${dst}`);
            if(file.endsWith('.plist')) console.info(fs.readFileSync(dst, 'utf8'));
        } else {
            console.warn(`[SiriExtension] Could not find source file: ${src}`);
        }
    });

    // C. Create and Configure the Target in Xcode
    const targetName = EXTENSION_NAME;
    const bundleId = `${config.ios.bundleIdentifier}${EXTENSION_BUNDLE_ID_SUFFIX}`;

    let target = project.pbxTargetByName(targetName);

    if (!target) {
        console.info(`[SiriExtension] Creating new App Extension Target: ${targetName}`);
        target = project.addTarget(targetName, 'app_extension', targetName, bundleId);
        const pbxGroup = project.addPbxGroup([], targetName, targetName);
        const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
        project.getPBXGroupByKey(mainGroupKey).children.push({
            value: pbxGroup.uuid,
            comment: targetName
        });

        const sourceFiles = [];
        const resourceFiles = [];

        filesToCopy.forEach(file => {
            const filePath = path.join(destDir, file);
            console.info(`[SiriExtension] before adding source list projectfiles:`);
            const fileAlreadyExists = Object.values(project.pbxFileReferenceSection())
              .some(ref => {
                if (!ref) return false;
                const relPath = path.join(EXTENSION_NAME, file); 
                return ref.path === relPath;
              });

            if (fileAlreadyExists) {
              console.info(`[SiriExtension] File already exists in Xcode project: ${file}`);
              return;
            }


            if (fs.existsSync(filePath) && typeof file === 'string' && file.endsWith('.swift')) {
              const relPath = path.join(EXTENSION_NAME, file); 
              sourceFiles.push(relPath); 
            } 
        });
        
        // 4. Add Build Phases using the file references
        console.info(`[SiriExtension] sourceFiles:`, sourceFiles);
        project.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
        console.info(`[SiriExtension] resourceFiles:`, resourceFiles);
        project.addBuildPhase(resourceFiles, 'PBXResourcesBuildPhase', 'Resources', target.uuid);

        // 5. Update Build Settings
        const configurations = project.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const conf = configurations[key];
            if (conf.buildSettings && conf.buildSettings.PRODUCT_NAME === `"${targetName}"`) {
                console.warn(`[SiriExtension] Updating build settings for:`, conf.buildSettings.PRODUCT_NAME);
                conf.buildSettings.INFOPLIST_FILE = `${targetName}/Info.plist`;
                conf.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
                conf.buildSettings.SWIFT_VERSION = '5.0';
                conf.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = bundleId;
                conf.buildSettings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
                conf.buildSettings.CODE_SIGN_STYLE = "Automatic";
                conf.buildSettings.DEVELOPMENT_TEAM = config.ios.appleTeamId;
            }
        }
        
        // 6. Create entitlements file for the extension
        const entitlementsFilename=`${targetName}.entitlements`
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
        if (fs.existsSync(entitlementsPath) && typeof entitlementsPath === 'string') {
          // Check if entitlements file is already in the Xcode project
          console.info(`[SiriExtension] before adding entitlements list project files:`);
          const entAlreadyExists = Object.values(project.pbxFileReferenceSection()).some(ref => {
              console.info(`[SiriExtension]  - ${ref.name} (${ref.path})`);
              const relPath = path.join(EXTENSION_NAME, entitlementsFilename); 
              return ref && ref.path === relPath;
        });

          if (entAlreadyExists) {
            console.info(`[SiriExtension] Entitlements file already exists in Xcode project: ${entitlementsFilename}`);
          } else {
            const relPath = path.join(EXTENSION_NAME, entitlementsFilename); 
            console.info(`[SiriExtension] addEntitlement(path=${relPath}, pbxGroup.uuid=${pbxGroup.uuid})`);
            const entFileRef = project.addFile(relPath, pbxGroup.uuid);
            if (entFileRef) {
              resourceFiles.push(relPath);
            }
          }
        } else {
          console.warn(`[SiriExtension] Entitlements file does not exist or path invalid file: ${entitlementsFilename}`);
        }

        // 7. Embed the Extension into the Main App
        const mainTarget = project.getFirstTarget();
        console.info(`[SiriExtension] appName:`, appName);
        if (mainTarget && mainTarget.firstTarget && mainTarget.firstTarget.name) {
          const mainTargetName = mainTarget.firstTarget.name.replace(/"/g, '');
          console.warn(`[SiriExtension] mainTargetName:`, mainTargetName);

          const productFileUuid = target.pbxNativeTarget.productReference; 
          const productFileRef = project.pbxFileReferenceSection()[productFileUuid];
          console.info('[SiriExtension] productFileRef:', productFileRef);
          if (!productFileUuid) {
              throw new Error(`[SiriExtension] Failed to find productReference for ${targetName}`);
          }

          console.warn(`[SiriExtension] productFileUuid:`, [productFileRef.path]);
          if (false && mainTargetName === appName) {
              project.addBuildPhase(
                  [productFileRef.path], 
                  'PBXCopyFilesBuildPhase',
                  'Embed App Extensions',
                  mainTarget.uuid,
                  'app_extension'
              );
              console.warn(`[SiriExtension] Embedded extension into main app target.`);
          } else {
              console.warn(`[SiriExtension] mainTargetName does not match appName. Not embedding.`);
          }
        } else {
          console.warn('[SiriExtension] Could not find main app target for embedding extension.');
        }
    }

    return modConfig;
  });

  return config;
};

module.exports = createRunOncePlugin(withSiriIntentModule, pkg.name, pkg.version);