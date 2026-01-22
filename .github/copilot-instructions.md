# Copilot Instructions for react-native-siri-intent

## Project Overview
This project provides a React Native module for integrating iOS Siri App Intents using a native Swift extension. It is designed for use with Expo and React Native, automating the setup of an iOS App Extension for Siri integration.

## Architecture & Key Components
- **siriIntentModuleConfig.js**: Expo config plugin that automates:
  - Adding app group entitlements
  - Copying Swift extension files to the iOS project
  - Creating and configuring the Xcode App Extension target
  - Embedding the extension in the main app
- **ios/SimpleHealthSiriIntent/**: Contains the Swift App Extension:
  - `SimpleHealthSiriIntentExtension.swift`: Declares the extension entry point
  - `SiriIntent.swift`: Implements the Siri AppIntent logic (reads schedule from shared UserDefaults)
  - `Info.plist`: Extension configuration
- **react-native-siri-intent.podspec**: Excludes the extension folder from the main app target to avoid conflicts with the `@main` Swift attribute.

## Developer Workflows
- **Install**: Use standard `npm install` or `yarn`.
- **iOS Setup**: The Expo config plugin (`siriIntentModuleConfig.js`) runs during `expo prebuild` or `npx expo run:ios`, automating all Xcode changes.
- **Manual Xcode Edits**: Rarely needed. If troubleshooting, check that the extension target and entitlements are present in Xcode.
- **Podspec**: CocoaPods will not include the extension code in the main app target due to `exclude_files`.

## Project-Specific Conventions
- All extension logic and configuration is in `ios/SimpleHealthSiriIntent/`.
- App group identifier is hardcoded as `group.com.gormantec.simplehealth` (update if forking).
- Only iOS 16+ is supported (App Intents framework requirement).
- The extension reads a JSON schedule from shared UserDefaults (app group).

## Integration Points
- **Expo Autolinking**: See `package.json` and `expo-module.config.json` for plugin registration.
- **Native Dependencies**: Depends on `ExpoModulesCore` and iOS App Intents framework.

## Examples
- To add a new Siri intent, implement a new `AppIntent` struct in `SiriIntent.swift` and update the extension target.
- To change the app group, update both the Swift and JS config files.

## Key Files
- `siriIntentModuleConfig.js`, `ios/SimpleHealthSiriIntent/`, `react-native-siri-intent.podspec`

---
For questions or unclear patterns, review the config plugin and Swift extension code for the latest conventions.
