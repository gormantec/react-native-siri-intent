require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = 'react-native-siri-intent'
  s.version        = package['1.0.0']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['Gorman Technology']
  s.homepage       = package['www.gormantec.com']
  s.platforms      = { :ios => '15.1' } # Matches 2026 Expo SDK requirements
  s.source         = { :git => 'https://github.com/gormantec/react-native-siri-intent.git', :tag => "v#{s.version}" }
  s.static_framework = true
  s.source_files   = "ios/**/*.{h,m,mm,swift}"
  s.resources    = "ios/**/*.intentdefinition", "ios/**/*.entitlements", "ios/**/*.plist"
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end