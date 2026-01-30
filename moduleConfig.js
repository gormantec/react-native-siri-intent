const {
  createRunOncePlugin,
  withEntitlementsPlist,
  withXcodeProject,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');

const EXTENSION_NAME = 'SimpleHealthSiriIntent';
const EXTENSION_BUNDLE_ID_SUFFIX = '.siriintent';
const DEFAULT_APP_GROUP_IDENTIFIER = 'group.com.gormantec.simplehealth';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirRecursive(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

function ensureExtensionFiles({ iosRoot, extensionName, appGroupIdentifier }) {
  const templateDir = path.join(__dirname, 'ios', extensionName);
  const destDir = path.join(iosRoot, extensionName);

  if (!fs.existsSync(templateDir)) {
    throw new Error(
      `[react-native-siri-intent] Missing iOS template folder at ${templateDir}`
    );
  }

  // Copy/update extension template sources & Info.plist
  copyDirRecursive(templateDir, destDir);

  // Ensure the entitlements file exists (Xcode target will reference it)
  const entitlementsPath = path.join(destDir, `${extensionName}.entitlements`);
  if (!fs.existsSync(entitlementsPath)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
      `<plist version="1.0">\n` +
      `<dict>\n` +
      `  <key>com.apple.security.application-groups</key>\n` +
      `  <array>\n` +
      `    <string>${appGroupIdentifier}</string>\n` +
      `  </array>\n` +
      `</dict>\n` +
      `</plist>\n`;
    fs.writeFileSync(entitlementsPath, xml);
  }

  return {
    infoPlistPath: path.join(destDir, 'Info.plist'),
    entitlementsPath,
  };
}

function findPbxGroupByPath(project, groupPath) {
  const groups = project.hash.project.objects.PBXGroup || {};
  for (const [uuid, group] of Object.entries(groups)) {
    if (uuid.endsWith('_comment')) continue;
    if (!group) continue;

    const maybePath = group.path ? String(group.path).replace(/^"|"$/g, '') : '';
    const maybeName = group.name ? String(group.name).replace(/^"|"$/g, '') : '';

    if (maybePath === groupPath || maybeName === groupPath) {
      return uuid;
    }
  }
  return null;
}

function ensurePbxGroup(project, mainGroupUuid, groupName) {
  const existing = findPbxGroupByPath(project, groupName);
  if (existing) return existing;

  const group = project.addPbxGroup([], groupName, groupName, '"<group>"');
  const groupUuid = group.uuid;

  const mainGroup = project.hash.project.objects.PBXGroup[mainGroupUuid];
  mainGroup.children = mainGroup.children || [];
  mainGroup.children.push({ value: groupUuid, comment: groupName });

  return groupUuid;
}

function ensureExtensionTarget({ project, extensionName, extensionBundleId }) {
  const existing = project.pbxTargetByName(extensionName);
  if (existing && existing.uuid) {
    return existing.uuid;
  }

  // Create as an app extension (supported by the library), then patch to ExtensionKit.
  const created = project.addTarget(
    extensionName,
    'app_extension',
    extensionName,
    extensionBundleId
  );

  const targetUuid = created.uuid;

  // Patch product type to match what Xcode produced in your `project_withext.pbxproj`.
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid];
  if (nativeTarget) {
    nativeTarget.productType = '"com.apple.product-type.extensionkit-extension"';
  }

  const productRef = nativeTarget && nativeTarget.productReference;
  const fileRefSection = project.pbxFileReferenceSection();
  if (productRef && fileRefSection[productRef]) {
    fileRefSection[productRef].explicitFileType = '"wrapper.extensionkit-extension"';
  }

  return targetUuid;
}

function configureExtensionBuildSettings({
  project,
  targetUuid,
  infoPlistRelPath,
  entitlementsRelPath,
  extensionBundleId,
}) {
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid];
  if (!nativeTarget || !nativeTarget.buildConfigurationList) return;

  const configList = project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList];
  if (!configList || !Array.isArray(configList.buildConfigurations)) return;

  const buildConfigSection = project.pbxXCBuildConfigurationSection();
  for (const entry of configList.buildConfigurations) {
    const cfgUuid = entry.value || entry;
    const cfg = buildConfigSection[cfgUuid];
    if (!cfg || !cfg.buildSettings) continue;

    cfg.buildSettings.INFOPLIST_FILE = infoPlistRelPath;
    cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = entitlementsRelPath;
    cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
    cfg.buildSettings.SKIP_INSTALL = 'YES';
    cfg.buildSettings.SWIFT_VERSION = cfg.buildSettings.SWIFT_VERSION || '5.0';
  }
}

