export interface DemoDocument {
  id: string
  title: string
  source: string
  sourceType: 'sample'
  originalText: string
  punctuatedText: string
  translatedText: string
  entityIds: string[]
  keywords: string[]
  demoAnswer: string
}

interface DemoBookshelfItem {
  id: string
  title: string
  status: string
  preview: string
  current_paragraph: number
  total_paragraphs: number
  has_processed: boolean
  has_note: boolean
  source_type: 'sample'
  updated_at: string
}

interface DemoSearchResult {
  id: string
  title: string
  content: string
  source: string
  score: number
}

interface DemoChatResponse {
  content: string
  citations: Array<{ title: string; source: string; excerpt?: string }>
}

const DEMO_UPDATED_AT = '2026-03-29T09:00:00+08:00'

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: '体验样例 · 《论语·学而》',
    source: '论语·学而',
    sourceType: 'sample',
    originalText:
      '学而时习之不亦说乎有朋自远方来不亦乐乎人不知而不愠不亦君子乎\n吾日三省吾身为人谋而不忠乎与朋友交而不信乎传不习乎\n道千乘之国敬事而信节用而爱人使民以时',
    punctuatedText:
      '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？\n吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？\n道千乘之国，敬事而信，节用而爱人，使民以时。',
    translatedText:
      '学习之后经常温习实践，不也是快乐的吗？有朋友从远方来，不也是高兴的吗？别人不了解自己却不生气，不也是君子的风度吗？\n我每天会多次反省自己：替别人办事有没有尽心？和朋友交往有没有守信？老师传授的内容有没有认真复习？\n治理一个拥有千辆兵车的国家，要认真处理政事、讲求信用，节省开支、爱护百姓，并在农时之外役使人民。',
    entityIds: ['kongzi', 'lunyu'],
    keywords: ['孔子', '论语', '学而时习之', '君子', '仁', '礼', '朋友', '三省吾身'],
    demoAnswer:
      '这段话讲的不是机械重复学习，而是“学到以后要反复实践、内化成自己的能力”。它把真正的成长分成三层：先把知识学进去，再在现实里不断练习，最后遇到误解也能保持从容，这就是君子的修养。',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: '体验样例 · 《孟子·梁惠王上》',
    source: '孟子·梁惠王上',
    sourceType: 'sample',
    originalText:
      '王何必曰利亦有仁义而已矣王曰何以利吾国大夫曰何以利吾家士庶人曰何以利吾身上下交征利而国危矣\n万乘之国弑其君者必千乘之家千乘之国弑其君者必百乘之家',
    punctuatedText:
      '王何必曰利？亦有仁义而已矣。王曰：何以利吾国？大夫曰：何以利吾家？士庶人曰：何以利吾身？上下交征利，而国危矣。\n万乘之国，弑其君者，必千乘之家；千乘之国，弑其君者，必百乘之家。',
    translatedText:
      '大王为什么一定要把利益挂在嘴边呢？只讲仁义就够了。如果国君想着怎样让国家得利，大夫想着怎样让家族得利，士人和平民想着怎样让自己得利，那么上下都在争利，国家就危险了。\n一个拥有万辆兵车的大国，杀死国君的，往往是拥有千辆兵车势力的卿大夫之家；一个拥有千辆兵车的国家，杀死国君的，往往是拥有百辆兵车势力的贵族之家。',
    entityIds: ['mengzi'],
    keywords: ['孟子', '仁义', '梁惠王', '利', '舍生取义'],
    demoAnswer:
      '孟子这里是在提醒统治者：如果整个社会都只盯着“利”，大家就会互相争夺，秩序会变坏。所以他强调，真正能稳住国家和人心的，不是单纯逐利，而是“仁”和“义”这样的价值原则。',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: '体验样例 · 《道德经》第一章',
    source: '道德经·第一章',
    sourceType: 'sample',
    originalText:
      '道可道非常道名可名非常名无名天地之始有名万物之母故常无欲以观其妙常有欲以观其徼此两者同出而异名同谓之玄玄之又玄众妙之门',
    punctuatedText:
      '道可道，非常道；名可名，非常名。无名，天地之始；有名，万物之母。\n故常无欲，以观其妙；常有欲，以观其徼。此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。',
    translatedText:
      '如果一个“道”可以被完整说清，它就不是永恒不变的道；如果一个“名”可以被完全定义，它就不是永恒的名。无名，是天地开始时的状态；有名，是万物生成后的称谓。\n所以，当我们放下欲望时，可以看到世界更幽微的部分；当我们带着欲望去看时，更容易看到事物的边界和表象。这两种观察方式都来自同一个源头，只是名称不同，都可以称作“玄”。越深入这种“玄”，越能靠近万事万物奥妙的入口。',
    entityIds: ['laozi', 'daodejing'],
    keywords: ['老子', '道德经', '道可道', '无欲', '有欲', '道法自然'],
    demoAnswer:
      '这一章想表达的是：世界中最根本的规律，很难被一句定义完全装下。老子不是让人放弃理解，而是在提醒我们，别把名称和概念当成事物本身。放下先入为主的欲望，反而更容易看到事物更深的层次。',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    title: '体验样例 · 《庄子·逍遥游》',
    source: '庄子·逍遥游',
    sourceType: 'sample',
    originalText:
      '北冥有鱼其名为鲲鲲之大不知其几千里也化而为鸟其名为鹏鹏之背不知其几千里也怒而飞其翼若垂天之云\n是鸟也海运则将徙于南冥南冥者天池也齐谐者志怪者也',
    punctuatedText:
      '北冥有鱼，其名为鲲。鲲之大，不知其几千里也；化而为鸟，其名为鹏。鹏之背，不知其几千里也；怒而飞，其翼若垂天之云。\n是鸟也，海运则将徙于南冥。南冥者，天池也。《齐谐》者，志怪者也。',
    translatedText:
      '北海有一种鱼，名字叫鲲。鲲大到不知道有几千里；后来变化成鸟，名字叫鹏。鹏的脊背，也大到不知道有几千里；当它振奋起飞时，翅膀像天边垂下来的云。\n这种大鸟，一到海动风起的时候，就会迁徙到南海。所谓南海，就是天然形成的大池。《齐谐》这本书，记载的就是这类奇异故事。',
    entityIds: ['zhuangzi'],
    keywords: ['庄子', '逍遥游', '鲲鹏', '大鹏', '齐物', '自由'],
    demoAnswer:
      '鲲鹏并不是单纯在写一种神奇动物，而是在借极大的形象说明：不同的生命处境，会决定一个人看到世界的尺度。庄子想讨论的，是怎样摆脱狭小视角，进入更自由、更开阔的精神状态。',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    title: '体验样例 · 《诗经·关雎》',
    source: '诗经·关雎',
    sourceType: 'sample',
    originalText:
      '关关雎鸠在河之洲窈窕淑女君子好逑参差荇菜左右流之窈窕淑女寤寐求之求之不得寤寐思服悠哉悠哉辗转反侧',
    punctuatedText:
      '关关雎鸠，在河之洲。窈窕淑女，君子好逑。\n参差荇菜，左右流之。窈窕淑女，寤寐求之。求之不得，寤寐思服。悠哉悠哉，辗转反侧。',
    translatedText:
      '雎鸠鸟在河中小洲上关关鸣叫，文静美好的女子，是君子理想的伴侣。\n长短不齐的荇菜，在水里左右摇曳。那位文静美好的女子，让人日夜都想追求；求而不得，于是日夜思念，长久地翻来覆去、难以入睡。',
    entityIds: ['shijing'],
    keywords: ['诗经', '关雎', '关关雎鸠', '君子好逑', '爱情诗'],
    demoAnswer:
      '《关雎》常被看作《诗经》的开篇代表，它写的是克制而郑重的情感，不是夸张表白。它用鸟鸣、荇菜这些自然意象，把思念和追求写得既含蓄又有节奏感。',
  },
]

