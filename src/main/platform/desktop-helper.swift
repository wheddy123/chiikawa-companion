import Cocoa
import CoreGraphics
import Foundation

// MARK: - Dynamic MediaRemote Bindings
typealias MRMediaRemoteGetNowPlayingInfoFunction = @convention(c) (DispatchQueue, @escaping (CFDictionary?) -> Void) -> Void
typealias MRMediaRemoteGetNowPlayingApplicationIsPlayingFunction = @convention(c) (DispatchQueue, @escaping (Bool) -> Void) -> Void
typealias MRMediaRemoteGetNowPlayingApplicationPlaybackStateFunction = @convention(c) (DispatchQueue, @escaping (UInt32) -> Void) -> Void
typealias MRMediaRemoteRegisterForNowPlayingNotificationsFunction = @convention(c) (DispatchQueue) -> Void
typealias MRMediaRemoteSendCommandFunction = @convention(c) (Int32, AnyObject?) -> Bool

class MediaObserver {
    private var getInfo: MRMediaRemoteGetNowPlayingInfoFunction?
    private var getIsPlaying: MRMediaRemoteGetNowPlayingApplicationIsPlayingFunction?
    private var getPlaybackState: MRMediaRemoteGetNowPlayingApplicationPlaybackStateFunction?
    private var registerNotifications: MRMediaRemoteRegisterForNowPlayingNotificationsFunction?
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
            if let pState = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationPlaybackState") {
                getPlaybackState = unsafeBitCast(pState, to: MRMediaRemoteGetNowPlayingApplicationPlaybackStateFunction.self)
            }
            if let pReg = dlsym(handle, "MRMediaRemoteRegisterForNowPlayingNotifications") {
                registerNotifications = unsafeBitCast(pReg, to: MRMediaRemoteRegisterForNowPlayingNotificationsFunction.self)
            }
            if let pSend = dlsym(handle, "MRMediaRemoteSendCommand") {
                sendCommand = unsafeBitCast(pSend, to: MRMediaRemoteSendCommandFunction.self)
            }
        }
    }

    func start() {
        guard getInfo != nil else {
            // MediaRemote not available
            return
        }

        // Register for immediate system notifications
        if let register = registerNotifications {
            register(DispatchQueue.main)
            let center = NotificationCenter.default
            let noteNames = [
                "kMRMediaRemoteNowPlayingInfoDidChangeNotification",
                "kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification",
                "kMRMediaRemoteNowPlayingApplicationPlaybackStateDidChangeNotification"
            ]
            for name in noteNames {
                center.addObserver(forName: NSNotification.Name(rawValue: name), object: nil, queue: .main) { [weak self] _ in
                    self?.checkMediaState()
                }
            }
        }

        // Keep 0.8s polling as safety net
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            self?.checkMediaState()
        }
        checkMediaState()
    }

    func checkMediaState() {
        if let getInfo = getInfo {
            getInfo(DispatchQueue.main) { [weak self] cfInfo in
                guard let self = self else { return }
                if let cfInfo = cfInfo {
                    let dict = cfInfo as NSDictionary

                    let title = (dict["kMRMediaRemoteNowPlayingInfoTitle"] as? String) ?? ""
                    let artist = (dict["kMRMediaRemoteNowPlayingInfoArtist"] as? String) ?? ""

                    var ratePlaying = false
                    if let rate = (dict["kMRMediaRemoteNowPlayingInfoPlaybackRate"] as? NSNumber)?.doubleValue {
                        ratePlaying = rate > 0.0
                    }

                    if let getIsPlaying = self.getIsPlaying {
                        getIsPlaying(DispatchQueue.main) { [weak self] sysIsPlaying in
                            guard let self = self else { return }
                            let isPlaying = ratePlaying || sysIsPlaying
                            if !title.isEmpty || isPlaying {
                                self.emitState(isPlaying: isPlaying, title: title, artist: artist)
                                return
                            }
                            self.checkAppleScriptFallback()
                        }
                    } else if !title.isEmpty || ratePlaying {
                        self.emitState(isPlaying: ratePlaying, title: title, artist: artist)
                        return
                    } else {
                        self.checkAppleScriptFallback()
                    }
                } else {
                    self.checkAppleScriptFallback()
                }
            }
        } else {
            checkAppleScriptFallback()
        }
    }

    private func checkAppleScriptFallback() {
        // 1. Check Music.app if running
        let musicApps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Music")
        if let musicApp = musicApps.first, !musicApp.isTerminated {
            let script = "tell application \"Music\" to get {player state as string, name of current track, artist of current track}"
            if let appleScript = NSAppleScript(source: script) {
                var error: NSDictionary?
                let res = appleScript.executeAndReturnError(&error)
                if error == nil {
                    let state = res.atIndex(1)?.stringValue ?? ""
                    let title = res.atIndex(2)?.stringValue ?? ""
                    let artist = res.atIndex(3)?.stringValue ?? ""
                    let isPlaying = state.lowercased() == "playing"
                    self.emitState(isPlaying: isPlaying, title: title, artist: artist)
                    return
                }
            }
        }

        // 2. Check Spotify if running
        let spotifyApps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.spotify.client")
        if let spotifyApp = spotifyApps.first, !spotifyApp.isTerminated {
            let script = "tell application \"Spotify\" to get {player state as string, name of current track, artist of current track}"
            if let appleScript = NSAppleScript(source: script) {
                var error: NSDictionary?
                let res = appleScript.executeAndReturnError(&error)
                if error == nil {
                    let state = res.atIndex(1)?.stringValue ?? ""
                    let title = res.atIndex(2)?.stringValue ?? ""
                    let artist = res.atIndex(3)?.stringValue ?? ""
                    let isPlaying = state.lowercased() == "playing"
                    self.emitState(isPlaying: isPlaying, title: title, artist: artist)
                    return
                }
            }
        }

        // 3. Otherwise, emit stopped
        self.emitState(isPlaying: false, title: "", artist: "")
    }

    private func runAppleScriptCommand(_ command: String) {
        if let appleScript = NSAppleScript(source: command) {
            var error: NSDictionary?
            appleScript.executeAndReturnError(&error)
        }
    }

    private func emitState(isPlaying: Bool, title: String, artist: String) {
        if isPlaying != lastIsPlaying || title != lastTitle || artist != lastArtist {
            lastIsPlaying = isPlaying
            lastTitle = title
            lastArtist = artist

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

    func handleCommand(_ cmd: String) {
        let trimmed = cmd.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let isMusicActive = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Music").first?.isTerminated == false
        let isSpotifyActive = NSRunningApplication.runningApplications(withBundleIdentifier: "com.spotify.client").first?.isTerminated == false

        switch trimmed {
        case "play_pause", "toggle":
            var ok = false
            if let sendCommand = sendCommand {
                ok = sendCommand(2, nil)
            }
            if !ok {
                if isMusicActive {
                    runAppleScriptCommand("tell application \"Music\" to playpause")
                } else if isSpotifyActive {
                    runAppleScriptCommand("tell application \"Spotify\" to playpause")
                } else {
                    postSystemMediaKey(16)
                }
            }
        case "play":
            var ok = false
            if let sendCommand = sendCommand {
                ok = sendCommand(0, nil)
            }
            if !ok {
                if isMusicActive {
                    runAppleScriptCommand("tell application \"Music\" to play")
                } else if isSpotifyActive {
                    runAppleScriptCommand("tell application \"Spotify\" to play")
                } else {
                    postSystemMediaKey(16)
                }
            }
        case "pause":
            var ok = false
            if let sendCommand = sendCommand {
                ok = sendCommand(1, nil)
            }
            if !ok {
                if isMusicActive {
                    runAppleScriptCommand("tell application \"Music\" to pause")
                } else if isSpotifyActive {
                    runAppleScriptCommand("tell application \"Spotify\" to pause")
                } else {
                    postSystemMediaKey(16)
                }
            }
        case "next":
            var ok = false
            if let sendCommand = sendCommand {
                ok = sendCommand(4, nil)
            }
            if !ok {
                if isMusicActive {
                    runAppleScriptCommand("tell application \"Music\" to next track")
                } else if isSpotifyActive {
                    runAppleScriptCommand("tell application \"Spotify\" to next track")
                } else {
                    postSystemMediaKey(19)
                }
            }
        case "prev", "previous":
            var ok = false
            if let sendCommand = sendCommand {
                ok = sendCommand(5, nil)
            }
            if !ok {
                if isMusicActive {
                    runAppleScriptCommand("tell application \"Music\" to previous track")
                } else if isSpotifyActive {
                    runAppleScriptCommand("tell application \"Spotify\" to previous track")
                } else {
                    postSystemMediaKey(20)
                }
            }
        default:
            break
        }

        // Force an immediate check right after command
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.checkMediaState()
        }
    }

    private func postSystemMediaKey(_ key: Int32) {
        func doKey(down: Bool) {
            let flags = down ? 0xa00 : 0xb00
            let data1 = Int((key << 16) | (down ? 0xa00 : 0xb00))
            let ev = NSEvent.otherEvent(
                with: .systemDefined,
                location: .zero,
                modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(flags)),
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                subtype: 8,
                data1: data1,
                data2: -1
            )
            ev?.cgEvent?.post(tap: .cghidEventTap)
        }
        doKey(down: true)
        doKey(down: false)
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
