<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBaseStore } from '../stores/base'

const store = useBaseStore()

// Native Date Helpers to replace dayjs
const formatDate = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const addDays = (d: Date, days: number) => {
  const nd = new Date(d.getTime())
  nd.setDate(nd.getDate() + days)
  return nd
}
const getMonthShortName = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[d.getMonth()]
}

// 1. 抽取和聚合历史数据
const aggregatedData = computed(() => {
  // @ts-ignore
  const allWordStats = store.word.bookList.flatMap(b => b.statistics ?? [])
  // @ts-ignore
  const allArticleStats = store.article.bookList.flatMap(b => b.statistics ?? [])
  const allStats = [...allWordStats, ...allArticleStats]

  const dayMap = new Map<string, { totalSpend: number; totalWords: number }>()

  for (const s of allStats) {
    if (!s.startDate || !s.spend) continue
    const dateStr = formatDate(new Date(s.startDate))
    
    let spendMs = s.spend
    let words = s.total || 0
    let typedWords = s.inputWordNumber || words // 新版使用实际按键输入的单词数计算打字速度
    
    // 如果有 segment 数据，精确到分片（可选处理，为了简单这里直接按 startDate 归类整条记录）
    if (s.segments && s.segments.length > 0) {
      for (const [segStart, segEnd] of s.segments) {
         const segDateStr = formatDate(new Date(segStart))
         const ms = segEnd - segStart
         const prev = dayMap.get(segDateStr) || { totalSpend: 0, totalWords: 0, totalTyped: 0 }
         dayMap.set(segDateStr, {
           totalSpend: prev.totalSpend + ms,
           totalWords: prev.totalWords + (segDateStr === dateStr ? words : 0),
           totalTyped: prev.totalTyped + (segDateStr === dateStr ? typedWords : 0)
         })
         if (segDateStr === dateStr) { words = 0; typedWords = 0 } // 避免重复计算
      }
    } else {
      const prev = dayMap.get(dateStr) || { totalSpend: 0, totalWords: 0, totalTyped: 0 }
      dayMap.set(dateStr, {
        totalSpend: prev.totalSpend + spendMs,
        totalWords: prev.totalWords + words,
        totalTyped: (prev.totalTyped || 0) + typedWords
      })
    }
  }

  // 计算每条的 WPM
  const result: { date: string; wpm: number; words: number; spendMin: number }[] = []
  dayMap.forEach((val, date) => {
    const spendMin = val.totalSpend / 1000 / 60
    const wpm = spendMin > 0 ? Math.round(val.totalTyped / spendMin) : 0
    result.push({ date, wpm, words: val.totalWords, spendMin })
  })

  // 按日期排序
  result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return result
})

// 时间选择维度
type TimeRange = '30d' | '180d' | '365d' | 'all'
const selectedRange = ref<TimeRange>('30d')

// 根据选择的时间维度过滤数据
const filteredData = computed(() => {
  const data = aggregatedData.value
  if (!data.length || selectedRange.value === 'all') return data

  let daysLimit = 30
  if (selectedRange.value === '180d') daysLimit = 180
  if (selectedRange.value === '365d') daysLimit = 365

  const cutoffDate = addDays(new Date(), -daysLimit).getTime()
  return data.filter(d => new Date(d.date).getTime() > cutoffDate)
})

// 生成热力图的网格数据 (计算 startDate 和 endDate，补齐空白前导格子)
const heatmapGrid = computed(() => {
  const data = filteredData.value
  let startDate = new Date()
  let endDate = new Date()

  if (selectedRange.value === 'all') {
    if (data.length) {
      startDate = new Date(data[0].date)
    } else {
      startDate = addDays(new Date(), -30)
    }
  } else {
    let daysLimit = 30
    if (selectedRange.value === '180d') daysLimit = 180
    if (selectedRange.value === '365d') daysLimit = 365
    startDate = addDays(new Date(), -daysLimit)
  }

  // 使得开头对齐星期一 (1)
  while (startDate.getDay() !== 1) {
    startDate = addDays(startDate, -1)
  }
  // 使得结尾对齐星期日 (0)
  while (endDate.getDay() !== 0) {
    endDate = addDays(endDate, 1)
  }

  const map = new Map<string, number>()
  data.forEach(d => map.set(d.date, d.words))

  const grid: { date: string; words: number; level: number }[] = []
  let curr = startDate
  while (curr.getTime() < endDate.getTime() || formatDate(curr) === formatDate(endDate)) {
    const ds = formatDate(curr)
    const words = map.get(ds) || 0
    let level = 0
    if (words > 0 && words <= 50) level = 1
    else if (words > 50 && words <= 150) level = 2
    else if (words > 150 && words <= 300) level = 3
    else if (words > 300) level = 4

    grid.push({ date: ds, words, level })
    curr = addDays(curr, 1)
  }

  // 将一维数组转换为按列(周)排列的二维数组
  const cols = [] as any[]
  for (let i = 0; i < grid.length; i += 7) {
    cols.push(grid.slice(i, i + 7))
  }
  return cols
})

