const fs=require("node:fs");const ts=require("typescript");const Module=require("node:module");
const js=ts.transpileModule(fs.readFileSync("src/lib/minute-formats.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module("minute-formats");mod._compile(js,"minute-formats.cjs");process.stdout.write(JSON.stringify(mod.exports.formats));
