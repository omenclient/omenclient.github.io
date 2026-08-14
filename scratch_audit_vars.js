import fs from 'fs';

let script = fs.readFileSync('./game/latest.js', { encoding: 'utf8' }).trim();
if (script.startsWith('"use strict";    (function () {') && script.endsWith("})();"))
    script = script.slice('"use strict";    (function () {'.length, -"})();".length);

const stringArrayRaw = script.match(/var S=(\[.+?"\]);/)?.[1];
const stringArray = JSON.parse(stringArrayRaw);
script = script.replace(/\bS\[(\d+)\]/g, (_match, index) => `"${stringArray[index]}"`);

// Find where aE properties (like nr or hq or dy) are used in UI visibility
const nrMatches = [...script.matchAll(/aE\.nr/g)];
console.log("aE.nr matches count:", nrMatches.length);
nrMatches.forEach((m, i) => {
    const idx = m.index;
    console.log(`--- Match ${i} at ${idx} ---`);
    console.log(script.substring(Math.max(0, idx - 50), Math.min(script.length, idx + 100)));
});
