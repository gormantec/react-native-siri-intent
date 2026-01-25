require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = 'react-native-siri-intent'
  s.version        = package['version']
  s.summary        = package['description'] || 'Siri Intent Module'
  s.license        = package['license'] || 'ISC'
  s.author         = package['author'] || 'Gorman Technology'
  s.homepage       = package['homepage'] || 'https://www.gormantec.com'
  s.platforms      = { :ios => '16.0' }
  s.source         = { :git => 'https://github.com/gormantec/react-native-siri-intent.git', :tag => "v#{s.version}" }
  s.static_framework = true
  
  s.dependency 'ExpoModulesCore'

  # 1. Include the Module/Bridge code
  s.source_files   = "ios/**/*.{h,m,mm,swift}"

  # 2. CRITICAL: Exclude the Extension folder completely.
  # This prevents CocoaPods from adding the @main file to the app target.
  s.exclude_files  = "ios/SimpleHealthSiriIntent/**/*"
  
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
