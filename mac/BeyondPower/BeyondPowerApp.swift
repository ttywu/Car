import AppKit
import SwiftUI

@main
struct BeyondPowerApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup("Beyond Power Control") {
            ContentView(model: model, bluetooth: model.bluetooth)
                .frame(minWidth: 980, minHeight: 640)
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
                    // Best effort: release the load if the app quits mid-set.
                    if model.loaded { model.unload() }
                }
        }
        .windowResizability(.contentMinSize)
    }
}
