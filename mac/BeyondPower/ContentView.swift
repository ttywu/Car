import AppKit
import CoreBluetooth
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var bluetooth: BluetoothManager

    var body: some View {
        VStack(spacing: 0) {
            StatusBar(model: model, bluetooth: bluetooth)
            Divider()
            HSplitView {
                ScrollView {
                    VStack(spacing: 16) {
                        ControlPanel(model: model)
                        StatsPanel(model: model)
                    }
                    .padding()
                }
                .frame(minWidth: 440, idealWidth: 480)

                TabView {
                    ConnectView(model: model, bluetooth: bluetooth)
                        .tabItem { Text("Connect") }
                    ProfileView(model: model)
                        .tabItem { Text("Machine profile") }
                    ExplorerView(model: model, bluetooth: bluetooth)
                        .tabItem { Text("Explorer") }
                    LogView(model: model)
                        .tabItem { Text("Log") }
                }
                .padding()
                .frame(minWidth: 480)
            }
            Divider()
            Text(model.logLines.last ?? "")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
        }
    }
}

// MARK: - Status bar

private struct StatusBar: View {
    @ObservedObject var model: AppModel
    @ObservedObject var bluetooth: BluetoothManager

    private var status: (text: String, color: Color) {
        if model.demo { return ("Demo mode (no machine)", .purple) }
        if bluetooth.connected != nil { return ("Connected: \(bluetooth.connectedName)", .green) }
        if bluetooth.connecting != nil { return ("Connecting…", .yellow) }
        if !bluetooth.isReady { return (bluetooth.stateMessage, .red) }
        return ("Not connected", .gray)
    }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(status.color)
                .frame(width: 10, height: 10)
            Text(status.text)
                .foregroundStyle(.secondary)
            Spacer()
            Button(model.demo ? "Exit demo" : "Demo mode") { model.toggleDemo() }
            if bluetooth.connected != nil || bluetooth.connecting != nil {
                Button("Disconnect") { bluetooth.disconnect() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - Controls

private struct ControlPanel: View {
    @ObservedObject var model: AppModel

    var body: some View {
        GroupBox {
            VStack(spacing: 16) {
                HStack(spacing: 8) {
                    stepButton(-5)
                    stepButton(-1)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(model.displayWeightText)
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .frame(minWidth: 140)
                        Button(model.unit.rawValue) { model.toggleUnit() }
                            .help("Switch between pounds and kilograms")
                    }
                    stepButton(1)
                    stepButton(5)
                }

                Slider(
                    value: Binding(get: { model.displayWeight }, set: { model.setWeight(inUnit: $0) }),
                    in: model.sliderRange,
                    step: model.sliderStep
                )
                .tint(.orange)

                Picker("Mode", selection: Binding(get: { model.mode }, set: { model.setMode($0) })) {
                    ForEach(AppModel.modes.indices, id: \.self) { index in
                        Text(AppModel.modes[index]).tag(index)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                HStack(spacing: 12) {
                    Button {
                        model.loaded ? model.unload() : model.load()
                    } label: {
                        Text(model.loaded ? "Loaded" : "Load")
                            .font(.title2.bold())
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(model.loaded ? Color.green : Color.green.opacity(0.55))

                    Button {
                        model.unload()
                    } label: {
                        Text("STOP / Unload")
                            .font(.title2.bold())
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .keyboardShortcut(.escape, modifiers: [])
                }

                Text("Press Esc any time to unload. Load stays off until you press Load.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(8)
        }
    }

    private func stepButton(_ amount: Double) -> some View {
        let title: String = amount > 0 ? "+\(Int(amount))" : "−\(Int(-amount))"
        return Button(title) { model.step(amount) }
            .controlSize(.large)
    }
}

// MARK: - Stats

private struct StatsPanel: View {
    @ObservedObject var model: AppModel

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatTile(label: "Reps", value: "\(model.reps)")
                    StatTile(label: "Force", value: format(model.force))
                    StatTile(label: "Cable", value: format(model.position))
                    StatTile(label: "State", value: model.loaded ? "Loaded" : "Unloaded")
                }
                ForceChart(values: model.forceHistory)
                    .frame(height: 140)
                Button("Reset reps") { model.resetReps() }
            }
            .padding(8)
        }
    }

    private func format(_ value: Double?) -> String {
        value.map { String(format: "%.1f", $0) } ?? "–"
    }
}

private struct StatTile: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title.bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.06)))
    }
}

