export function parseCSV(input) {
 const text=String(input??"").replace(/^\uFEFF/,""); const rows=[]; let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.length)quoted=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field.replace(/\r$/,""));if(row.some(v=>v!==""))rows.push(row);row=[];field="";}else field+=c;}
 if(quoted)throw new SyntaxError("CSV contains an unterminated quoted field.");if(field.length||row.length){row.push(field.replace(/\r$/,""));if(row.some(v=>v!==""))rows.push(row);}
 if(!rows.length)return [];const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length||headers.some(x=>!x))throw new SyntaxError("CSV headers must be non-empty and unique.");
 return rows.map((values,index)=>{return Object.fromEntries(headers.map((key,i)=>[key,values[i]??""]));});
}
