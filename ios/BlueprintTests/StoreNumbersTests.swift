import XCTest
@testable import Blueprint

/// Parity suite for `StoreNumbers.extract` — the Swift port of
/// `src/lib/storeNumbers.ts`. Every case here mirrors one in
/// `src/lib/storeNumbers.test.ts`; if the web rules change, `npm run gen:ios`
/// won't catch it (the port is hand-written), but this suite + the web suite
/// failing together will.
final class StoreNumbersTests: XCTestCase {
    func testEmptyInputReturnsEmpty() {
        XCTAssertEqual(StoreNumbers.extract(from: ""), [])
    }

    func testExplicitDStoreFormsCaseInsensitive() {
        XCTAssertEqual(StoreNumbers.extract(from: "D-412"), ["412"])
        XCTAssertEqual(StoreNumbers.extract(from: "D 412"), ["412"])
        XCTAssertEqual(StoreNumbers.extract(from: "D412"), ["412"])
        XCTAssertEqual(StoreNumbers.extract(from: "d412"), ["412"])
    }

    func testBareThreeDigitNumberInTitle() {
        XCTAssertEqual(StoreNumbers.extract(from: "Store 412 remodel"), ["412"])
    }

    func testDeduplicatesAndSorts() {
        XCTAssertEqual(StoreNumbers.extract(from: "D-412 and store 412"), ["412"])
        XCTAssertEqual(StoreNumbers.extract(from: "D412, D-118, store 305"), ["118", "305", "412"])
    }

    func testIgnoresMoneyAndLongerNumbers() {
        XCTAssertEqual(StoreNumbers.extract(from: "$412"), [])
        XCTAssertEqual(StoreNumbers.extract(from: "1,412"), [])
        XCTAssertEqual(StoreNumbers.extract(from: "41234"), [])
        XCTAssertEqual(StoreNumbers.extract(from: "Quote is $12,300"), [])
    }

    func testExplicitDStoreStillWinsNextToMoney() {
        XCTAssertEqual(StoreNumbers.extract(from: "D-412 quote $12,300"), ["412"])
    }
}
