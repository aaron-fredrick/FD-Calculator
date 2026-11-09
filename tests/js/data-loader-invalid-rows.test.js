import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFDOptions } from "../../src/io/data-loader.js";

test("CLI catalogue loader isolates invalid product rows and reports their source row", async () => {
  const root = await mkdtemp(join(tmpdir(), "fd-cal-invalid-catalogue-"));
  const indexPath = join(root, "fd_options.csv");
  const productsPath = join(root, "BANK_A.csv");
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(String(message));

  try {
    await mkdir(root, { recursive: true });
    await writeFile(indexPath,
      "bank_id,bank_key,options_file\nBANK_A,dfcc,BANK_A.csv\n");
    await writeFile(productsPath,
      "name,period,annual_rate,min_amount,payout_type,payout_period,eFD\n" +
      "Valid product,6m,8,10000,cumulative,,false\n" +
      "Invalid zero tenor,0m,8,10000,cumulative,,false\n");

    const options = await loadFDOptions(indexPath, ["BANK_A"]);
    assert.equal(options.length, 1);
    assert.equal(options[0].label, "Valid product");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /BANK_A\.csv/);
    assert.match(warnings[0], /row 3/);
    assert.match(warnings[0], /positive period/);
  } finally {
    console.warn = originalWarn;
    await rm(root, { recursive: true, force: true });
  }
});