// 获取日期的月份名称(仅为了在顶部显示刻度)
const getMonthLabels = (cols: any[]) => {
  const labels: { text: string; colIndex: number }[] = []
  let lastMonth = -1
  cols.forEach((col, index) => {
    const firstDay = new Date(col[0].date)
    if (firstDay.getDate() <= 7 && firstDay.getMonth() !== lastMonth) {
      labels.push({ text: getMonthShortName(firstDay), colIndex: index })
      lastMonth = firstDay.getMonth()
    }
  })
  return labels
}

// 曲线图数据
const maxWpm = computed(() => {
  let m = 0
  filteredData.value.forEach(d => {
    if (d.wpm > m) m = d.wpm
  })
  // 动态调整最高刻度，不再写死 100
  // 给曲线留出一点顶部空间 (20%)，如果全为 0，则默认刻度为 10
  return m === 0 ? 10 : Math.round(m * 1.2)
})

// 计算 SVG Path，将 WPM 映射到坐标系
const svgPath = computed(() => {
  const points = filteredData.value
  if (points.length === 0) return ''

  const width = 1000
  const height = 150
  
  // X 轴步长
  const stepX = points.length > 1 ? width / (points.length - 1) : width
  
  let path = `M 0 ${height - (points[0].wpm / maxWpm.value) * height}`
  
  for (let i = 1; i < points.length; i++) {
    const x = i * stepX
    const y = height - (points[i].wpm / maxWpm.value) * height
    // 使用贝塞尔曲线平滑连接
    const prevX = (i - 1) * stepX
    const prevY = height - (points[i - 1].wpm / maxWpm.value) * height
    const cx1 = prevX + (x - prevX) / 2
    const cy1 = prevY
    const cx2 = prevX + (x - prevX) / 2
    const cy2 = y
    path += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x} ${y}`
  }
  return path
})
</script>

<template>
  <div class="gamification-card">
    <div class="header">
      <h3 class="title">
        <span class="bg-gradient-to-r from-[#bd34fe] to-[#41d1ff] bg-clip-text text-transparent [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]">学习统计</span>
        <span class="text-[var(--hw-text-3)] font-normal mx-2">·</span>
        <span class="text-[var(--hw-text-2)] font-medium">数据看板</span>
      </h3>
      <div class="range-selector">
        <button :class="{ active: selectedRange === '30d' }" @click="selectedRange = '30d'">近 30 天</button>
        <button :class="{ active: selectedRange === '180d' }" @click="selectedRange = '180d'">近半年</button>
        <button :class="{ active: selectedRange === '365d' }" @click="selectedRange = '365d'">近一年</button>
        <button :class="{ active: selectedRange === 'all' }" @click="selectedRange = 'all'">全部</button>
      </div>
    </div>

    <div class="stats-overview">
      <div class="stat-item">
        <span class="label">累计练习天数</span>
        <span class="value">{{ aggregatedData.length }} <span class="unit">天</span></span>
      </div>
      <div class="stat-item">
        <span class="label">最高 WPM</span>
        <span class="value">{{ maxWpm }}</span>
      </div>
      <div class="stat-item">
        <span class="label">累计学习词数</span>
        <span class="value">{{ aggregatedData.reduce((acc, curr) => acc + curr.words, 0) }}</span>
      </div>
    </div>

    <!-- 绿格子热力图 -->
    <div class="chart-section heatmap-section">
      <h4 class="sub-title">学习日历 (总学习单词数)</h4>
      <div class="heatmap-container" :class="[selectedRange]">
        <div class="heatmap-scroll">
          <div class="heatmap-grid">
            <div class="col" v-for="(col, cIdx) in heatmapGrid" :key="cIdx">
              <div 
                v-for="(day, rIdx) in col" 
                :key="day.date" 
                class="cell" 
                :class="`level-${day.level}`"
                :title="`${day.date}: 学习 ${day.words} 个单词`"
              ></div>
            </div>
          </div>
        </div>
      </div>
      <div class="heatmap-legend">
        <span>少</span>
        <div class="cell level-0"></div>
        <div class="cell level-1"></div>
        <div class="cell level-2"></div>
        <div class="cell level-3"></div>
        <div class="cell level-4"></div>
        <span>多</span>
      </div>
    </div>

    <!-- WPM 曲线图 -->
    <div class="chart-section wpm-section">
      <h4 class="sub-title">打字速度变化趋势 (WPM)</h4>
      <div class="svg-container">
        <svg viewBox="0 -20 1000 190" preserveAspectRatio="none" class="wpm-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#bd34fe" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#bd34fe" stop-opacity="0.01" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#bd34fe" />
              <stop offset="100%" stop-color="#41d1ff" />
            </linearGradient>
          </defs>
          <!-- 背景网格线 -->
          <line x1="0" y1="150" x2="1000" y2="150" stroke="var(--hw-border)" stroke-dasharray="4 4" opacity="0.6" />
          <line x1="0" y1="75" x2="1000" y2="75" stroke="var(--hw-border)" stroke-dasharray="4 4" opacity="0.6" />
          <line x1="0" y1="0" x2="1000" y2="0" stroke="var(--hw-border)" stroke-dasharray="4 4" opacity="0.6" />
          
          <path :d="svgPath + ` L 1000 150 L 0 150 Z`" fill="url(#areaGradient)" />
          <path :d="svgPath" fill="none" stroke="url(#lineGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="chart-line" />
          
          <!-- 画布上的最高和中间刻度 -->
          <text x="0" y="5" fill="var(--hw-text-3)" font-size="12">{{ maxWpm }} WPM</text>
          <text x="0" y="70" fill="var(--hw-text-3)" font-size="12">{{ Math.round(maxWpm/2) }}</text>
          
          <template v-for="(point, i) in filteredData" :key="i">
            <circle 
              v-if="filteredData.length <= 60"
              :cx="i * (filteredData.length > 1 ? 1000 / (filteredData.length - 1) : 1000)" 
              :cy="150 - (point.wpm / maxWpm) * 150" 
              r="4" 
              fill="var(--hw-bg-card)" 
              stroke="#bd34fe" 
              stroke-width="2.5" 
              class="chart-point"
            >
              <title>{{ point.date }} - {{ point.wpm }} WPM</title>
            </circle>
          </template>
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gamification-card {
  background: var(--hw-bg-card);
  padding: 1.8rem;
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--hw-text);
  font-weight: 600;
}

.sub-title {
  margin: 0 0 0.8rem 0;
  font-size: 0.9rem;
  color: var(--hw-text-2);
  font-weight: 500;
}

.range-selector {
  display: flex;
  background: var(--hw-bg);
  border-radius: 0.5rem;
  padding: 0.2rem;
  border: 1px solid var(--hw-border);
}

.range-selector button {
  background: transparent;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  color: var(--hw-text-2);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.range-selector button.active {
  background: var(--hw-bg-card);
  color: #bd34fe;
  font-weight: 600;
  box-shadow: var(--hw-shadow);
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  background: var(--hw-bg);
  padding: 1rem;
  border-radius: 0.8rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.2rem;
}

.stat-item .label {
  font-size: 0.75rem;
  color: var(--hw-text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-item .value {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--hw-text);
}

.stat-item .unit {
  font-size: 0.8rem;
  color: var(--hw-text-2);
  font-weight: normal;
}

.chart-section {
  display: flex;
  flex-direction: column;
}

/* Heatmap Styles */
.heatmap-container {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  /* 平滑滚动 */
  -webkit-overflow-scrolling: touch;
}

/* 隐藏滚动条但保留功能 */
.heatmap-container::-webkit-scrollbar {
  height: 4px;
}
.heatmap-container::-webkit-scrollbar-thumb {
  background: var(--hw-border);
  border-radius: 4px;
}

.heatmap-scroll {
  display: inline-block;
  min-width: 100%;
}

.heatmap-grid {
  display: flex;
  gap: 3px;
}

/* 对于不同范围的自适应对齐 */
.heatmap-container.30d .heatmap-grid {
  justify-content: space-around;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background-color: var(--hw-bg);
  border: 1px solid var(--hw-border);
  box-sizing: border-box;
  transition: all 0.2s ease;
}
.cell:hover {
  transform: scale(1.15);
  box-shadow: 0 0 5px rgba(189, 52, 254, 0.4);
  z-index: 10;
  border-color: rgba(189, 52, 254, 0.8);
}

.cell.level-0 { background-color: rgba(189, 52, 254, 0.03); border-color: rgba(189, 52, 254, 0.08); }
.cell.level-1 { background-color: rgba(189, 52, 254, 0.3); border-color: rgba(189, 52, 254, 0.1); }
.cell.level-2 { background-color: rgba(189, 52, 254, 0.55); border-color: rgba(189, 52, 254, 0.1); }
.cell.level-3 { background-color: rgba(189, 52, 254, 0.8); border-color: rgba(189, 52, 254, 0.15); }
.cell.level-4 { background-color: rgba(189, 52, 254, 1); border-color: rgba(189, 52, 254, 0.2); box-shadow: 0 0 8px rgba(189, 52, 254, 0.3); }

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 0.5rem;
  font-size: 0.7rem;
  color: var(--hw-text-3);
}

/* SVG Line Chart Styles */
.svg-container {
  width: 100%;
  height: 150px;
  margin-top: 0.5rem;
  position: relative;
}

.wpm-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.chart-line {
  transition: d 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.chart-point {
  transition: all 0.2s;
  cursor: pointer;
}

.chart-point:hover {
  r: 6;
  fill: #bd34fe;
  stroke: #fff;
  stroke-width: 2;
  filter: drop-shadow(0 0 4px rgba(189, 52, 254, 0.5));
}

@media (max-width: 768px) {
  .cell {
    width: 14px;
    height: 14px;
  }
}
</style>
