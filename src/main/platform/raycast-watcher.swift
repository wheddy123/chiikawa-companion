import Cocoa
import CoreGraphics
import Foundation

// Struct for output
struct RaycastStatus: Codable {
    let visible: boolean_t
    let x: Double?
    let y: Double?
    let width: Double?
    let height: Double?
}

class RaycastObserver {
    private var isRaycastActive: Bool? = nil
    private var lastBoundsStr = ""
    private var timer: Timer?

    func start() {
        // Notification for app activation/deactivation
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(appActivated(_:)), name: NSWorkspace.didActivateApplicationNotification, object: nil)
        center.addObserver(self, selector: #selector(appDeactivated(_:)), name: NSWorkspace.didDeactivateApplicationNotification, object: nil)

        // Light polling timer (120ms) to ensure window bounds / close are caught immediately
        timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            self?.checkRaycastState()
        }

        checkRaycastState()
        RunLoop.main.run()
    }

    @objc private func appActivated(_ note: Notification) {
        checkRaycastState()
    }

    @objc private func appDeactivated(_ note: Notification) {
        checkRaycastState()
    }

    private func checkRaycastState() {
        let frontApp = NSWorkspace.shared.frontmostApplication
        let isFront = frontApp?.bundleIdentifier == "com.raycast.macos"

        var raycastBounds: [String: Any]? = nil

        // Find Raycast window bounds
        if let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            for win in windowList {
                if let owner = win[kCGWindowOwnerName as String] as? String, owner == "Raycast" {
                    // Check if it's the main Raycast window (ignore tiny status bar windows)
                    if let bounds = win[kCGWindowBounds as String] as? [String: Any],
                       let h = bounds["Height"] as? Double, h > 50,
                       let w = bounds["Width"] as? Double, w > 100 {
                        raycastBounds = bounds
                        break
                    }
                }
            }
        }

        let currentlyActive = (raycastBounds != nil) || isFront

        let boundsStr = raycastBounds != nil ? "\(raycastBounds!["X"] ?? 0),\(raycastBounds!["Y"] ?? 0),\(raycastBounds!["Width"] ?? 0),\(raycastBounds!["Height"] ?? 0)" : ""

        if currentlyActive != isRaycastActive || (currentlyActive && boundsStr != lastBoundsStr) {
            isRaycastActive = currentlyActive
            lastBoundsStr = boundsStr

            var outJson: [String: Any] = ["visible": currentlyActive]
            if currentlyActive, let b = raycastBounds {
                outJson["x"] = b["X"] ?? 0
                outJson["y"] = b["Y"] ?? 0
                outJson["width"] = b["Width"] ?? 0
                outJson["height"] = b["Height"] ?? 0
            }

            if let data = try? JSONSerialization.data(withJSONObject: outJson, options: []),
               let str = String(data: data, encoding: .utf8) {
                print(str)
                fflush(stdout)
            }
        }
    }
}

let observer = RaycastObserver()
observer.start()
