const html = `
<!DOCTYPE html>
<html>
<head></head>
<body>
<script>
function getDefaultDict(val = {}) {
  return {
    id: '',
    name: '',
    length: 0,
    ...val,
    words: val.words ?? [],
    articles: val.articles ?? [],
    statistics: val.statistics ?? [],
  }
}

function getDefaultBaseState() {
  return {
    simpleWords: ['a', 'an'],
    load: false,
    word: {
      studyIndex: -1,
      bookList: [
        getDefaultDict({ id: 'wordCollect', name: '收藏' }),
        getDefaultDict({ id: 'wordWrong', name: '错词' }),
        getDefaultDict({ id: 'wordKnown', name: '已掌握' }),
      ],
    },
    article: {
      studyIndex: -1,
      bookList: [
        getDefaultDict({ id: 'articleCollect', name: '收藏' })
      ],
    },
  }
}

function checkRiskKey(origin, target) {
  for (const [key, value] of Object.entries(origin)) {
    if (target[key] !== undefined) origin[key] = target[key]
  }
  return origin
}

function checkAndUpgradeSaveDict(val) {
  let defaultState = getDefaultBaseState()
  let data = typeof val === 'string' ? JSON.parse(val) : val
  let state = data.val
  
  if (data.version === 4) {
    checkRiskKey(defaultState, state)
    defaultState.article.bookList = defaultState.article.bookList.map(v => {
      return getDefaultDict(checkRiskKey(getDefaultDict(), v))
    })
    defaultState.word.bookList = defaultState.word.bookList.map(v => {
      return getDefaultDict(checkRiskKey(getDefaultDict(), v))
    })
    return defaultState
  }
  return defaultState
}

const userState = {
  version: 4,
  val: {
    word: {
      studyIndex: 3,
      bookList: [
        { id: 'wordCollect', name: '收藏', words: [] },
        { id: 'wordWrong', name: '错词', words: [] },
        { id: 'wordKnown', name: '已掌握', words: [] },
        { id: 55, name: '雅思听力场景词汇', words: [] }
      ]
    },
    article: {
      studyIndex: -1,
      bookList: [
        { id: 'articleCollect', name: '收藏', articles: [] }
      ]
    }
  }
}

const result = checkAndUpgradeSaveDict(userState)
document.write(JSON.stringify(result.word.bookList))
</script>
</body>
</html>
`;
require('fs').writeFileSync('d:\\kaifaxiangmu\\TypeWords\\apps\\nuxt\\public\\test.html', html);
