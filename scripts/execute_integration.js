const fs = require('fs');
const path = require('path');

const typeWordsListPath1 = 'd:/kaifaxiangmu/TypeWords/apps/nuxt/public/list/word.json';
const typeWordsListPath2 = 'd:/kaifaxiangmu/TypeWords/apps/vscode-web/public/list/word.json';
const qwertyDictTsPath = 'd:/kaifaxiangmu/reference/qwerty-learner-master/src/resources/dictionary.ts';
const sourceDictsDir = 'd:/kaifaxiangmu/reference/qwerty-learner-master/public/dicts';
const targetUploadDir = 'd:/kaifaxiangmu/TypeWords/to_upload_dicts';

const typeWordsDicts1 = JSON.parse(fs.readFileSync(typeWordsListPath1, 'utf8'));
const typeWordsDicts2 = JSON.parse(fs.readFileSync(typeWordsListPath2, 'utf8'));

// To find missing, we check url or id
const typeWordsDictUrls = new Set(typeWordsDicts1.map(d => d.url));
const typeWordsDictIds = new Set(typeWordsDicts1.map(d => d.id));

const dictTsContent = fs.readFileSync(qwertyDictTsPath, 'utf8');

const regex = /{[\s\S]*?id:\s*['"](.*?)['"],[\s\S]*?name:\s*['"](.*?)['"],[\s\S]*?description:\s*['"](.*?)['"],[\s\S]*?category:\s*['"](.*?)['"],[\s\S]*?tags:\s*\[(.*?)\],[\s\S]*?url:\s*['"]\/dicts\/(.*?)['"],[\s\S]*?length:\s*(\d+)[\s\S]*?}/g;

const qwertyDicts = [];
let match;
while ((match = regex.exec(dictTsContent)) !== null) {
  let tagsStr = match[5].replace(/['"]/g, '').trim();
  let tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
  
  qwertyDicts.push({
    id: match[1],
    name: match[2],
    description: match[3],
    category: match[4],
    tags: tags,
    url: match[6],
    length: parseInt(match[7], 10),
    language: 'en', // default, to be refined
    translateLanguage: 'zh-CN' // default
  });
}

const regexLang = /{[\s\S]*?id:\s*['"](.*?)['"][\s\S]*?languageCategory:\s*['"](.*?)['"][\s\S]*?}/g;
const langMap = {};
while ((match = regexLang.exec(dictTsContent)) !== null) {
  langMap[match[1]] = match[2];
}

qwertyDicts.forEach(d => {
  if (langMap[d.id]) {
    d.language = langMap[d.id];
  } else {
    // If we can't find languageCategory, we might infer from category
    if (d.category === '日语练习') d.language = 'ja';
    else if (d.category === '德语练习') d.language = 'de';
    else if (d.category === '印尼语练习') d.language = 'id';
  }
});

const missingDicts = qwertyDicts.filter(d => !typeWordsDictUrls.has(d.url) && !typeWordsDictIds.has(d.id));

console.log(`Found ${missingDicts.length} missing dicts.`);

// Add to TypeWords word.json
missingDicts.forEach(d => {
  // We need to keep only the properties expected by TypeWords:
  // id, name, description, category, tags, url, length, language, translateLanguage
  typeWordsDicts1.push(d);
  typeWordsDicts2.push(d);
});

fs.writeFileSync(typeWordsListPath1, JSON.stringify(typeWordsDicts1, null, 2));
fs.writeFileSync(typeWordsListPath2, JSON.stringify(typeWordsDicts2, null, 2));
console.log('Updated word.json files.');

// Copy actual files to targetUploadDir
if (!fs.existsSync(targetUploadDir)) {
  fs.mkdirSync(targetUploadDir, { recursive: true });
}

let copyCount = 0;
missingDicts.forEach(d => {
  const sourcePath = path.join(sourceDictsDir, d.url);
  
  // d.url is typically something like "XXX_T.json"
  // The structure on OSS should be dicts/{language}/word/{url}
  // But wait, the user just needs to upload them under the correct structure.
  // We will structure them under to_upload_dicts/{language}/word/{url}
  const destDir = path.join(targetUploadDir, d.language, 'word');
  const destPath = path.join(destDir, d.url);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    copyCount++;
  } else {
    console.warn('Source file not found:', sourcePath);
  }
});

console.log(`Copied ${copyCount} dictionary files to ${targetUploadDir}`);
