import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FDOption } from "../core/models.js";
import { parseCSV } from "./csv.js";
import { validateConfigurationShape } from "../core/config-schema.js";
import { normalizeBankDatasetMetadata } from "./dataset-metadata.js";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const read=path=>readFile(path,"utf8");
const parseBool=(v,field)=>{const s=String(v??"").trim().toLowerCase();if(s==="true")return true;if(s==="false")return false;throw new TypeError(field+" must be true or false.");};
export async function loadBankCatalogue(path=join(ROOT,"data/banks/banks.csv")){const rows=parseCSV(await read(path),path);const registry={};for(const row of rows){const id=String(row.id??"").trim();if(!id)continue;if(registry[id])throw new Error("Duplicate bank ID: "+id);registry[id]=row;}if(!Object.keys(registry).length)throw new Error("Bank catalogue is empty: "+path);return registry;}
export async function loadFDOptions(indexPath, bankIds) {
  const indexFile = resolve(indexPath);
  const rows = parseCSV(await read(indexFile), indexFile);
  const index = Object.fromEntries(rows.map(row => [String(row.bank_id).trim(), row]));
  const out = [];

  for (const bankId of [...new Set(bankIds)].sort()) {
    const entry = index[bankId];
    if (!entry) throw new Error("No FD-options index entry for bank " + bankId);
    const file = resolve(dirname(indexFile), entry.options_file);
    const products = parseCSV(await read(file), file);
    const key = String(entry.bank_key).trim().toLowerCase();
    const fallback = ({ commercial: 25000, dfcc: 10000 })[key] ?? 25000;
    let accepted = 0;
    const rejected = [];

    for (let rowIndex = 0; rowIndex < products.length; rowIndex++) {
      const row = products[rowIndex];
      const label = String(row.name ?? "").trim();
      const min = String(row.min_amount ?? "").trim() ? Number(row.min_amount) : fallback;
      const rate = Number(row.annual_rate);
      try {
        if (!label || !Number.isFinite(min) || min < 0 || !Number.isFinite(rate)) {
          throw new TypeError("missing label or invalid minimum/rate");
        }
        out.push(new FDOption({
          label, period_str: row.period, annual_rate: rate, min_amount: min,
          payout_type: row.payout_type || "cumulative", payout_period_str: row.payout_period || "",
          bank_key: key, bank_id: bankId,
          is_efd: parseBool(row.eFD === "" || row.eFD == null ? "false" : row.eFD, "eFD flag for " + label),
          customer_segment: row.customer_segment || "general",
          min_age: row.min_age ?? null, max_age: row.max_age ?? null,
          min_age_inclusive: row.min_age_inclusive === "" || row.min_age_inclusive == null ? true : parseBool(row.min_age_inclusive, "min_age_inclusive for " + label),
          max_age_inclusive: row.max_age_inclusive === "" || row.max_age_inclusive == null ? true : parseBool(row.max_age_inclusive, "max_age_inclusive for " + label),
          guardian_required: row.guardian_required === "" || row.guardian_required == null ? null : parseBool(row.guardian_required, "guardian_required for " + label),
          source_url: row.source_url || "", source_effective_date: row.source_effective_date || "",
          source_type: row.source_type || "", source_notes: row.notes || ""
        }));
        accepted++;
      } catch (error) {
        rejected.push("row " + (rowIndex + 2) + " (" + (label || "unnamed") + "): " + error.message);
      }
    }

    if (rejected.length) {
      console.warn("[FD Cal] Rejected invalid FD catalogue rows in " + file + ":\n" + rejected.join("\n"));
    }
    if (!products.length || accepted === 0) {
      throw new Error("Bank " + bankId + " has no valid FD products in " + file +
        (rejected.length ? ". Rejections: " + rejected.join("; ") : "."));
    }
  }
  return out;
}
export async function loadConfigurationFromFile(configPath,{today}={}){const resolvedConfig=resolve(configPath),raw=validateConfigurationShape(JSON.parse(await read(resolvedConfig))),banks=await loadBankCatalogue(),setting=raw.options_file||"data/fd_options/fd_options.csv";let indexPath=isAbsolute(setting)?setting:resolve(dirname(resolvedConfig),setting);try{await read(indexPath);}catch{indexPath=resolve(ROOT,setting);}const indexRows=parseCSV(await read(indexPath)),bankKeyById=Object.fromEntries(indexRows.map(r=>[r.bank_id,String(r.bank_key).trim().toLowerCase()])),bankIds=[...new Set(Object.values(raw.accounts||{}).map(a=>String(a.bank_id??"").trim()))],options=await loadFDOptions(indexPath,bankIds);const bankDatasetRegistry = Object.fromEntries(indexRows.map(row => [row.bank_id, { ...row, ...normalizeBankDatasetMetadata(row) }]));return {raw,resolvedConfig,optionsPath:indexPath,bankRegistry:banks,bankKeyById,bankDatasetRegistry,options};}
