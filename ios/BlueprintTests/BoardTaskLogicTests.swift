import XCTest
@testable import Blueprint

/// Card-face derivations on `BoardTask` — each one mirrors a rule in
/// `TaskCard.svelte` / `$lib/aging`, so a behavior change on the web that
/// isn't ported shows up as a failure here (same idea as the parity rows the
/// generated config covers, but for logic the generator can't express).
final class BoardTaskLogicTests: XCTestCase {
    private func iso(daysAgo: Int) -> String {
        ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: -Double(daysAgo) * 86_400))
    }

    // MARK: isOverdue — past date on a still-open card only

    func testOverdueRequiresPastDateAndOpenStatus() {
        XCTAssertTrue(BoardTask(id: "t", title: "t", date: "2000-01-01", status: .toDo).isOverdue)
        XCTAssertFalse(BoardTask(id: "t", title: "t", date: "2000-01-01", status: .done).isOverdue)
        XCTAssertFalse(BoardTask(id: "t", title: "t", date: "2000-01-01", status: .cancelled).isOverdue)
        XCTAssertFalse(BoardTask(id: "t", title: "t", date: "2999-12-31", status: .toDo).isOverdue)
        XCTAssertFalse(BoardTask(id: "t", title: "t", status: .toDo).isOverdue)
    }

    // MARK: sourceName — email sender chain, then creator, then "Manual"

    func testSourceNamePrefersSenderNameThenEmailThenLiteralEmail() {
        XCTAssertEqual(BoardTask(id: "t", title: "t", status: .toDo,
                                 exchangeId: "ex1", senderName: "Alex Edge", senderEmail: "a@x.com").sourceName,
                       "Alex Edge")
        XCTAssertEqual(BoardTask(id: "t", title: "t", status: .toDo,
                                 exchangeId: "ex1", senderEmail: "a@x.com").sourceName,
                       "a@x.com")
        XCTAssertEqual(BoardTask(id: "t", title: "t", status: .toDo, exchangeId: "ex1").sourceName,
                       "Email")
    }

    func testSourceNameForManualCards() {
        XCTAssertEqual(BoardTask(id: "t", title: "t", status: .toDo, createdBy: "Bob").sourceName, "Bob")
        XCTAssertEqual(BoardTask(id: "t", title: "t", status: .toDo, createdBy: "").sourceName, "Manual")
    }

    // MARK: attachments — metadata list preferred, legacy ids as fallback

    func testAttachmentListFallsBackToLegacyIds() {
        let withMeta = BoardTask(id: "t", title: "t", status: .toDo,
                                 attachmentIds: ["legacy1"],
                                 attachments: [Attachment(id: "a1", filename: "site-plan.pdf")])
        XCTAssertEqual(withMeta.attachmentList.map(\.filename), ["site-plan.pdf"])

        let legacyOnly = BoardTask(id: "t", title: "t", status: .toDo, attachmentIds: ["legacy1"])
        XCTAssertEqual(legacyOnly.attachmentList.map(\.filename), ["legacy1"])
    }

    // MARK: aging — only active columns age, thresholds from generated config

    func testFinishedAndParkedColumnsNeverAge() {
        for status: TaskStatus in [.done, .cancelled, .onHold] {
            let task = BoardTask(id: "t", title: "t", status: status,
                                 statusChangedAt: iso(daysAgo: 99))
            XCTAssertEqual(task.aging, .none, "\(status.rawValue) must not age")
        }
    }

    func testActiveColumnAgesThroughWarnToAlert() {
        func aging(daysAgo: Int) -> BoardTask.AgingLevel {
            BoardTask(id: "t", title: "t", status: .inProgress,
                      statusChangedAt: iso(daysAgo: daysAgo)).aging
        }
        XCTAssertEqual(aging(daysAgo: 0), .none)
        XCTAssertEqual(aging(daysAgo: BlueprintConfig.agingWarnDays + 1), .warn)
        XCTAssertEqual(aging(daysAgo: BlueprintConfig.agingAlertDays + 1), .alert)
    }

    func testDaysInColumnHandlesBothIsoFlavors() {
        // The backend emits both fractional and whole-second timestamps; the
        // parser must accept each (and garbage falls back to 0, never crashes).
        let frac = BoardTask(id: "t", title: "t", status: .toDo,
                             statusChangedAt: "2026-06-01T00:00:00.000Z")
        XCTAssertGreaterThan(frac.daysInColumn, 0)
        let whole = BoardTask(id: "t", title: "t", status: .toDo,
                              statusChangedAt: "2026-06-01T00:00:00Z")
        XCTAssertGreaterThan(whole.daysInColumn, 0)
        let junk = BoardTask(id: "t", title: "t", status: .toDo, statusChangedAt: "not-a-date")
        XCTAssertEqual(junk.daysInColumn, 0)
    }

    // MARK: generated-config drift guards

    func testEveryStatusHasGeneratedMetaInBoardOrder() {
        // The enum and the generated table come from different pipelines
        // (hand-written Swift vs `npm run gen:ios`); this pins them together.
        XCTAssertEqual(BlueprintConfig.taskStatuses, TaskStatus.allCases.map(\.rawValue))
        for status in TaskStatus.allCases {
            XCTAssertNotNil(BlueprintConfig.statusMeta[status.rawValue],
                            "\(status.rawValue) is missing from BlueprintConfig.statusMeta")
        }
        XCTAssertGreaterThan(BlueprintConfig.agingAlertDays, BlueprintConfig.agingWarnDays)
    }
}
