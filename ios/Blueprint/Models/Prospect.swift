import Foundation

/// A commercial-property prospect — mirrors `Prospect` in `src/lib/types.ts`.
/// Read via `GET /api/prospects`; the user-managed pipeline fields
/// (`pipeline_status` / `assignee` / `notes`) are edited via
/// `PATCH /api/prospects/{id}`. Property data itself comes from ATTOM (or mock).
struct Prospect: Identifiable, Decodable, Hashable {
    let id: String
    var address: String
    var city: String?
    var state: String?
    var zip: String?
    var latitude: Double?
    var longitude: Double?
    var buildingSqft: Double?
    var yearBuilt: Int?
    var owner: String?
    var marketValue: Double?
    var lastSaleAmount: Double?
    var distanceMiles: Double?
    /// Pipeline stage: new / contacted / qualified / dead (defaults to new).
    var pipelineStatus: String
    var assignee: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case address, city, state, zip, latitude, longitude
        case buildingSqft = "building_sqft"
        case yearBuilt = "year_built"
        case owner
        case marketValue = "market_value"
        case lastSaleAmount = "last_sale_amount"
        case distanceMiles = "distance_miles"
        case pipelineStatus = "pipeline_status"
        case assignee, notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        address = (try? c.decode(String.self, forKey: .address)) ?? "(no address)"
        city = try? c.decode(String.self, forKey: .city)
        state = try? c.decode(String.self, forKey: .state)
        zip = try? c.decode(String.self, forKey: .zip)
        latitude = try? c.decode(Double.self, forKey: .latitude)
        longitude = try? c.decode(Double.self, forKey: .longitude)
        buildingSqft = try? c.decode(Double.self, forKey: .buildingSqft)
        yearBuilt = try? c.decode(Int.self, forKey: .yearBuilt)
        owner = try? c.decode(String.self, forKey: .owner)
        marketValue = try? c.decode(Double.self, forKey: .marketValue)
        lastSaleAmount = try? c.decode(Double.self, forKey: .lastSaleAmount)
        distanceMiles = try? c.decode(Double.self, forKey: .distanceMiles)
        pipelineStatus = (try? c.decode(String.self, forKey: .pipelineStatus)) ?? "new"
        assignee = try? c.decode(String.self, forKey: .assignee)
        notes = try? c.decode(String.self, forKey: .notes)
    }

    var sqftFormatted: String? {
        guard let s = buildingSqft else { return nil }
        let n = NumberFormatter()
        n.numberStyle = .decimal
        n.maximumFractionDigits = 0
        return (n.string(from: s as NSNumber)).map { "\($0) sf" }
    }

    var distanceFormatted: String? {
        distanceMiles.map { String(format: "%.1f mi", $0) }
    }
}

/// Wrapper for `GET /api/prospects` (`{ prospects, center, defaults, live }`).
struct ProspectsResponse: Decodable {
    var prospects: [Prospect]
    var live: Bool?
}

#if DEBUG
extension Prospect {
    init(id: String, address: String, owner: String, buildingSqft: Double,
         distanceMiles: Double, pipelineStatus: String, assignee: String? = nil) {
        self.id = id
        self.address = address
        self.city = nil; self.state = nil; self.zip = nil
        self.latitude = nil; self.longitude = nil
        self.buildingSqft = buildingSqft
        self.yearBuilt = 1998
        self.owner = owner
        self.marketValue = nil; self.lastSaleAmount = nil
        self.distanceMiles = distanceMiles
        self.pipelineStatus = pipelineStatus
        self.assignee = assignee
        self.notes = nil
    }

    static let samples: [Prospect] = [
        Prospect(id: "1", address: "3875 Corporate Dr, Novi, MI 48377", owner: "Heartland Properties LLC", buildingSqft: 58000, distanceMiles: 3.9, pipelineStatus: "new", assignee: "Ady"),
        Prospect(id: "2", address: "1200 Industrial Row, Troy, MI 48083", owner: "Great Lakes Holdings LLC", buildingSqft: 64500, distanceMiles: 6.2, pipelineStatus: "contacted", assignee: "Bob"),
        Prospect(id: "3", address: "550 Logistics Way, Auburn Hills, MI 48326", owner: "Summit Realty Trust", buildingSqft: 71200, distanceMiles: 8.1, pipelineStatus: "qualified"),
    ]
}
#endif
