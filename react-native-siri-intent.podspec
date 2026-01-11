require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = 'react-native-siri-intent'
  s.version        = package['version']
  s.summary        = package['description'] || 'Siri Intent Module'
  s.description    = package['description'] || 'Siri Intent native module for Expo'
  s.license        = package['license'] || 'ISC'
  s.author         = package['author'] || 'Gorman Technology'
  s.homepage       = package['homepage'] || 'https://www.gormantec.com'
  s.platforms      = { :ios => '16.1' }
  s.source         = { :git => 'https://github.com/gormantec/react-native-siri-intent.git', :tag => "v#{s.version}" }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
    s.subspec 'Core' do |core|
    s.source_files   = "ios/**/*.{h,m,mm,swift}"
    # Exclude the extension file
    core.exclude_files = 'ios/**/*IntentExtension.swift'
  end
  s.subspec 'IntentExtension' do |ext|
    ext.source_files = 'ios/**/*IntentExtension.swift'
  end

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
