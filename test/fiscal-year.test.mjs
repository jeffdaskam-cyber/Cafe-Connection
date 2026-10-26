import assert from "node:assert/strict";
import test from "node:test";
import {
  currentFiscalYear,
  fiscalYearLabel,
  fiscalYearOptions,
} from "../src/utils/fiscalYear.js";
import {
  defaultFiscalYearFromFacts,
  deriveFiscalYearsFromFacts,
} from "../src/utils/fpaSelectors.js";

test("current fiscal year rolls over on October 1st", () => {
  assert.equal(currentFiscalYear(new Date(2026, 8, 30)), 2026); // Sep 30, 2026
  assert.equal(currentFiscalYear(new Date(2026, 9, 1)), 2027);  // Oct 1, 2026
  assert.equal(currentFiscalYear(new Date(2027, 0, 15)), 2027); // Jan 15, 2027
  assert.equal(fiscalYearLabel(2027), "FY27");
});

test("fiscal year options include the current FY before any data exists", () => {
  const oct = new Date(2026, 9, 26);
  assert.deepEqual(fiscalYearOptions([2025, 2026, 2025], oct), [2025, 2026, 2027]);
  assert.deepEqual(fiscalYearOptions([], oct), [2027]);
  // Current FY already present in the data — no duplicate.
  assert.deepEqual(fiscalYearOptions([2027, 2026], oct), [2026, 2027]);
});

test("FP&A selector offers and defaults to the new FY on October 1st", () => {
  const facts = [{ fiscalYear: 2025 }, { fiscalYear: 2026 }];
  const sep = new Date(2026, 8, 30);
  const oct = new Date(2026, 9, 1);
  assert.deepEqual(deriveFiscalYearsFromFacts(facts, sep), [2025, 2026]);
  assert.equal(defaultFiscalYearFromFacts(facts, sep), 2026);
  assert.deepEqual(deriveFiscalYearsFromFacts(facts, oct), [2025, 2026, 2027]);
  assert.equal(defaultFiscalYearFromFacts(facts, oct), 2027);
});