function ensureEmbedExtensionPhase({
  project,
  mainTargetUuid,
  extensionTargetUuid,
  extensionName,
}) {
  const nativeTargets = project.pbxNativeTargetSection();
  const mainTarget = nativeTargets[mainTargetUuid];
  if (!mainTarget) return;

  const extensionNative = nativeTargets[extensionTargetUuid];
  const productRef = extensionNative && extensionNative.productReference;

  // Ensure target dependency exists (idempotent)
  const deps = mainTarget.dependencies || [];
  const alreadyDepends = deps.some((d) => d && d.comment === extensionName);
  if (!alreadyDepends) {
    project.addTargetDependency(mainTargetUuid, [extensionTargetUuid]);
  }

  // Ensure the embed phase exists on the main target.
  // NOTE: `xcode.addTarget('app_extension')` auto-adds a PBXCopyFilesBuildPhase named "Copy Files"
  // to the main target. We prefer to *reuse* and patch that phase to match what Xcode produced in
  // your `project_withext.pbxproj` (avoids duplicate copy phases).
  const copyPhases = project.hash.project.objects.PBXCopyFilesBuildPhase || {};
  const buildPhases = mainTarget.buildPhases || [];
  const embedPhaseName = 'Embed ExtensionKit Extensions';

  let embedPhaseUuid = null;
  let copyFilesPhaseUuid = null;

  for (const bp of buildPhases) {
    const uuid = bp && bp.value;
    if (!uuid) continue;
    const phase = copyPhases[uuid];
    if (!phase) continue;

    const phaseName = String(phase.name || '').replace(/^"|"$/g, '');
    if (phaseName === embedPhaseName) {
      embedPhaseUuid = uuid;
      break;
    }

    if (phaseName === 'Copy Files') {
      copyFilesPhaseUuid = uuid;
    }
  }

  // Prefer patching the auto-created "Copy Files" phase if present.
  if (!embedPhaseUuid && copyFilesPhaseUuid) {
    const phase = copyPhases[copyFilesPhaseUuid];
    phase.name = `"${embedPhaseName}"`;
    phase.dstPath = '"$(EXTENSIONS_FOLDER_PATH)"';
    phase.dstSubfolderSpec = 16;
    embedPhaseUuid = copyFilesPhaseUuid;
  }

  if (!embedPhaseUuid) {
    // Folder type is used only to choose dstSubfolderSpec; `dynamic_library` maps to 16.
    project.addBuildPhase(
      [`${extensionName}.appex`],
      'PBXCopyFilesBuildPhase',
      embedPhaseName,
      mainTargetUuid,
      'dynamic_library',
      '$(EXTENSIONS_FOLDER_PATH)'
    );
  }

  // Add the RemoveHeadersOnCopy attribute like Xcode does.
  if (productRef) {
    const buildFileSection = project.pbxBuildFileSection();
    for (const [uuid, buildFile] of Object.entries(buildFileSection)) {
      if (uuid.endsWith('_comment')) continue;
      if (!buildFile) continue;

      const fileRefValue =
        typeof buildFile.fileRef === 'string'
          ? buildFile.fileRef
          : buildFile.fileRef?.value;

      if (fileRefValue === productRef) {
        buildFile.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
        break;
      }
    }
  }
}

function withSiriIntentExtension(config, props = {}) {
  const appGroupIdentifier =
    props.appGroupIdentifier ||
    config.extra?.siriIntentAppGroup ||
    DEFAULT_APP_GROUP_IDENTIFIER;

  // Ensure app target has Siri + App Group entitlements.
  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;

    entitlements['com.apple.developer.siri'] = true;

    const groupsKey = 'com.apple.security.application-groups';
    const groups = Array.isArray(entitlements[groupsKey]) ? entitlements[groupsKey] : [];
    if (!groups.includes(appGroupIdentifier)) {
      groups.push(appGroupIdentifier);
    }
    entitlements[groupsKey] = groups;

    return config;
  });

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const iosRoot =
      config.modRequest?.platformProjectRoot ||
      path.join(config.modRequest.projectRoot, 'ios');

    const appBundleId = config.ios?.bundleIdentifier;
    if (!appBundleId) {
      throw new Error(
        '[react-native-siri-intent] Missing config.ios.bundleIdentifier; set it in app.json/app.config.js.'
      );
    }

    const extensionBundleId = `${appBundleId}${EXTENSION_BUNDLE_ID_SUFFIX}`;

    // Copy the extension template into the app's ios/ folder.
    ensureExtensionFiles({
      iosRoot,
      extensionName: EXTENSION_NAME,
      appGroupIdentifier,
    });

    const mainTargetUuid = project.getFirstTarget().uuid;
    const mainGroupUuid = project.getFirstProject().firstProject.mainGroup;

    const extensionTargetUuid = ensureExtensionTarget({
      project,
      extensionName: EXTENSION_NAME,
      extensionBundleId,
    });

    const extensionGroupUuid = ensurePbxGroup(project, mainGroupUuid, EXTENSION_NAME);

    // Add extension files to the project and attach Swift sources to the extension target.
    const infoPlistRelPath = `${EXTENSION_NAME}/Info.plist`;
    const entitlementsRelPath = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
    const swiftFiles = [
      `${EXTENSION_NAME}/${EXTENSION_NAME}.swift`,
      `${EXTENSION_NAME}/${EXTENSION_NAME}Extension.swift`,
    ];

    project.addFile(infoPlistRelPath, extensionGroupUuid);
    project.addFile(entitlementsRelPath, extensionGroupUuid);

    for (const swiftFile of swiftFiles) {
      project.addSourceFile(swiftFile, { target: extensionTargetUuid }, extensionGroupUuid);
    }

    configureExtensionBuildSettings({
      project,
      targetUuid: extensionTargetUuid,
      infoPlistRelPath,
      entitlementsRelPath,
      extensionBundleId,
    });

    ensureEmbedExtensionPhase({
      project,
      mainTargetUuid,
      extensionTargetUuid,
      extensionName: EXTENSION_NAME,
    });

    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(withSiriIntentExtension, pkg.name, pkg.version);

