//
//  SimpleHealthSiriIntent.swift
//  SimpleHealthSiriIntent
//
//  Created by craig on 10/1/2026.
//

import AppIntents

struct SimpleHealthSiriIntent: AppIntent {
    static var title: LocalizedStringResource = "SimpleHealthSiriIntent"
    
    func perform() async throws -> some IntentResult {
        return .result()
    }
}
