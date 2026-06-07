import Foundation

/// A tracked quote — mirrors `Quote` in `src/lib/types.ts`. Read via
/// `GET /api/quotes`; the outcome (`status`) is toggled via
/// `POST /api/quotes/{id}/status`. Defensive decode: only `_id` is required.
struct Quote: Identifiable, Decodable, Hashable {
    let id: String
    var quoteNumber: Int?
    var year: Int?
    var storeNumber: String?
    var pointOfContact: String
    var description: String
    var amount: Double
    var dateSent: String?
    var po: String?
    var notes: String?
    /// "won" | "lost" | "open" (defaults to open when unset, like the web).
    var status: String
    var source: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case quoteNumber = "quote_number"
        case year
        case storeNumber = "store_number"
        case pointOfContact = "point_of_contact"
        case description
        case amount
        case dateSent = "date_sent"
        case po
        case notes
        case status
        case source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        quoteNumber = try? c.decode(Int.self, forKey: .quoteNumber)
        year = try? c.decode(Int.self, forKey: .year)
        storeNumber = try? c.decode(String.self, forKey: .storeNumber)
        pointOfContact = (try? c.decode(String.self, forKey: .pointOfContact)) ?? ""
        description = (try? c.decode(String.self, forKey: .description)) ?? "(no description)"
        amount = (try? c.decode(Double.self, forKey: .amount)) ?? 0
        dateSent = try? c.decode(String.self, forKey: .dateSent)
        po = try? c.decode(String.self, forKey: .po)
        notes = try? c.decode(String.self, forKey: .notes)
        status = (try? c.decode(String.self, forKey: .status)) ?? "open"
        source = try? c.decode(String.self, forKey: .source)
    }

    /// Display title used in lists: "<work> — <contact>", falling back to a number.
    var title: String {
        let parts = [description, pointOfContact].filter { !$0.isEmpty }
        return parts.isEmpty ? "Quote #\(quoteNumber.map(String.init) ?? "")" : parts.joined(separator: " — ")
    }

    var amountFormatted: String { Quote.currency.string(from: amount as NSNumber) ?? "$0" }

    static let currency: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.maximumFractionDigits = 0
        f.locale = Locale(identifier: "en_US")
        return f
    }()
}

#if DEBUG
extension Quote {
    init(id: String, pointOfContact: String, description: String, amount: Double,
         status: String, storeNumber: String? = nil, year: Int? = 2026) {
        self.id = id
        self.quoteNumber = Int(id) ?? 1
        self.year = year
        self.storeNumber = storeNumber
        self.pointOfContact = pointOfContact
        self.description = description
        self.amount = amount
        self.dateSent = nil
        self.po = nil
        self.notes = nil
        self.status = status
        self.source = "imported"
    }

    static let samples: [Quote] = [
        Quote(id: "1", pointOfContact: "Alex Edge", description: "Minor Remodel", amount: 48250, status: "open", storeNumber: "1042"),
        Quote(id: "2", pointOfContact: "Jeff Bindus", description: "Freezer", amount: 12750, status: "won", storeNumber: "0381"),
        Quote(id: "3", pointOfContact: "Cody Vantrease", description: "Top Stock", amount: 6900, status: "lost", storeNumber: "2210"),
    ]
}
#endif
