import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import test from "node:test";
import { parseCSV } from "../../src/io/csv.js";

const dataRoot = fileURLToPath(new URL("../../data/", import.meta.url));

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

test("strict CSV parser supports BOM, CRLF, quoted commas, escaped quotes and multiline fields", () => {
  const csv = '\uFEFFname,notes,empty\r\n"Alpha, Ltd.","Said ""hello""\r\ncontinued",\r\n';
  assert.deepEqual(parseCSV(csv, "fixture.csv"), [{
    name: "Alpha, Ltd.",
    notes: 'Said "hello"\r\ncontinued',
    empty: ""
  }]);
});

test("strict CSV parser ignores blank lines but preserves explicit empty cells", () => {
  assert.deepEqual(parseCSV("a,b\n\nvalue,\n,\n"), [
    { a: "value", b: "" }
  ]);
});

test("strict CSV parser rejects malformed quote placement and unterminated fields with line context", () => {
  assert.throws(() => parseCSV('a,b\nx"y,z', "bad.csv"), /bad\.csv: Quote inside an unquoted field \(line 2\)/);
  assert.throws(() => parseCSV('a,b\n"x"y,z', "bad.csv"), /Unexpected character "y" after a closing quote \(line 2\)/);
  assert.throws(() => parseCSV('a,b\n"unterminated', "bad.csv"), /Unterminated quoted field beginning on line 2/);
  assert.throws(() => parseCSV('a,b\n"x" ,z', "bad.csv"), /after a closing quote/);
});

test("strict CSV parser rejects short and surplus rows with source and line context", () => {
  assert.throws(() => parseCSV("a,b\n1\n", "short.csv"), /short\.csv: row has 1 fields; expected 2 \(line 2\)/);
  assert.throws(() => parseCSV("a,b\n1,2,3", "long.csv"), /long\.csv: row has 3 fields; expected 2 \(line 2\)/);
});

test("strict CSV parser rejects empty or duplicate headers", () => {
  assert.throws(() => parseCSV(",b\n1,2", "headers.csv"), /headers must be non-empty and unique/);
  assert.throws(() => parseCSV("a,a\n1,2", "headers.csv"), /headers must be non-empty and unique/);
});

test("every checked-in catalogue CSV has consistent rows and valid quoting", () => {
  const files = listFiles(dataRoot).filter(path => path.endsWith(".csv")).sort();
  assert.ok(files.length >= 30, "expected the full bank/catalogue CSV inventory");
  for (const path of files) {
    assert.doesNotThrow(
      () => parseCSV(readFileSync(path, "utf8"), relative(dataRoot, path)),
      relative(dataRoot, path)
    );
  }
});

test("comma-containing source metadata remains in the correct bank and product fields", () => {
  const banks = parseCSV(readFileSync(join(dataRoot, "banks/banks.csv"), "utf8"), "banks.csv");
  const amana = banks.find(row => row.id === "LK_AMANA_BANK");
  assert.match(amana.fee_basis, /Assumed 0 for routine digital intra-bank transfers/);
  assert.match(amana.fee_source_url, /^https:\/\//);

  const commercial = parseCSV(
    readFileSync(join(dataRoot, "fd_options/banks/LK_COMMERCIAL_BANK_OF_CEYLON.csv"), "utf8"),
    "commercial-bank.csv"
  );
  assert.match(commercial[0].notes, /Effective date not displayed/);
  assert.match(commercial[0].notes, /https:\/\/www\.combank\.lk\/downloads/);

  const dfcc = parseCSV(
    readFileSync(join(dataRoot, "fd_options/banks/LK_DFCC_BANK.csv"), "utf8"),
    "dfcc.csv"
  );
  assert.match(dfcc[1].notes, /as confirmed by the user/);
  assert.match(dfcc[1].notes, /AER excluded/);
});
