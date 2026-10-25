import CoreBluetooth
import Foundation

/// Scans for, connects to, and talks to a Bluetooth machine. Unlike a browser, CoreBluetooth
/// can list every service on the device, so no service allow-list is needed.
final class BluetoothManager: NSObject, ObservableObject {
    struct Device: Identifiable {
        let peripheral: CBPeripheral
        var name: String
        var rssi: Int
        var id: UUID { peripheral.identifier }
    }

    enum BluetoothError: LocalizedError {
        case notConnected
        case notWritable

        var errorDescription: String? {
            switch self {
            case .notConnected: return "Not connected"
            case .notWritable: return "Characteristic can't be written"
            }
        }
    }

    @Published private(set) var isReady = false
    @Published private(set) var stateMessage = "Starting Bluetooth…"
    @Published private(set) var isScanning = false
    @Published private(set) var devices: [Device] = []
    @Published private(set) var connected: CBPeripheral?
    @Published private(set) var connecting: CBPeripheral?
    @Published private(set) var services: [CBService] = []

    var namePrefix = ""
    var onLog: ((String) -> Void)?
    var onValue: ((CBCharacteristic, Data) -> Void)?
    var onCharacteristicsFound: (([CBCharacteristic]) -> Void)?
    var onDisconnect: (() -> Void)?

    private var central: CBCentralManager!

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    var connectedName: String {
        connected?.name ?? connected?.identifier.uuidString ?? ""
    }

    func startScan() {
        guard isReady else { return }
        devices = []
        isScanning = true
        central.scanForPeripherals(withServices: nil, options: nil)
        onLog?("Scanning for machines…")
    }

    func stopScan() {
        guard isScanning else { return }
        central.stopScan()
        isScanning = false
    }

    func connect(_ device: Device) {
        stopScan()
        connecting = device.peripheral
        central.connect(device.peripheral)
        onLog?("Connecting to \(device.name)…")
    }

    func disconnect() {
        if let peripheral = connected ?? connecting {
            central.cancelPeripheralConnection(peripheral)
        }
    }

    func characteristic(_ uuid: CBUUID) -> CBCharacteristic? {
        services.flatMap { $0.characteristics ?? [] }.first { $0.uuid == uuid }
    }

    func write(_ data: Data, to characteristic: CBCharacteristic) throws {
        guard let peripheral = connected else { throw BluetoothError.notConnected }
        let props = characteristic.properties
        if props.contains(.write) {
            peripheral.writeValue(data, for: characteristic, type: .withResponse)
        } else if props.contains(.writeWithoutResponse) {
            peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
        } else {
            throw BluetoothError.notWritable
        }
    }

    func read(_ characteristic: CBCharacteristic) {
        connected?.readValue(for: characteristic)
    }

    func setNotify(_ enabled: Bool, for characteristic: CBCharacteristic) {
        connected?.setNotifyValue(enabled, for: characteristic)
    }

    private func refreshServices(_ peripheral: CBPeripheral) {
        services = peripheral.services ?? []
    }
}

extension BluetoothManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        isReady = central.state == .poweredOn
        switch central.state {
        case .poweredOn: stateMessage = "Bluetooth ready"
        case .poweredOff: stateMessage = "Bluetooth is off. Turn it on in Control Center."
        case .unauthorized:
            stateMessage = "Bluetooth access denied. Allow it in System Settings › Privacy & Security › Bluetooth."
        case .unsupported: stateMessage = "This Mac doesn't support Bluetooth Low Energy."
        default: stateMessage = "Waiting for Bluetooth…"
        }
        if !isReady { isScanning = false }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertised = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = peripheral.name ?? advertised ?? "Unnamed device"
        let prefix = namePrefix.trimmingCharacters(in: .whitespaces)
        if !prefix.isEmpty, !name.lowercased().hasPrefix(prefix.lowercased()) { return }

        let device = Device(peripheral: peripheral, name: name, rssi: RSSI.intValue)
        if let index = devices.firstIndex(where: { $0.id == device.id }) {
            devices[index] = device
        } else {
            devices.append(device)
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connecting = nil
        connected = peripheral
        peripheral.delegate = self
        onLog?("Connected to \(connectedName).")
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connecting = nil
        onLog?("Connection failed: \(error?.localizedDescription ?? "unknown error")")
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        connected = nil
        connecting = nil
        services = []
        onLog?("Disconnected.")
        onDisconnect?()
    }
}

extension BluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            onLog?("Couldn't list services: \(error.localizedDescription)")
            return
        }
        refreshServices(peripheral)
        for service in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if let error {
            onLog?("Couldn't read characteristics of \(service.uuid): \(error.localizedDescription)")
            return
        }
        refreshServices(peripheral)
        onCharacteristicsFound?(service.characteristics ?? [])
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let error {
            onLog?("Read from \(characteristic.uuid) failed: \(error.localizedDescription)")
            return
        }
        onValue?(characteristic, characteristic.value ?? Data())
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let error {
            onLog?("Write to \(characteristic.uuid) failed: \(error.localizedDescription)")
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let error {
            onLog?("Subscribe to \(characteristic.uuid) failed: \(error.localizedDescription)")
        } else {
            onLog?("\(characteristic.isNotifying ? "Subscribed to" : "Unsubscribed from") \(characteristic.uuid).")
        }
        // Republish so the explorer's Subscribe buttons update.
        refreshServices(peripheral)
    }
}
