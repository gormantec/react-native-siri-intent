require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = 'react-native-siri-intent'
  s.version        = package['version']
  s.summary        = package['description'] || 'Siri Intent Module'
  s.description    = package['description'] || 'Siri Intent native module for Expo'
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  
  # Ensure the tag here matches exactly what is on GitHub (v1.0.0 vs 1.0.0)
  s.source         = { :git => 'https://github.com/gormantec/react-native-siri-intent.git', :tag => "v#{s.version}" }
  
  s.static_framework = true
  s.source_files   = "ios/**/*.{h,m,mm,swift}"
  
  # REMOVED: ios/**/*.entitlements (This was causing the crash)
  s.resources      = "ios/**/*.intentdefinition", "ios/**/*.plist"
  
  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
