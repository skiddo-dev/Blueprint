import XCTest
@testable import Blueprint

/// Decoding contract for `BoardTask` and friends. The design promise (see
/// BoardTask.swift) is DEFENSIVE decoding: only `_id` is required, every other
/// field falls back so one malformed/legacy document never blanks the board.
/// These tests pin that promise — if someone tightens a field to a hard
/// `decode`, a fixture here starts throwing and the regression is caught.
final class BoardTaskDecodingTests: XCTestCase {
    private func decodeTask(_ json: String) throws -> BoardTask {
        try JSONDecoder().decode(BoardTask.self, from: Data(json.utf8))
    }

    func testFullDocumentDecodesSnakeCaseFields() throws {
        let task = try decodeTask("""
        {
          "_id": "t1",
          "title": "Rooftop HVAC quote",
          "assigned_to": "Mike",
          "co_assignees": ["Riley"],
          "status": "In Progress",
          "created_by": "Bob",
          "date": "2026-06-15",
          "store_numbers": ["412"],
          "quote_status": "Sent",
          "rank": "a0m",
          "status_changed_at": "2026-06-10T12:00:00Z",
          "checklist": [{"id": "c1", "text": "Order curb adapter", "done": true}],
          "attachments": [{"id": "a1", "filename": "quote.pdf", "size": 2048, "content_type": "application/pdf"}]
        }
        """)
        XCTAssertEqual(task.id, "t1")
        XCTAssertEqual(task.assignedTo, "Mike")
        XCTAssertEqual(task.coAssignees, ["Riley"])
        XCTAssertEqual(task.status, .inProgress)
        XCTAssertEqual(task.createdBy, "Bob")
        XCTAssertEqual(task.storeNumbers, ["412"])
        XCTAssertEqual(task.quoteStatusLabel, "Sent")
        XCTAssertEqual(task.checklistDone, 1)
        XCTAssertEqual(task.attachmentList.map(\.filename), ["quote.pdf"])
    }

    func testMinimalDocumentFallsBackEverywhere() throws {
        let task = try decodeTask(#"{"_id": "bare"}"#)
        XCTAssertEqual(task.id, "bare")
        XCTAssertEqual(task.title, "(untitled)")
        XCTAssertEqual(task.status, .toDo)
        XCTAssertEqual(task.assignedTo, "")
        XCTAssertTrue(task.timeline.isEmpty)
        XCTAssertTrue(task.checklist.isEmpty)
        XCTAssertEqual(task.sourceName, "Manual")
        XCTAssertEqual(task.quoteStatusLabel, "Draft")
        XCTAssertFalse(task.isOverdue)
    }

    func testMalformedFieldsFallBackInsteadOfThrowing() throws {
        // Wrong types everywhere except _id — decoding must survive all of it.
        let task = try decodeTask("""
        {
          "_id": "mangled",
          "title": 42,
          "status": "Not A Real Status",
          "co_assignees": "not-an-array",
          "checklist": [{"id": "ok", "text": "fine"}, "junk"],
          "attachments": 7
        }
        """)
        XCTAssertEqual(task.title, "(untitled)")
        XCTAssertEqual(task.status, .toDo, "unknown status string must fall back, not throw")
        XCTAssertEqual(task.coAssignees, [])
        XCTAssertTrue(task.checklist.isEmpty, "one junk element drops the list, never crashes")
        XCTAssertTrue(task.attachments.isEmpty)
    }

    func testMissingIdIsTheOneHardFailure() {
        XCTAssertThrowsError(try decodeTask(#"{"title": "no id"}"#))
    }

    func testAttachmentDefaultsFilenameToIdAndFormatsSize() throws {
        let att = try JSONDecoder().decode(Attachment.self, from: Data(#"{"id": "a9"}"#.utf8))
        XCTAssertEqual(att.filename, "a9")
        XCTAssertEqual(att.sizeLabel, "", "unknown size renders as empty, not '0 B'")
        XCTAssertEqual(Attachment(id: "x", filename: "x", size: 512).sizeLabel, "512 B")
        XCTAssertEqual(Attachment(id: "x", filename: "x", size: 12_288).sizeLabel, "12 KB")
        XCTAssertEqual(Attachment(id: "x", filename: "x", size: 1_468_006).sizeLabel, "1.4 MB")
    }
}
