import CoreBluetooth
import Foundation

/// The Bluetooth UUIDs and commands for one machine. Beyond Power has not published its
/// protocol, so the user fills these in. The JSON keys match the web app's profile export.
struct MachineProfile: Codable, Equatable {
    var namePrefix = ""
    var service = ""
    var write = ""
    var notify = ""
    var extra = ""
    var setWeight = ""
    var setMode = ""
    var load = ""
    var unload = ""
    var forceOffset = ""
    var forceType = "u16le"
    var forceScale = ""
    var positionOffset = ""
    var positionType = "u16le"
    var positionScale = ""

    static let numberTypes = ["u16le", "u16be", "i16le", "u8"]
    private static let storageKey = "bp-control-profile"

    enum CodingKeys: String, CodingKey {
        case namePrefix, service, write, notify, extra, setWeight, setMode, load, unload
        case forceOffset = "forceOff"
        case forceType, forceScale
        case positionOffset = "posOff"
        case positionType = "posType"
        case positionScale = "posScale"
    }

    init() {}

    // Missing keys fall back to defaults so older or hand-written profiles still load.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func string(_ key: CodingKeys, _ fallback: String = "") -> String {
            (try? c.decodeIfPresent(String.self, forKey: key)) ?? fallback
        }
        namePrefix = string(.namePrefix)
        service = string(.service)
        write = string(.write)
        notify = string(.notify)
        extra = string(.extra)
        setWeight = string(.setWeight)
        setMode = string(.setMode)
        load = string(.load)
        unload = string(.unload)
        forceOffset = string(.forceOffset)
        forceType = string(.forceType, "u16le")
        forceScale = string(.forceScale)
        positionOffset = string(.positionOffset)
        positionType = string(.positionType, "u16le")
        positionScale = string(.positionScale)
    }

    static func loadSaved() -> MachineProfile {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let profile = try? JSONDecoder().decode(MachineProfile.self, from: data)
        else { return MachineProfile() }
        return profile
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    /// CBUUID(string:) crashes on malformed input, so validate before converting.
    static func uuid(_ text: String) -> CBUUID? {
        var value = text.trimmingCharacters(in: .whitespaces).lowercased()
        if value.hasPrefix("0x") { value.removeFirst(2) }
        let pattern = "^([0-9a-f]{4}|[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
        guard value.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return CBUUID(string: value)
    }

    var writeUUID: CBUUID? { Self.uuid(write) }
    var notifyUUID: CBUUID? { Self.uuid(notify) }
}

enum CommandError: LocalizedError {
    case badToken(String)
    case unknownPlaceholder(String)
    case unknownType(String)

    var errorDescription: String? {
        switch self {
        case .badToken(let token): return "Bad token \"\(token)\""
        case .unknownPlaceholder(let name): return "Unknown placeholder \"\(name)\""
        case .unknownType(let type): return "Unknown type \"\(type)\""
        }
    }
}

/// Turns a template like "A1 {weight_lb10:u16le} 00" into bytes.
enum CommandEncoder {
    private static let tokenPattern = try! NSRegularExpression(pattern: "\\{[^}]+\\}|[0-9a-fA-F]{2}|\\S+")

    static func encode(_ template: String, vars: [String: Double]) throws -> Data {
        var bytes: [UInt8] = []
        let text = template as NSString
        let matches = tokenPattern.matches(in: template, range: NSRange(location: 0, length: text.length))
        for match in matches {
            let token = text.substring(with: match.range)
            if token.hasPrefix("{") {
                let parts = token.dropFirst().dropLast().split(separator: ":", maxSplits: 1).map(String.init)
                let name = parts.first ?? ""
                let type = parts.count > 1 ? parts[1] : "u8"
                guard let value = vars[name] else { throw CommandError.unknownPlaceholder(name) }
                bytes += try encodeValue(value, type: type)
            } else if token.count == 2, token.allSatisfy(\.isHexDigit), let byte = UInt8(token, radix: 16) {
                bytes.append(byte)
            } else {
                throw CommandError.badToken(token)
            }
        }
        return Data(bytes)
    }

    private static func encodeValue(_ value: Double, type: String) throws -> [UInt8] {
        let v = Int(value.rounded())
        let b0 = UInt8(truncatingIfNeeded: v)
        let b1 = UInt8(truncatingIfNeeded: v >> 8)
        switch type {
        case "u8": return [b0]
        case "u16le": return [b0, b1]
        case "u16be": return [b1, b0]
        case "u32le": return [b0, b1, UInt8(truncatingIfNeeded: v >> 16), UInt8(truncatingIfNeeded: v >> 24)]
        default: throw CommandError.unknownType(type)
        }
    }

    /// Reads one number from a telemetry packet, or nil if it doesn't fit.
    static func readNumber(_ data: Data, offset: Int, type: String) -> Double? {
        let bytes = [UInt8](data)
        let size = type == "u8" ? 1 : 2
        guard offset >= 0, offset + size <= bytes.count else { return nil }
        let lo = UInt16(bytes[offset])
        switch type {
        case "u8": return Double(bytes[offset])
        case "u16be": return Double(lo << 8 | UInt16(bytes[offset + 1]))
        case "i16le": return Double(Int16(bitPattern: lo | UInt16(bytes[offset + 1]) << 8))
        default: return Double(lo | UInt16(bytes[offset + 1]) << 8)
        }
    }
}

extension Data {
    var hex: String { map { String(format: "%02X", $0) }.joined(separator: " ") }
}
