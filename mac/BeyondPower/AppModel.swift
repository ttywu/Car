import AppKit
import CoreBluetooth
import Foundation
import UniformTypeIdentifiers

/// Workout state and the commands that go with it. Mirrors the web app's behavior.
final class AppModel: ObservableObject {
    enum Unit: String {
        case lb, kg
    }

    static let minLb = 5.0
    static let maxLb = 200.0
    static let lbPerKg = 2.20462
    static let modes = ["Weight", "Eccentric", "Chains", "Isokinetic", "Elastic"]
    static let historyLength = 200

    @Published private(set) var weightLb: Double
    @Published private(set) var unit: Unit
    @Published private(set) var mode = 0
    @Published private(set) var loaded = false
    @Published private(set) var demo = false
    @Published private(set) var reps = 0
    @Published private(set) var force: Double?
    @Published private(set) var position: Double?
    @Published private(set) var forceHistory: [Double] = []
    @Published private(set) var logLines: [String] = []
    @Published var profile: MachineProfile {
        didSet { bluetooth.namePrefix = profile.namePrefix }
    }

    let bluetooth = BluetoothManager()

    private var weightWork: DispatchWorkItem?
    private var demoTimer: Timer?
    private var demoTime = 0.0
    private var repRising = false
    private var repLow = Double.infinity
    private var repHigh = -Double.infinity

