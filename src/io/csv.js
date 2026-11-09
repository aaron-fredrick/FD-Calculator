export function parseCSV(input, source = "CSV input") {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let state = "field";
  let line = 1;
  let rowStartLine = 1;

  const fail = message => {
    throw new SyntaxError(`${source}: ${message} (line ${line}).`);
  };
  const pushField = () => {
    row.push(field);
    field = "";
    state = "field";
  };
  const pushRow = () => {
    pushField();
    if (row.some(value => value !== "")) rows.push({ values: row, line: rowStartLine });
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (state === "quoted") {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        state = "after-quote";
      } else {
        field += character;
        if (character === "\n") line++;
      }
      continue;
    }

    if (state === "after-quote") {
      if (character === ",") {
        pushField();
      } else if (character === "\r" && text[i + 1] === "\n") {
        // Consume CRLF as one record separator on the next iteration.
      } else if (character === "\n") {
        pushRow();
        line++;
        rowStartLine = line;
      } else {
        fail(`Unexpected character ${JSON.stringify(character)} after a closing quote`);
      }
      continue;
    }

    if (character === '"') {
      if (field.length) fail("Quote inside an unquoted field");
      state = "quoted";
    } else if (character === ",") {
      pushField();
    } else if (character === "\r" && text[i + 1] === "\n") {
      // Ignore the CR; the LF closes the record.
    } else if (character === "\n") {
      pushRow();
      line++;
      rowStartLine = line;
    } else {
      field += character;
    }
  }

  if (state === "quoted") {
    fail(`Unterminated quoted field beginning on line ${rowStartLine}`);
  }
  if (field.length || row.length) pushRow();

  if (!rows.length) return [];

  const headerRecord = rows.shift();
  const headers = headerRecord.values.map(value => value.trim());
  if (new Set(headers).size !== headers.length || headers.some(value => !value)) {
    throw new SyntaxError(`${source}: CSV headers must be non-empty and unique (line ${headerRecord.line}).`);
  }

  return rows.map(({ values, line: rowLine }) => {
    if (values.length !== headers.length) {
      throw new SyntaxError(
        `${source}: row has ${values.length} fields; expected ${headers.length} (line ${rowLine}).`
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
