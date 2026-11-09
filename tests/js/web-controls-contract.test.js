import test from "node:test";
import { escapeHtml } from "../../src/web/escape-html.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../src/web/app.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/web/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/web/styles.css", import.meta.url), "utf8");

test("consolidation uses one account-card radio selector with selected-card styling", () => {
  assert.match(app, /name="primary"/);
  assert.match(app, /is-consolidation/);
  assert.match(styles, /\.account\.is-consolidation/);
  assert.doesNotMatch(page, /id="consolidation-account"/);
  assert.doesNotMatch(app, /\$\("consolidation-account"\)/);
});

test("specific-date cash flows use a bounded date picker and removable entries", () => {
  assert.match(app, /data-date-entry type="date"/);
  assert.match(app, /min=.*start-date.*max=.*effectiveEndDate/);
  assert.match(app, /data-add-date/);
  assert.match(app, /data-remove-date/);
  assert.match(app, /Add one or more dates with the date picker/);
  assert.match(app, /value<start\|\|value>end/);
  assert.match(app, /String\(x\.dates\)\.split\(","\)/);
  assert.match(styles, /\.date-chip-list/);
});

test("browser search defaults are finite and unlimited modes are explicit", () => {
  assert.match(page, /id="decision-cap"[^>]*value="10000"/);
  assert.match(page, /id="time-limit-seconds"[^>]*value="30"/);
  assert.match(page, /id="unlimited-decision-cap"/);
  assert.match(page, /id="cancel-run"/);
  assert.match(app, /time_limit_ms:Number\(\$\("time-limit-seconds"\)\.value\)\*1000/);
});

test("HTML output encoding protects imported account IDs without changing their data value", () => {
  const payload = "\"><img src=x onerror=alert(1)>&'";
  assert.equal(
    escapeHtml(payload),
    "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;"
  );
  assert.match(app, /data-id=\"'\+esc\(a\.id\)\+'/);
  assert.match(app, /value=\"'\+esc\(a\.id\)\+'/);
  assert.match(app, /data-remove-account=\"'\+esc\(a\.id\)\+'/);
});

test("selected bank cards disclose catalogue source status and review date", () => {
  assert.match(app, /function bankDisclosure\(bankId\)/);
  assert.match(app, /dataset_reviewed_at\|\|"Review date not recorded"/);
  assert.match(app, /data-bank-source/);
  assert.match(app, /c\.bank_dataset_registry=S\.index/);
  assert.match(page, /Secondary sources and missing review dates may be stale/);
});


test("unlimited expanded states uses a compact checkbox control", () => {
  assert.match(page, /<label class="toggle"><input id="unlimited-decision-cap" type="checkbox"><span>Unlimited expanded states<\/span><\/label>/);
  assert.match(styles, /#strategy label\.toggle\s*\{[^}]*display:flex/s);
  assert.match(styles, /#strategy label\.toggle input\[type="checkbox"\]\s*\{[^}]*width:16px/s);
  assert.match(styles, /#strategy label\.toggle input\[type="checkbox"\]\s*\{[^}]*min-height:0/s);
});


test("inline validation errors are programmatically associated and cleaned up safely", () => {
  assert.match(app, /note\.id="field-error-"\+\(\+\+fieldErrorSequence\)/);
  assert.match(app, /el\.setAttribute\("aria-describedby",describedBy\.join\(" "\)\)/);
  assert.match(app, /const noteIds=new Set\(notes\.map\(note=>note\.id\)\.filter\(Boolean\)\)/);
  assert.match(app, /filter\(id=>id&&!noteIds\.has\(id\)\)/);
  assert.match(app, /el\.removeAttribute\("aria-describedby"\)/);
});


test("help tips expose accessible names and support pointer, keyboard and touch disclosure", () => {
  assert.match(page, /<button class="help-tip" type="button" aria-label="Help:/);
  assert.match(app, /<button class="help-tip" type="button" aria-label="Help:/);
  assert.doesNotMatch(page, /class="help-tip"[^>]*role="img"/);
  assert.match(app, /document\.addEventListener\("click",event=>/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /event\.key!=="Escape"/);
  assert.match(styles, /\.help-tip\[aria-expanded="true"\]::after/);
});


test("users can delete the browser-local draft without the form click handler recreating it", () => {
  assert.match(page, /id="clear-draft"/);
  assert.match(page, /id="draft-storage-status"/);
  assert.match(page, /until you clear it/);
  assert.match(app, /function clearSavedDraft\(event\)/);
  assert.match(app, /event\.stopPropagation\(\)/);
  assert.match(app, /window\.confirm\(/);
  assert.match(app, /localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(app, /addEventListener\("click",clearSavedDraft\)/);
});
