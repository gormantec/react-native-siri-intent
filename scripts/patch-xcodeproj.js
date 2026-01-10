const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const projectRoot = process.env.INIT_CWD || process.cwd();
const iosDir = path.join(projectRoot, 'ios');
const files = fs.readdirSync(iosDir);
const xcodeprojName = files.find(f => f.endsWith('.xcodeproj'));
if (!xcodeprojName) {
  console.error('No .xcodeproj found in ios directory.');
  process.exit(1);
}
const xcodeprojPath = path.join(iosDir, xcodeprojName, 'project.pbxproj');
const project = xcode.project(xcodeprojPath);
project.parseSync();

const extensionName = 'SimpleHealthSiriIntent';
const extensionDir = path.join(iosDir, extensionName);
if (!fs.existsSync(extensionDir)) {
  console.error(`Extension directory not found: ${extensionDir}`);
  process.exit(1);
}

// 1. Add group for extension

console.log(`Patching ${xcodeprojPath} to add Siri Intent extension...`);
let extensionGroup = project.pbxGroupByName(extensionName);
if (!extensionGroup) {
  extensionGroup = project.addPbxGroup([], extensionName, extensionName);
  const mainGroupId = project.getFirstProject().firstProject.mainGroup;
  const mainGroup = project.getPBXGroupByKey(mainGroupId);
  if (mainGroup && mainGroup.children && !mainGroup.children.find(child => child.comment === extensionName)) {
    mainGroup.children.push({
      value: extensionGroup.uuid,
      comment: extensionName,
    });
  }
}

console.log(extensionGroup);
console.log(extensionGroup.uuid);

console.log(`Adding Siri Intent extension target: ${extensionName}`);
// 2. Add file references and build files
const extensionFiles = fs.readdirSync(extensionDir).filter(f => f.endsWith('.swift') || f.endsWith('.plist') || f.endsWith('.entitlements'));
extensionFiles.forEach(file => {
    console.log(`Adding file to project: ${file} ${extensionGroup.uuid}`);
  const filePath = path.join(extensionName, file);
  project.addSourceFile(filePath, { target: null, group: extensionGroup.uuid });
});

// 3. Add target for extension
const target = project.addTarget(
  extensionName,
  'app_extension',
  extensionName,
  `${extensionName}.entitlements`
);

// 4. Add embed phase
const appexName = `${extensionName}.appex`;
const appexRef = project.addProductFile(appexName, { target: target.uuid });
const embedPhase = project.addCopyFilesBuildPhase(
  [appexRef.fileRef],
  'Embed ExtensionKit Extensions',
  '16', // dstSubfolderSpec for extensions
  target.uuid
);

// 5. Save project
fs.writeFileSync(xcodeprojPath, project.writeSync());
console.log('Patched .xcodeproj to add Siri Intent extension for EAS!');