    private let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .medium
        return f
    }()

    init() {
        let defaults = UserDefaults.standard
        let savedWeight = defaults.double(forKey: "weightLb")
        weightLb = savedWeight > 0 ? min(Self.maxLb, max(Self.minLb, savedWeight)) : 20
        unit = Unit(rawValue: defaults.string(forKey: "unit") ?? "") ?? .lb
        profile = MachineProfile.loadSaved()
        bluetooth.namePrefix = profile.namePrefix

        bluetooth.onLog = { [weak self] in self?.log($0) }
        bluetooth.onValue = { [weak self] in self?.received($1, from: $0) }
        bluetooth.onCharacteristicsFound = { [weak self] in self?.characteristicsFound($0) }
        bluetooth.onDisconnect = { [weak self] in
            self?.loaded = false
        }
        log("Ready. Connect your machine or try demo mode.")
    }

    // MARK: - Log

    func log(_ message: String) {
        logLines.append("[\(timeFormatter.string(from: Date()))] \(message)")
        if logLines.count > 500 { logLines.removeFirst(logLines.count - 500) }
    }

    func clearLog() {
        logLines = []
    }

    // MARK: - Weight and mode

    var displayWeight: Double {
        unit == .lb ? weightLb.rounded() : ((weightLb / Self.lbPerKg) * 2).rounded() / 2
    }

    var displayWeightText: String {
        displayWeight.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(displayWeight))
            : String(format: "%.1f", displayWeight)
    }

    var sliderRange: ClosedRange<Double> {
        unit == .lb
            ? Self.minLb...Self.maxLb
            : (Self.minLb / Self.lbPerKg).rounded(.up)...(Self.maxLb / Self.lbPerKg).rounded(.down)
    }

    var sliderStep: Double { unit == .lb ? 1 : 0.5 }

    func setWeight(inUnit value: Double) {
        let lb = unit == .lb ? value : value * Self.lbPerKg
        weightLb = min(Self.maxLb, max(Self.minLb, lb))
        UserDefaults.standard.set(weightLb, forKey: "weightLb")
        // Debounce so dragging the slider doesn't flood the machine.
        weightWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.send(self.profile.setWeight, label: "weight \(self.displayWeightText) \(self.unit.rawValue)")
        }
        weightWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }

    func step(_ amount: Double) {
        setWeight(inUnit: displayWeight + amount)
    }

    func toggleUnit() {
        unit = unit == .lb ? .kg : .lb
        UserDefaults.standard.set(unit.rawValue, forKey: "unit")
    }

    func setMode(_ newMode: Int) {
        mode = newMode
        send(profile.setMode, label: "mode \(Self.modes[newMode])")
    }

    // MARK: - Load

    func load() {
        if send(profile.load, label: "load") {
            loaded = true
        }
    }

    func unload() {
        // Always show unloaded locally; a failed send is reported in the log.
        loaded = false
        send(profile.unload, label: "unload")
    }

    // MARK: - Sending

    private var commandVars: [String: Double] {
        let kg = weightLb / Self.lbPerKg
        return [
            "weight_lb": weightLb,
            "weight_kg": kg,
            "weight_lb10": weightLb * 10,
            "weight_kg10": kg * 10,
            "mode": Double(mode),
        ]
    }

    @discardableResult
    private func send(_ template: String, label: String) -> Bool {
        if demo {
            log("Demo: \(label)")
            return true
        }
        guard bluetooth.connected != nil else {
            log("Not connected; \"\(label)\" not sent.")
            return false
        }
        guard !template.trimmingCharacters(in: .whitespaces).isEmpty else {
            log("No \"\(label)\" command in the profile; nothing sent.")
            return false
        }
        guard let uuid = profile.writeUUID, let characteristic = bluetooth.characteristic(uuid) else {
            log("No write characteristic found; check the profile UUIDs.")
            return false
        }
        do {
            let data = try CommandEncoder.encode(template, vars: commandVars)
            try bluetooth.write(data, to: characteristic)
            log("Sent \(label): \(data.hex)")
            return true
        } catch {
            log("Failed to send \(label): \(error.localizedDescription)")
            return false
        }
    }

    /// Used by the explorer's Write button.
    func writeRaw(_ text: String, to characteristic: CBCharacteristic) {
        do {
            let data = try CommandEncoder.encode(text, vars: commandVars)
            try bluetooth.write(data, to: characteristic)
            log("\(characteristic.uuid) ⇒ \(data.hex)")
        } catch {
            log("Write failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Bluetooth events

    private func characteristicsFound(_ characteristics: [CBCharacteristic]) {
        for characteristic in characteristics {
            if characteristic.uuid == profile.writeUUID {
                log("Found write characteristic \(characteristic.uuid).")
            }
            if characteristic.uuid == profile.notifyUUID {
                bluetooth.setNotify(true, for: characteristic)
            }
        }
    }

    private func received(_ data: Data, from characteristic: CBCharacteristic) {
        // Telemetry arrives many times a second, so only other values are logged.
        if characteristic.uuid == profile.notifyUUID {
            parseTelemetry(data)
        } else {
            let text = String(decoding: data, as: UTF8.self)
                .map { $0.isASCII && !$0.isNewline && ($0.asciiValue ?? 0) >= 0x20 ? $0 : "." }
            log("\(characteristic.uuid) ⇐ \(data.hex)  \"\(String(text))\"")
        }
    }

    // MARK: - Telemetry

    private func parseTelemetry(_ data: Data) {
        func number(_ offset: String, _ type: String, _ scale: String) -> Double? {
            guard let offset = Int(offset.trimmingCharacters(in: .whitespaces)),
                  let raw = CommandEncoder.readNumber(data, offset: offset, type: type)
            else { return nil }
            let divisor = Double(scale) ?? 1
            return raw / (divisor == 0 ? 1 : divisor)
        }
        updateTelemetry(
            force: number(profile.forceOffset, profile.forceType, profile.forceScale),
            position: number(profile.positionOffset, profile.positionType, profile.positionScale)
        )
    }

    private func updateTelemetry(force newForce: Double?, position newPosition: Double?) {
        if let newForce {
            force = newForce
            forceHistory.append(newForce)
            if forceHistory.count > Self.historyLength { forceHistory.removeFirst() }
        }
        if let newPosition {
            position = newPosition
            countRep(newPosition)
        }
    }

    /// Counts a rep each time the cable goes out and comes back by a clear margin.
    private func countRep(_ pos: Double) {
        let margin = 10.0
        repLow = min(repLow, pos)
        repHigh = max(repHigh, pos)
        if !repRising, pos > repLow + margin {
            repRising = true
            repHigh = pos
        } else if repRising, pos < repHigh - margin {
            repRising = false
            repLow = pos
            reps += 1
        }
    }

    func resetReps() {
        reps = 0
        repRising = false
        repLow = .infinity
        repHigh = -.infinity
    }

    // MARK: - Demo

    func toggleDemo() {
        demo ? stopDemo() : startDemo()
    }

    private func startDemo() {
        guard bluetooth.connected == nil else {
            log("Disconnect the machine before using demo mode.")
            return
        }
        demo = true
        demoTime = 0
        demoTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.demoTick()
        }
        log("Demo mode on. Controls are simulated.")
    }

    private func stopDemo() {
        demoTimer?.invalidate()
        demoTimer = nil
        demo = false
        loaded = false
        log("Demo mode off.")
    }

    private func demoTick() {
        demoTime += 0.05
        let wave = sin(demoTime * 1.6)
        let pos = loaded ? 30 + 30 * wave : 0
        var newForce = 0.0
        if loaded {
            let factor: Double
            switch mode {
            case 1: factor = wave < 0 ? 1.3 : 1
            case 2: factor = 0.7 + pos / 100
            case 3: factor = 0.9
            case 4: factor = 0.6 + pos / 80
            default: factor = 1
            }
            newForce = weightLb * factor + Double.random(in: -1...1)
        }
        updateTelemetry(force: newForce, position: pos)
    }

    // MARK: - Profile

    func saveProfile() {
        profile.save()
        log("Profile saved.")
    }

    func exportProfile() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "beyond-power-profile.json"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(profile).write(to: url)
            log("Exported profile to \(url.lastPathComponent).")
        } catch {
            log("Export failed: \(error.localizedDescription)")
        }
    }

    func importProfile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            profile = try JSONDecoder().decode(MachineProfile.self, from: Data(contentsOf: url))
            profile.save()
            log("Imported profile from \(url.lastPathComponent).")
        } catch {
            log("Import failed: \(error.localizedDescription)")
        }
    }
}