private struct ForceChart: View {
    let values: [Double]

    var body: some View {
        GeometryReader { geo in
            Path { path in
                guard values.count > 1 else { return }
                let top = max(10, values.max() ?? 10) * 1.1
                let width = geo.size.width
                let height = geo.size.height
                for (index, value) in values.enumerated() {
                    let x = CGFloat(index) / CGFloat(AppModel.historyLength - 1) * width
                    let y = height - CGFloat(value / top) * height
                    if index == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(Color.orange, lineWidth: 2)
        }
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.06)))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel("Live force")
    }
}

// MARK: - Connect

private struct ConnectView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var bluetooth: BluetoothManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(bluetooth.stateMessage)
                .foregroundStyle(.secondary)
            HStack {
                TextField("Device name starts with (optional)", text: $model.profile.namePrefix)
                Button(bluetooth.isScanning ? "Stop scan" : "Scan") {
                    bluetooth.isScanning ? bluetooth.stopScan() : bluetooth.startScan()
                }
                .disabled(!bluetooth.isReady || model.demo)
            }
            List(bluetooth.devices) { device in
                HStack {
                    VStack(alignment: .leading) {
                        Text(device.name)
                        Text(device.id.uuidString)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(device.rssi) dBm")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                    Button(bluetooth.connected?.identifier == device.id ? "Connected" : "Connect") {
                        bluetooth.connect(device)
                    }
                    .disabled(bluetooth.connected != nil || bluetooth.connecting != nil)
                }
                .padding(.vertical, 2)
            }
            .overlay {
                if bluetooth.devices.isEmpty {
                    Text(bluetooth.isScanning ? "Looking for machines…" : "Click Scan to find your machine.")
                        .foregroundStyle(.secondary)
                }
            }
            Text("Turn the machine on and close the Beyond Power phone app first. The machine accepts one connection at a time.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(8)
    }
}

// MARK: - Profile

private struct ProfileView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Form {
            Section {
                Text("Beyond Power has not published its Bluetooth commands. Fill these in from your own capture, or find them in the Explorer tab. Commands are hex bytes; placeholders like {weight_lb10:u16le} are filled in when sent.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Section("Bluetooth") {
                TextField("Service UUID", text: $model.profile.service, prompt: Text("e.g. 0000fff0-0000-1000-8000-00805f9b34fb"))
                TextField("Write characteristic", text: $model.profile.write, prompt: Text("UUID"))
                TextField("Notify characteristic", text: $model.profile.notify, prompt: Text("UUID"))
            }
            Section("Commands") {
                TextField("Set weight", text: $model.profile.setWeight, prompt: Text("01 {weight_lb10:u16le}"))
                TextField("Set mode", text: $model.profile.setMode, prompt: Text("02 {mode:u8}"))
                TextField("Load", text: $model.profile.load, prompt: Text("03 01"))
                TextField("Unload", text: $model.profile.unload, prompt: Text("03 00"))
                Text("Placeholders: weight_lb, weight_kg, weight_lb10, weight_kg10, mode. Types: u8, u16le, u16be, u32le.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Telemetry decoding (optional)") {
                TextField("Force byte offset", text: $model.profile.forceOffset, prompt: Text("e.g. 2"))
                typePicker("Force type", selection: $model.profile.forceType)
                TextField("Force scale (÷)", text: $model.profile.forceScale, prompt: Text("1"))
                TextField("Position byte offset", text: $model.profile.positionOffset, prompt: Text("e.g. 4"))
                typePicker("Position type", selection: $model.profile.positionType)
                TextField("Position scale (÷)", text: $model.profile.positionScale, prompt: Text("1"))
            }
            Section {
                HStack {
                    Button("Save profile") { model.saveProfile() }
                        .buttonStyle(.borderedProminent)
                    Button("Export…") { model.exportProfile() }
                    Button("Import…") { model.importProfile() }
                }
            }
        }
        .formStyle(.grouped)
    }

