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
    console.info(`[SiriExtension] withXcodeProject() project:${project} appName:${appName}`);

    // A. Define Paths
    const sourceDir = path.join(projectRoot, 'node_modules', 'react-native-siri-intent', 'ios', 'SiriExtension');
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
        } else {
            console.warn(`[SiriExtension] Could not find source file: ${src}`);
        }
    });

    // C. Create and Configure the Target in Xcode
    const targetName = EXTENSION_NAME;
    const bundleId = `${config.ios.bundleIdentifier}${EXTENSION_BUNDLE_ID_SUFFIX}`;
    console.info(`[SiriExtension] targetName:`, targetName);
    console.info(`[SiriExtension] bundleId:`, bundleId);

    let target = project.pbxTargetByName(targetName);

    if (!target) {
        console.info(`[SiriExtension] Creating new App Extension Target: ${targetName}`);
        
        // 1. Add the Target
        target = project.addTarget(targetName, 'app_extension', targetName, bundleId);
  
        
        // 2. Create a PBXGroup for the extension files
        const pbxGroup = project.addPbxGroup([], targetName, targetName);
        const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

        // Link the new group to the root of the project
        project.getPBXGroupByKey(mainGroupKey).children.push({
            value: pbxGroup.uuid,
            comment: targetName
        });



        // 3. Add the copied files to the Xcode project and the new group
        const sourceFiles = [];
        const resourceFiles = [];

        filesToCopy.forEach(file => {
            const filePath = path.join(destDir, file);
            const relFilePath = file;//const relFilePath = path.relative(path.join(projectRoot, 'ios'), filePath);
            
            // Log file stats and permissions
            try {
              const stat = fs.statSync(filePath);
            } catch (err) {
              console.warn(`[SiriExtension] statSync error for ${filePath}:`, err);
            }
            if (fs.existsSync(filePath) && typeof relFilePath === 'string') {
              console.info(`[SiriExtension] (92) project.addFile(path=${relFilePath}, pbxGroup.uuid=${pbxGroup.uuid})`);
              const fileRef = project.addFile(relFilePath, pbxGroup.uuid);
              if (fileRef) {
                  // Depending on your xcode library version, it might be fileRef.uuid or fileRef.fileRef
                  const actualUuid = fileRef.uuid || fileRef.fileRef; 
                  
                  if (file.endsWith('.swift')) {
                      sourceFiles.push(actualUuid);
                  } else if (file.endsWith('.plist')) {
                      resourceFiles.push(actualUuid);
                  }
              } else {
                console.warn(`[SiriExtension] Failed to add file to Xcode project: ${relFilePath}`);
              }
            } else {
              console.warn(`[SiriExtension] File does not exist or path invalid: ${filePath} -- ${file}`);
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
        const entitlementsPath = path.join(destDir, `${targetName}.entitlements`);
        const relEntitlementsPath = `${targetName}.entitlements`;//path.relative(path.join(projectRoot, 'ios'), entitlementsPath);


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
          console.info(`[SiriExtension] (146) project.addFile(path=${relEntitlementsPath}, pbxGroup.uuid=${pbxGroup.uuid})`);
          const entFileRef = project.addFile(relEntitlementsPath, pbxGroup.uuid);
          if (entFileRef) {
              resourceFiles.push(entFileRef.uuid || entFileRef.fileRef);
          }
        } else {
          console.warn(`[SiriExtension] Entitlements file does not exist or path invalid: ${relEntitlementsPath}`);
        }

        // 7. Embed the Extension into the Main App
        const mainTarget = project.getFirstTarget();
        console.info(`[SiriExtension] appName:`, appName);
        if (mainTarget && mainTarget.firstTarget && mainTarget.firstTarget.name) {
          const mainTargetName = mainTarget.firstTarget.name.replace(/"/g, '');
          console.warn(`[SiriExtension] mainTargetName:`, mainTargetName);

          const productFileUuid = target.pbxNativeTarget.productReference; 

          if (!productFileUuid) {
              throw new Error(`[SiriExtension] Failed to find productReference for ${targetName}`);
          }

          console.warn(`[SiriExtension] productFileUuid:`, [productFileUuid]);
          if (mainTargetName === appName) {
              project.addBuildPhase(
                  [productFileUuid], 
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