function makePreview(text: string) {
  return `${text.slice(0, 70)}${text.length > 70 ? '…' : ''}`
}

function normalize(text: string) {
  return text.replace(/[《》“”？！，。；：、\s]/g, '').toLowerCase()
}

function scoreDemoDocument(document: DemoDocument, query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const fields = [
    document.title,
    document.source,
    document.originalText,
    document.punctuatedText,
    document.translatedText,
    ...document.keywords,
  ]

  let score = 0
  for (const field of fields) {
    const normalizedField = normalize(field)
    if (!normalizedField) continue

    if (normalizedField.includes(normalizedQuery)) {
      score += Math.min(normalizedQuery.length * 4, 40)
    }

    for (const keyword of document.keywords) {
      const normalizedKeyword = normalize(keyword)
      if (normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery)) {
        score += 12
      }
    }
  }

  return score
}

export function getDemoDocumentById(documentId: string) {
  return DEMO_DOCUMENTS.find((document) => document.id === documentId) || null
}

export function getDemoBookshelfDocuments(): DemoBookshelfItem[] {
  return DEMO_DOCUMENTS.map((document) => ({
    id: document.id,
    title: document.title,
    status: 'done',
    preview: makePreview(document.translatedText),
    current_paragraph: 0,
    total_paragraphs: 0,
    has_processed: true,
    has_note: false,
    source_type: 'sample',
    updated_at: DEMO_UPDATED_AT,
  }))
}

export function toReaderDocument(document: DemoDocument) {
  return {
    id: document.id,
    title: document.title,
    originalText: document.originalText,
    punctuatedText: document.punctuatedText,
    translatedText: document.translatedText,
    confidence: 1,
    imageUrl: undefined,
    sourceType: document.sourceType,
  }
}

export function searchDemoDocuments(query: string): DemoSearchResult[] {
  return DEMO_DOCUMENTS.map((document) => ({
    id: document.id,
    title: document.title,
    content: document.translatedText,
    source: document.source,
    score: scoreDemoDocument(document, query),
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
}

export function resolveDemoCitation(input: { title: string; source: string; excerpt?: string }) {
  const bestMatch = DEMO_DOCUMENTS
    .map((document) => {
      const score =
        scoreDemoDocument(document, input.title) +
        scoreDemoDocument(document, input.source) +
        (input.excerpt ? scoreDemoDocument(document, input.excerpt) : 0)

      return { document, score }
    })
    .sort((left, right) => right.score - left.score)[0]

  if (!bestMatch || bestMatch.score <= 0) {
    return null
  }

  return {
    documentId: bestMatch.document.id,
    title: bestMatch.document.title,
    anchorText: input.excerpt || input.source || input.title,
  }
}

export function buildDemoChatResponse(query: string): DemoChatResponse {
  const matchedDocument =
    DEMO_DOCUMENTS
      .map((document) => ({ document, score: scoreDemoDocument(document, query) }))
      .sort((left, right) => right.score - left.score)[0]?.document || DEMO_DOCUMENTS[0]

  return {
    content: `${matchedDocument.demoAnswer}\n\n当前为离线演示解读：为了保证现场演示稳定，我们先用内置样例完成”提问 -> 解读 -> 引用 -> 继续阅读”的完整流程。`,
    citations: [
      {
        title: matchedDocument.title,
        source: matchedDocument.source,
        excerpt: matchedDocument.punctuatedText.split('\n')[0],
      },
    ],
  }
}
