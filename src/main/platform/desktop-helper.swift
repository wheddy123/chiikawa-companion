import Cocoa
import CoreGraphics
import Foundation

// MARK: - Dynamic MediaRemote Bindings
typealias MRMediaRemoteGetNowPlayingInfoFunction = @convention(c) (DispatchQueue, @escaping ([String: Any]) -> Void) -> Void
typealias MRMediaRemoteGetNowPlayingApplicationIsPlayingFunction = @convention(c) (DispatchQueue, @escaping (Bool) -> Void) -> Void
typealias MRMediaRemoteSendCommandFunction = @convention(c) (Int32, AnyObject?) -> Bool

class MediaObserver {
    private var getInfo: MRMediaRemoteGetNowPlayingInfoFunction?
    private var getIsPlaying: MRMediaRemoteGetNowPlayingApplicationIsPlayingFunction?
    private var sendCommand: MRMediaRemoteSendCommandFunction?

    private var lastIsPlaying: Bool? = nil
    private var lastTitle: String = ""
    private var lastArtist: String = ""

    private var pollTimer: Timer?

    init() {
        if let handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW) {
            if let pInfo = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo") {
                getInfo = unsafeBitCast(pInfo, to: MRMediaRemoteGetNowPlayingInfoFunction.self)
            }
            if let pPlaying = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationIsPlaying") {
                getIsPlaying = unsafeBitCast(pPlaying, to: MRMediaRemoteGetNowPlayingApplicationIsPlayingFunction.self)
            }
            if let pSend = dlsym(handle, "MRMediaRemoteSendCommand") {
                sendCommand = unsafeBitCast(pSend, to: MRMediaRemoteSendCommandFunction.self)
            }
        }
    }

    func start() {
        guard getInfo != nil && getIsPlaying != nil else {
            // MediaRemote not available
            return
        }

        // Poll media state every 0.8s
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            self?.checkMediaState()
        }
        checkMediaState()
    }

    func checkMediaState() {
        guard let getIsPlaying = getIsPlaying, let getInfo = getInfo else { return }

        getIsPlaying(DispatchQueue.main) { [weak self] isPlaying in
            getInfo(DispatchQueue.main) { [weak self] info in
                guard let self = self else { return }

                let title = (info["kMRMediaRemoteNowPlayingInfoTitle"] as? String) ?? ""
                let artist = (info["kMRMediaRemoteNowPlayingInfoArtist"] as? String) ?? ""

                if isPlaying != self.lastIsPlaying || title != self.lastTitle || artist != self.lastArtist {
                    self.lastIsPlaying = isPlaying
                    self.lastTitle = title
                    self.lastArtist = artist

                    let out: [String: Any] = [
                        "type": "media",
                        "isPlaying": isPlaying,
                        "title": title,
                        "artist": artist
                    ]

                    if let data = try? JSONSerialization.data(withJSONObject: out, options: []),
                       let str = String(data: data, encoding: .utf8) {
                        print(str)
                        fflush(stdout)
                    }
                }
            }
        }
    }

    func handleCommand(_ cmd: String) {
        guard let sendCommand = sendCommand else { return }
        switch cmd.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "play_pause", "toggle":
            _ = sendCommand(2, nil) // kMRTogglePlayPause
        case "play":
            _ = sendCommand(0, nil) // kMRPlay
        case "pause":
            _ = sendCommand(1, nil) // kMRPause
        case "next":
            _ = sendCommand(4, nil) // kMRNextTrack
        case "prev", "previous":
            _ = sendCommand(5, nil) // kMRPreviousTrack
        default:
            break
        }
        // Force a check right after command
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.checkMediaState()
        }
    }
}

// MARK: - Raycast Window Observer (Maintains 100% backward compatibility)
class RaycastObserver {
    private var isRaycastActive: Bool? = nil
    private var lastBoundsStr = ""
    private var timer: Timer?

    func start() {
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(appActivated(_:)), name: NSWorkspace.didActivateApplicationNotification, object: nil)
        center.addObserver(self, selector: #selector(appDeactivated(_:)), name: NSWorkspace.didDeactivateApplicationNotification, object: nil)

        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.checkRaycastState()
        }
        checkRaycastState()
    }

    @objc private func appActivated(_ note: Notification) { checkRaycastState() }
    @objc private func appDeactivated(_ note: Notification) { checkRaycastState() }

    private func checkRaycastState() {
        let frontApp = NSWorkspace.shared.frontmostApplication
        let isFront = frontApp?.bundleIdentifier == "com.raycast.macos"

        var raycastBounds: [String: Any]? = nil
        if let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            for win in windowList {
                if let owner = win[kCGWindowOwnerName as String] as? String, owner == "Raycast" {
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

            var outJson: [String: Any] = [
                "type": "raycast",
                "visible": currentlyActive
            ]
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

// MARK: - Main Runner
let mediaObs = MediaObserver()
let raycastObs = RaycastObserver()

mediaObs.start()
raycastObs.start()

// Stdin reading loop in background thread
DispatchQueue.global(qos: .utility).async {
    while let line = readLine() {
        if line.starts(with: "{") {
            if let data = line.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let cmd = json["command"] as? String {
                DispatchQueue.main.async {
                    mediaObs.handleCommand(cmd)
                }
            }
        } else {
            DispatchQueue.main.async {
                mediaObs.handleCommand(line)
            }
        }
    }
}

RunLoop.main.run()
