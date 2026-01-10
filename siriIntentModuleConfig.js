// withMyModuleConfig.js
const { createRunOncePlugin, withEntitlementsPlist } = require('@expo/config-plugins');

// Pull name/version from package.json for createRunOncePlugin
const pkg = require('./package.json');

const withSiriEntitlements = (config) => {
  return withEntitlementsPlist(config, (modConfig) => {
    const APP_GROUP = "group.com.gormantec.simplehealth";
    const ENTITLEMENT_KEY = "com.apple.security.application-groups";

    // Initialize the array if it doesn't exist
    const existingGroups = modConfig.modResults[ENTITLEMENT_KEY] || [];

    // Only add if not already present to prevent duplicates
    if (!existingGroups.includes(APP_GROUP)) {
      modConfig.modResults[ENTITLEMENT_KEY] = [...existingGroups, APP_GROUP];
    }

    return modConfig;
  });
};

// Use the package name and version for the "RunOnce" protection
module.exports = createRunOncePlugin(withSiriEntitlements, pkg.name, pkg.version);