    private func typePicker(_ title: String, selection: Binding<String>) -> some View {
        Picker(title, selection: selection) {
            ForEach(MachineProfile.numberTypes, id: \.self) { Text($0).tag($0) }
        }
    }
}

// MARK: - Explorer

private func uuidLabel(for uuid: CBUUID) -> String {
    let name = uuid.description
    return name == uuid.uuidString ? name : "\(uuid.uuidString) (\(name))"
}

private struct ExplorerView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var bluetooth: BluetoothManager

    var body: some View {
        if bluetooth.services.isEmpty {
            Text(bluetooth.connected == nil ? "Connect a machine to see its services." : "Looking for services…")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(bluetooth.services, id: \.self) { service in
                    Section("Service \(uuidLabel(for: service.uuid))") {
                        ForEach(service.characteristics ?? [], id: \.self) { characteristic in
                            CharacteristicRow(model: model, bluetooth: bluetooth, characteristic: characteristic)
                        }
                    }
                }
            }
        }
    }
}

private struct CharacteristicRow: View {
    let model: AppModel
    let bluetooth: BluetoothManager
    let characteristic: CBCharacteristic
    @State private var text = ""

    private var props: CBCharacteristicProperties { characteristic.properties }
    private var canWrite: Bool { props.contains(.write) || props.contains(.writeWithoutResponse) }
    private var canNotify: Bool { props.contains(.notify) || props.contains(.indicate) }

    private var propertyNames: String {
        var names: [String] = []
        if props.contains(.read) { names.append("read") }
        if props.contains(.write) { names.append("write") }
        if props.contains(.writeWithoutResponse) { names.append("writeWithoutResponse") }
        if props.contains(.notify) { names.append("notify") }
        if props.contains(.indicate) { names.append("indicate") }
        return names.joined(separator: ", ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(uuidLabel(for: characteristic.uuid))
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                Spacer()
                Text(propertyNames)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                if props.contains(.read) {
                    Button("Read") { bluetooth.read(characteristic) }
                }
                if canNotify {
                    Button(characteristic.isNotifying ? "Unsubscribe" : "Subscribe") {
                        bluetooth.setNotify(!characteristic.isNotifying, for: characteristic)
                    }
                }
                if canWrite {
                    TextField("hex bytes, e.g. 01 02", text: $text)
                        .font(.system(.body, design: .monospaced))
                    Button("Write") { model.writeRaw(text, to: characteristic) }
                }
                Spacer()
                if canWrite || canNotify {
                    Menu("Use in profile") {
                        if canWrite {
                            Button("As write characteristic") { use(as: \.write) }
                        }
                        if canNotify {
                            Button("As notify characteristic") { use(as: \.notify) }
                        }
                    }
                    .fixedSize()
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func use(as field: WritableKeyPath<MachineProfile, String>) {
        model.profile[keyPath: field] = characteristic.uuid.uuidString
        if let service = characteristic.service {
            model.profile.service = service.uuid.uuidString
        }
        model.saveProfile()
        if field == \MachineProfile.notify, canNotify, !characteristic.isNotifying {
            bluetooth.setNotify(true, for: characteristic)
        }
    }
}

// MARK: - Log

private struct LogView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Spacer()
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(model.logLines.joined(separator: "\n"), forType: .string)
                }
                Button("Clear") { model.clearLog() }
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(model.logLines.enumerated()), id: \.offset) { entry in
                            Text(entry.element)
                                .font(.system(size: 11, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(entry.offset)
                        }
                    }
                    .padding(8)
                }
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.06)))
                .onChange(of: model.logLines.count) { count in
                    proxy.scrollTo(count - 1, anchor: .bottom)
                }
            }
        }
        .padding(8)
    }
}
