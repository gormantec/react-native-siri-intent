//
//  NextScheduleIntent.swift
//  SimpleHealthSiriIntent
//
//  Created by craig on 10/1/2026.
//

import AppIntents
import Foundation

struct SiriIntent: AppIntent {
    static var title: LocalizedStringResource = "Next Schedule Item"

    func perform() async throws -> some IntentResult {
        let appGroupID = "group.com.gormantec.simplehealth"
        if let userDefaults = UserDefaults(suiteName: appGroupID),
           let json = userDefaults.string(forKey: "schedule"),
           let data = json.data(using: .utf8),
           let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {

            let now = Date()
            let dateFormatter = ISO8601DateFormatter()
            let next = items.compactMap { dict -> (String, Date)? in
                guard let title = dict["title"] as? String,
                      let timeStr = dict["time"] as? String,
                      let time = dateFormatter.date(from: timeStr) else { return nil }
                return (title, time)
            }
            .filter { $0.1 > now }
            .sorted { $0.1 < $1.1 }
            .first

            if let (title, time) = next {
                let spoken = "Your next schedule item is \(title) at \(DateFormatter.localizedString(from: time, dateStyle: .none, timeStyle: .short))."
                return .result(dialog: "\(spoken)")
            } else {
                return .result(dialog: "You have no more items scheduled today.")
            }
        }
        return .result(dialog: "Could not read your schedule.")
    }
}
