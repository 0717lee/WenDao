/**
 * 统一建筑目录 — 合并 GLB 实景模型与参数化生成建筑
 */

export type BuildingCategory =
  | 'palace'
  | 'tower'
  | 'bridge'
  | 'courtyard'
  | 'garden'
  | 'temple'
  | 'component';

export interface BuildingEntry {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  category: BuildingCategory;
  renderType: 'glb' | 'parametric';
  glbUrl?: string;
  hasAnimation?: boolean;
  parametricConfig?: {
    type: string;
    bayCount: number;
    depthCount: number;
    roofType: string;
  };
  dynasty?: string;
  style?: string;
  features?: string[];
}

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  palace: '宫殿',
  tower: '楼阁',
  bridge: '桥梁',
  courtyard: '院落',
  garden: '园林',
  temple: '庙宇',
  component: '构件',
};

export const CATEGORY_COLORS: Record<BuildingCategory, string> = {
  palace: '#ab1f22',
  tower: '#c9a063',
  bridge: '#888888',
  courtyard: '#5b8aab',
  garden: '#3c8a51',
  temple: '#8b5fc7',
  component: '#d45d2c',
};

export const BUILDING_CATALOG: BuildingEntry[] = [
  // ─── GLB 实景模型 ───
  {
    id: 'dougong',
    label: '斗拱构件',
    subtitle: '宋《营造法式》',
    description: '中国木构建筑最具标志性的承重与装饰构件，层层出挑，承托飞檐。',
    category: 'component',
    renderType: 'glb',
    glbUrl: '/assets/dougong_with_animation.glb',
    hasAnimation: true,
    dynasty: '始见于战国，成制于宋',
    style: '铺作层叠',
    features: ['华拱出跳', '昂尾挑斡', '栌斗承枋', '层层递进'],
  },
  {
    id: 'oriental',
    label: '东方楼阁',
    subtitle: '传统多层木构',
    description: '飞檐翼角、层层叠涩的多层木构楼阁，体现中国高层建筑智慧。',
    category: 'tower',
    renderType: 'glb',
    glbUrl: '/assets/oriental_building.glb',
    dynasty: '唐宋风格',
    style: '多层歇山顶',
    features: ['飞檐翼角', '副阶周匝', '平坐暗层', '宝顶收束'],
  },
  {
    id: 'siheyuan_glb',
    label: '四合院',
    subtitle: '北京传统民居',
    description: '以院落为核心的北方传统合院式住宅，体现礼制与家族秩序。',
    category: 'courtyard',
    renderType: 'glb',
    glbUrl: '/assets/traditional_chinese_siheyuan_courtyard.glb',
    dynasty: '元明清',
    style: '合院式硬山顶',
    features: ['正房坐北朝南', '东西厢房对称', '影壁照墙', '垂花门分隔内外'],
  },

  // ─── 参数化生成建筑 ───
  {
    id: 'taihe',
    label: '太和殿',
    subtitle: '明清 · 北京故宫',
    description: '紫禁城至高礼制建筑，面阔十一间，重檐庑殿顶，为中国古建等级之巅。',
    category: 'palace',
    renderType: 'parametric',
    parametricConfig: { type: 'imperial', bayCount: 9, depthCount: 5, roofType: 'wudian' },
    dynasty: '明永乐十八年 (1420) 始建',
    style: '重檐庑殿顶',
    features: ['面阔十一间', '七十二根大柱', '金龙和玺彩画', '三台汉白玉须弥座'],
  },
  {
    id: 'yueyang',
    label: '岳阳楼',
    subtitle: '唐宋 · 湖南岳阳',
    description: '洞庭湖畔名楼，三层四柱飞檐，因范仲淹《岳阳楼记》名传天下。',
    category: 'tower',
    renderType: 'parametric',
    parametricConfig: { type: 'official', bayCount: 5, depthCount: 3, roofType: 'xieshan' },
    dynasty: '唐开元四年 (716) 始建',
    style: '三层歇山顶',
    features: ['盔顶造型', '纯木无钉', '四柱通天', '飞檐斗拱'],
  },
  {
    id: 'tengwang',
    label: '滕王阁',
    subtitle: '唐 · 江西南昌',
    description: '赣江之滨，因王勃《滕王阁序》而成千古名楼。',
    category: 'tower',
    renderType: 'parametric',
    parametricConfig: { type: 'official', bayCount: 7, depthCount: 3, roofType: 'xieshan' },
    dynasty: '唐永徽四年 (653) 始建',
    style: '明三暗七层歇山顶',
    features: ['明三暗七格局', '碧瓦丹柱', '斗拱重叠', '压脊兽饰'],
  },
  {
    id: 'yingxian',
    label: '应县木塔',
    subtitle: '辽 · 山西应县',
    description: '世界现存最古老最高的纯木结构楼阁式建筑，历经千年不倒。',
    category: 'tower',
    renderType: 'parametric',
    parametricConfig: { type: 'imperial', bayCount: 5, depthCount: 5, roofType: 'wudian' },
    dynasty: '辽清宁二年 (1056)',
    style: '八角五层楼阁式',
    features: ['纯木无钉', '五十四种斗拱', '暗层结构加固', '高达67.31米'],
  },
  {
    id: 'zhaozhou',
    label: '赵州桥',
    subtitle: '隋 · 河北赵县',
    description: '世界现存最古老的敞肩石拱桥，跨度37米，设计精妙绝伦。',
    category: 'bridge',
    renderType: 'parametric',
    parametricConfig: { type: 'bridge', bayCount: 1, depthCount: 1, roofType: 'stone_arch' },
    dynasty: '隋大业年间 (605)',
    style: '单孔敞肩石拱',
    features: ['敞肩拱设计', '跨度37.02米', '二十八道并列券', '龙雕栏板'],
  },
  {
    id: 'siheyuan',
    label: '三进四合院',
    subtitle: '明清 · 北京',
    description: '标准三进院落布局，体现中轴对称的传统居住理想。',
    category: 'courtyard',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 3, depthCount: 2, roofType: 'yingshan' },
    dynasty: '明清定制',
    style: '硬山合院式',
    features: ['中轴对称', '前堂后寝', '抄手游廊', '砖雕门楼'],
  },
  {
    id: 'yuanlin',
    label: '苏州园林',
    subtitle: '明清 · 江苏苏州',
    description: '咫尺之内造乾坤，以叠山理水、花木亭廊营造诗意栖居。',
    category: 'garden',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 3, depthCount: 2, roofType: 'xieshan' },
    dynasty: '始于春秋，盛于明清',
    style: '歇山水榭式',
    features: ['叠山理水', '花窗漏景', '曲廊回环', '借景对景'],
  },
  {
    id: 'confucius',
    label: '孔庙大成殿',
    subtitle: '明清 · 山东曲阜',
    description: '祭祀孔子的至高殿堂，与太和殿、岱庙天贶殿并称中国三大殿。',
    category: 'temple',
    renderType: 'parametric',
    parametricConfig: { type: 'imperial', bayCount: 9, depthCount: 5, roofType: 'wudian' },
    dynasty: '宋天禧二年 (1018) 扩建',
    style: '重檐庑殿顶',
    features: ['十根龙柱', '黄琉璃瓦', '面阔九间', '杏坛前殿'],
  },
  {
    id: 'chuihua',
    label: '垂花门',
    subtitle: '明清 · 北方民居',
    description: '四合院内院入口的标志性构件，垂莲柱悬于空中不落地。',
    category: 'courtyard',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 1, depthCount: 1, roofType: 'yingshan' },
    dynasty: '明清',
    style: '一殿一卷式',
    features: ['垂莲柱悬空', '一殿一卷', '木雕彩绘', '分隔内外院'],
  },
  {
    id: 'guanfu',
    label: '官府衙门',
    subtitle: '明清 · 典型官式',
    description: '地方行政官署建筑，前衙后邸，体现封建行政等级制度。',
    category: 'palace',
    renderType: 'parametric',
    parametricConfig: { type: 'official', bayCount: 5, depthCount: 3, roofType: 'xieshan' },
    dynasty: '明清',
    style: '歇山式官衙',
    features: ['大堂居中', '仪门分隔', '六房列两侧', '照壁迎门'],
  },
  {
    id: 'minju',
    label: '徽派民居',
    subtitle: '明清 · 安徽',
    description: '粉墙黛瓦马头墙，天井采光通风，徽商宅邸的典雅之作。',
    category: 'courtyard',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 3, depthCount: 2, roofType: 'yingshan' },
    dynasty: '明中期至清',
    style: '天井式硬山顶',
    features: ['马头墙防火', '天井采光', '砖雕木雕石雕', '粉墙黛瓦'],
  },
  {
    id: 'paifang',
    label: '牌坊',
    subtitle: '明清 · 各地',
    description: '旌表功德、标识地名的纪念性建筑，为中国建筑独有形制。',
    category: 'component',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 3, depthCount: 1, roofType: 'yingshan' },
    dynasty: '始于汉，盛于明清',
    style: '四柱三间冲天式',
    features: ['冲天柱式', '石雕精美', '额枋题字', '夹杆石稳固'],
  },

  // ─── 新增建筑（扩充至22个）───
  {
    id: 'huanghelou',
    label: '黄鹤楼',
    subtitle: '唐宋 · 湖北武汉',
    description: '长江之滨名楼，因崔颢诗句"昔人已乘黄鹤去"而名扬天下。',
    category: 'tower',
    renderType: 'parametric',
    parametricConfig: { type: 'official', bayCount: 5, depthCount: 3, roofType: 'xieshan' },
    dynasty: '三国吴黄武二年 (223)',
    style: '五层攒尖顶',
    features: ['攒尖宝顶', '飞檐翘角', '黄瓦红柱', '层层收分'],
  },
  {
    id: 'daming',
    label: '大明宫含元殿',
    subtitle: '唐 · 陕西西安',
    description: '唐代第一正殿，规模宏大，为唐朝举行大朝会之所。',
    category: 'palace',
    renderType: 'parametric',
    parametricConfig: { type: 'imperial', bayCount: 11, depthCount: 5, roofType: 'wudian' },
    dynasty: '唐龙朔二年 (662)',
    style: '重檐庑殿顶',
    features: ['面阔十三间', '龙尾道', '三出阙', '东西朵殿'],
  },
  {
    id: 'wangjiang',
    label: '望江楼',
    subtitle: '明清 · 四川成都',
    description: '锦江之畔，为纪念唐代女诗人薛涛而建。',
    category: 'tower',
    renderType: 'parametric',
    parametricConfig: { type: 'official', bayCount: 4, depthCount: 3, roofType: 'xieshan' },
    dynasty: '明崇祯年间',
    style: '四层歇山顶',
    features: ['临江而立', '朱柱碧瓦', '飞檐斗拱', '薛涛井旁'],
  },
  {
    id: 'luoyang',
    label: '洛阳桥',
    subtitle: '宋 · 福建泉州',
    description: '中国现存最早的跨海梁式大石桥，与赵州桥齐名。',
    category: 'bridge',
    renderType: 'parametric',
    parametricConfig: { type: 'bridge', bayCount: 1, depthCount: 1, roofType: 'stone_arch' },
    dynasty: '北宋皇祐五年 (1053)',
    style: '梁式石桥',
    features: ['筏形基础', '船形桥墩', '长达834米', '牡蛎固基'],
  },
  {
    id: 'lingyin',
    label: '灵隐寺大雄宝殿',
    subtitle: '宋 · 浙江杭州',
    description: '江南禅宗名刹，飞来峰下，云林深处。',
    category: 'temple',
    renderType: 'parametric',
    parametricConfig: { type: 'imperial', bayCount: 7, depthCount: 5, roofType: 'wudian' },
    dynasty: '东晋咸和元年 (326) 始建',
    style: '重檐歇山顶',
    features: ['单层重檐', '黄墙黛瓦', '飞来峰石窟', '济公传说'],
  },
  {
    id: 'zhuozheng',
    label: '拙政园',
    subtitle: '明清 · 江苏苏州',
    description: '江南园林代表，以水为中心，亭台楼阁环绕。',
    category: 'garden',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 3, depthCount: 2, roofType: 'xieshan' },
    dynasty: '明正德四年 (1509)',
    style: '水榭亭廊式',
    features: ['以水为主', '远香堂', '荷风四面亭', '小飞虹'],
  },
  {
    id: 'shanxi_dayuan',
    label: '乔家大院',
    subtitle: '清 · 山西祁县',
    description: '晋商大院代表，六个大院组成，建筑精美。',
    category: 'courtyard',
    renderType: 'parametric',
    parametricConfig: { type: 'residential', bayCount: 5, depthCount: 3, roofType: 'yingshan' },
    dynasty: '清乾隆年间',
    style: '晋中合院式',
    features: ['六院相连', '砖雕精美', '高墙深院', '商业气息'],
  },
];
