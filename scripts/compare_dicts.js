const fs = require('fs');

const typeWordsListPath1 = 'd:/kaifaxiangmu/TypeWords/apps/nuxt/public/list/word.json';
const typeWordsListPath2 = 'd:/kaifaxiangmu/TypeWords/apps/vscode-web/public/list/word.json';
const qwertyDictTsPath = 'd:/kaifaxiangmu/reference/qwerty-learner-master/src/resources/dictionary.ts';

const typeWordsDicts = JSON.parse(fs.readFileSync(typeWordsListPath1, 'utf8'));
const typeWordsDictUrls = new Set(typeWordsDicts.map(d => d.url));
const typeWordsDictIds = new Set(typeWordsDicts.map(d => d.id));

const dictTsContent = fs.readFileSync(qwertyDictTsPath, 'utf8');

// A simple regex to extract objects from dictionary.ts.
// It's a bit tricky because it's TypeScript. But we can extract id, name, description, category, tags, url, length.
const regex = /{[\s\S]*?id:\s*['"](.*?)['"],[\s\S]*?name:\s*['"](.*?)['"],[\s\S]*?description:\s*['"](.*?)['"],[\s\S]*?category:\s*['"](.*?)['"],[\s\S]*?tags:\s*\[(.*?)\],[\s\S]*?url:\s*['"]\/dicts\/(.*?)['"],[\s\S]*?length:\s*(\d+),[\s\S]*?}/g;

const qwertyDicts = [];
let match;
while ((match = regex.exec(dictTsContent)) !== null) {
  const tagsStr = match[5].replace(/['"]/g, '').trim();
  qwertyDicts.push({
    id: match[1],
    name: match[2],
    description: match[3],
    category: match[4],
    tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [],
    url: match[6],
    length: parseInt(match[7], 10),
    language: 'en', // default, can refine later
    translateLanguage: 'zh-CN' // default
  });
}

// Some dicts might be japanese, etc. Let's check languageCategory if possible
const regexLang = /{[\s\S]*?id:\s*['"](.*?)['"][\s\S]*?languageCategory:\s*['"](.*?)['"][\s\S]*?}/g;
const langMap = {};
while ((match = regexLang.exec(dictTsContent)) !== null) {
  langMap[match[1]] = match[2];
}
qwertyDicts.forEach(d => {
  if (langMap[d.id]) {
    d.language = langMap[d.id] === 'en' ? 'en' : (langMap[d.id] === 'ja' ? 'ja' : langMap[d.id]);
    if (d.language === 'ja') d.translateLanguage = 'zh-CN'; // Example
  }
});

const missingDicts = qwertyDicts.filter(d => !typeWordsDictUrls.has(d.url) && !typeWordsDictIds.has(d.id));

console.log(`TypeWords has ${typeWordsDicts.length} dicts.`);
console.log(`Qwerty has ${qwertyDicts.length} dicts.`);
console.log(`Missing dicts: ${missingDicts.length}`);

fs.writeFileSync('d:/kaifaxiangmu/TypeWords/missing_dicts.json', JSON.stringify(missingDicts, null, 2));
console.log('Wrote missing dicts to missing_dicts.json');

// Check missing files in public/dicts
const qwertyDictFiles = fs.readdirSync('d:/kaifaxiangmu/reference/qwerty-learner-master/public/dicts');
console.log(`Qwerty public/dicts has ${qwertyDictFiles.length} files.`);
