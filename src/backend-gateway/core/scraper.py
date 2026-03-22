"""
古籍知识图谱数据采集与生成模块

采用混合策略：
- 核心数据：人工策展的结构化种子数据（保证离线可用、CI稳定）
- 可选增强：Wikipedia/国学网页面抓取（需网络，仅用于扩展描述）

实体类型：人物、典籍、历史事件、思想流派
"""

import json
import os
import time
from typing import Dict, Any, List, Optional

import requests
from bs4 import BeautifulSoup


# ============================================================
# 可选：Wikipedia 页面抓取（不影响种子数据生成）
# ============================================================

_HEADERS = {
    "User-Agent": "TextTwin-KnowledgeBot/1.0 (educational project)"
}


def scrape_wikipedia_entity(title: str, lang: str = "zh") -> Optional[str]:
    """
    从 Wikipedia 抓取实体摘要段落，用于丰富描述。
    返回首段文本，失败返回 None。使用代理友好，自带 1s 速率限制。
    """
    url = f"https://{lang}.wikipedia.org/wiki/{title}"
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        paragraphs = soup.select(".mw-parser-output > p")
        for p in paragraphs:
            text = p.get_text(strip=True)
            if len(text) > 20:
                time.sleep(1)  # 速率限制
                return text[:200]
    except Exception:
        pass
    return None


# ============================================================
# 种子数据：200+ 节点的古籍知识图谱
# ============================================================

def _build_seed_nodes() -> List[Dict[str, Any]]:
    """构建种子节点数据"""
    nodes = []

    def add(nid: str, label: str, group: str, desc: str):
        nodes.append({"id": nid, "label": label, "group": group, "desc": desc})

    # ── 思想流派 (12) ──────────────────────────────────────
    add("rujia", "儒家", "思想流派", "以仁义礼智信为核心的思想体系，影响中国两千余年")
    add("daojia", "道家", "思想流派", "以道法自然、无为而治为核心理念")
    add("fajia", "法家", "思想流派", "主张以法治国、富国强兵")
    add("mojia", "墨家", "思想流派", "主张兼爱非攻、尚贤尚同")
    add("bingjia", "兵家", "思想流派", "研究军事战略与战术的学派")
    add("mingjia", "名家", "思想流派", "研究名实关系与逻辑辩论")
    add("zongheng", "纵横家", "思想流派", "以合纵连横之术游说诸侯")
    add("yinyang", "阴阳家", "思想流派", "以阴阳五行解释宇宙万物变化")
    add("zajia", "杂家", "思想流派", "兼采各家之长的综合学派")
    add("nongjia", "农家", "思想流派", "主张重农，君民并耕")
    add("foxue", "佛学", "思想流派", "东汉传入中国，与本土文化深度融合")
    add("lixue", "理学", "思想流派", "宋代儒学新发展，融合佛道思想")
    add("xinxue", "心学", "思想流派", "王阳明创立，致良知、知行合一")
    add("kaoju", "考据学", "思想流派", "清代乾嘉学派，注重文献考证与校勘")

    # ── 人物 — 先秦 (25) ──────────────────────────────────
    add("kongzi", "孔子", "人物", "名丘字仲尼，儒家创始人，万世师表")
    add("mengzi", "孟子", "人物", "名轲，儒家亚圣，主张性善论与仁政")
    add("xunzi", "荀子", "人物", "名况，主张性恶论与礼法并重")
    add("laozi", "老子", "人物", "姓李名耳，道家创始人，著《道德经》")
    add("zhuangzi", "庄子", "人物", "名周，道家代表，著《庄子》，逍遥齐物")
    add("hanfeizi", "韩非子", "人物", "法家集大成者，著《韩非子》")
    add("mozi", "墨子", "人物", "名翟，墨家创始人，主张兼爱非攻")
    add("sunzi", "孙子", "人物", "名武，兵家始祖，著《孙子兵法》")
    add("sunbin", "孙膑", "人物", "兵家代表，著《孙膑兵法》")
    add("guiguzi", "鬼谷子", "人物", "纵横家始祖，苏秦张仪之师")
    add("liezi", "列子", "人物", "道家代表人物，著《列子》")
    add("yanzi", "晏子", "人物", "齐国名相晏婴，以谏闻名")
    add("gongsunlong", "公孙龙", "人物", "名家代表，白马非马论")
    add("huishi", "惠施", "人物", "名家代表，善辩论，与庄子为友")
    add("lvbuwei", "吕不韦", "人物", "秦相，主编《吕氏春秋》")
    add("quyu", "屈原", "人物", "战国楚国诗人，著《离骚》《九歌》，楚辞之祖")
    add("songyu", "宋玉", "人物", "屈原弟子，楚辞重要作家")
    add("zuoqiuming", "左丘明", "人物", "鲁国太史，相传著《左传》《国语》")
    add("zisi", "子思", "人物", "孔子之孙，著《中庸》，传承儒学")
    add("zengzi", "曾子", "人物", "名参，孔子弟子，著《大学》，以孝闻名")
    add("zilu", "子路", "人物", "名仲由，孔子弟子，以勇闻名")
    add("zigong", "子贡", "人物", "名端木赐，孔子弟子，善辩善商")
    add("zixia", "子夏", "人物", "名卜商，孔子弟子，重视礼乐文献")
    add("shangyang", "商鞅", "人物", "法家代表，秦国变法改革家")
    add("lisi", "李斯", "人物", "秦相，推行郡县制和书同文")

    # ── 人物 — 两汉 (12) ──────────────────────────────────
    add("simaqian", "司马迁", "人物", "字子长，著《史记》，史家之绝唱")
    add("bangu", "班固", "人物", "字孟坚，著《汉书》，断代史鼻祖")
    add("dongzhongshu", "董仲舒", "人物", "提出罢黜百家独尊儒术")
    add("sima_xiangru", "司马相如", "人物", "汉赋大家，著《子虚赋》《上林赋》")
    add("jiayi", "贾谊", "人物", "西汉政论家，著《过秦论》《治安策》")
    add("liuxiang", "刘向", "人物", "西汉学者，编校《战国策》《楚辞》《列女传》")
    add("liuxin", "刘歆", "人物", "刘向之子，古文经学开创者")
    add("wangchong", "王充", "人物", "东汉思想家，著《论衡》，批判迷信")
    add("zhangzhongjing", "张仲景", "人物", "医圣，著《伤寒杂病论》")
    add("caocao", "曹操", "人物", "政治家兼诗人，建安文学领袖")
    add("caozhi", "曹植", "人物", "曹操之子，才高八斗，著《洛神赋》")
    add("caopi", "曹丕", "人物", "曹操之子，著《典论·论文》，文学批评先驱")

    # ── 人物 — 魏晋南北朝 (8) ────────────────────────────
    add("taoqian", "陶渊明", "人物", "田园诗之祖，著《桃花源记》《归去来兮辞》")
    add("xie_lingyun", "谢灵运", "人物", "山水诗派开创者")
    add("liuyi_qing", "刘义庆", "人物", "编撰《世说新语》")
    add("liuxie", "刘勰", "人物", "著《文心雕龙》，中国文论巅峰之作")
    add("zhongr", "钟嵘", "人物", "著《诗品》，品评汉魏六朝诗人")
    add("xiao_tong", "萧统", "人物", "编《昭明文选》，中国现存最早总集")
    add("gan_bao", "干宝", "人物", "著《搜神记》，志怪小说集大成者")
    add("fan_ye", "范晔", "人物", "著《后汉书》")

    # ── 人物 — 唐代 (12) ──────────────────────────────────
    add("libai", "李白", "人物", "诗仙，浪漫主义诗歌巅峰")
    add("dufu", "杜甫", "人物", "诗圣，现实主义诗歌集大成者")
    add("baijiuyi", "白居易", "人物", "字乐天，新乐府运动倡导者")
    add("wangwei", "王维", "人物", "诗佛，诗画合一的山水田园诗人")
    add("lihe", "李贺", "人物", "诗鬼，想象瑰奇，词采诡丽")
    add("hanyu", "韩愈", "人物", "唐宋八大家之首，古文运动领袖")
    add("liuzongyuan", "柳宗元", "人物", "唐宋八大家，山水游记大师")
    add("dumy", "杜牧", "人物", "晚唐诗人，善咏史抒怀")
    add("lishangyin", "李商隐", "人物", "晚唐诗人，工于用典，辞采华美")
    add("liuyu", "刘禹锡", "人物", "诗豪，著《陋室铭》")
    add("meng_haoran", "孟浩然", "人物", "山水田园诗代表，与王维并称'王孟'")
    add("wangchangling", "王昌龄", "人物", "七绝圣手，边塞诗代表")

    # ── 人物 — 宋代 (12) ──────────────────────────────────
    add("sushi", "苏轼", "人物", "字子瞻号东坡，文学全才，唐宋八大家")
    add("ouyangxiu", "欧阳修", "人物", "唐宋八大家，北宋文坛领袖")
    add("wanganshi", "王安石", "人物", "唐宋八大家，变法改革家")
    add("liqingzhao", "李清照", "人物", "千古第一才女，婉约词宗")
    add("xinqiji", "辛弃疾", "人物", "豪放词代表，文武兼备")
    add("liuyong", "柳永", "人物", "婉约词代表，俚词开创者")
    add("zhuxi", "朱熹", "人物", "理学集大成者，著《四书章句集注》")
    add("luyoou", "陆游", "人物", "爱国诗人，一生诗作近万首")
    add("fankuangyan", "范仲淹", "人物", "著《岳阳楼记》，先忧后乐")
    add("simaguang", "司马光", "人物", "著《资治通鉴》，编年体通史巨著")
    add("sushi_che", "苏辙", "人物", "苏轼之弟，唐宋八大家之一")
    add("zengggong", "曾巩", "人物", "唐宋八大家之一，文风质朴")

    # ── 人物 — 元明清 (12) ────────────────────────────────
    add("guanhanqing", "关汉卿", "人物", "元杂剧奠基人，著《窦娥冤》")
    add("doueyuan", "窦娥冤", "典籍", "关汉卿著，元杂剧悲剧代表作")
    add("xixiangji", "西厢记", "典籍", "王实甫著，元杂剧爱情喜剧巅峰")
    add("wangshipu", "王实甫", "人物", "著《西厢记》，元杂剧巅峰")
    add("luoguanzhong", "罗贯中", "人物", "著《三国演义》，章回小说开山")
    add("shinaian", "施耐庵", "人物", "著《水浒传》")
    add("wuchengen", "吴承恩", "人物", "著《西游记》，神魔小说巅峰")
    add("caoxueqin", "曹雪芹", "人物", "著《红楼梦》，中国小说最高成就")
    add("psongling", "蒲松龄", "人物", "著《聊斋志异》，文言短篇小说集")
    add("wujingzi", "吴敬梓", "人物", "著《儒林外史》，讽刺小说代表")
    add("tangxianzu", "汤显祖", "人物", "著《牡丹亭》，明传奇巅峰")
    add("wangyangming", "王阳明", "人物", "心学创始人，致良知、知行合一")
    add("guyanwu", "顾炎武", "人物", "清初大儒，经世致用，著《日知录》")
    add("jixiaolan", "纪昀", "人物", "纪晓岚，主编《四库全书》，著《阅微草堂笔记》")

    # ── 典籍 — 经部 (15) ──────────────────────────────────
    add("lunyu", "论语", "典籍", "孔子及弟子言行录，儒家核心经典")
    add("mengzi_shu", "孟子", "典籍", "孟子及弟子政治学说，四书之一")
    add("daxue", "大学", "典籍", "四书之一，儒学入门纲领")
    add("zhongyong", "中庸", "典籍", "四书之一，论述中和之道")
    add("shijing", "诗经", "典籍", "中国最早诗歌总集，风雅颂三体")
    add("shangshu", "尚书", "典籍", "上古政治文献汇编，最早史书")
    add("yijing", "周易", "典籍", "群经之首，阐述阴阳变化之道")
    add("liji", "礼记", "典籍", "礼仪制度与儒家哲学论文集")
    add("chunqiu", "春秋", "典籍", "鲁国编年史，孔子所修")
    add("zuozhuan", "左传", "典籍", "春秋三传之一，叙事详备，文辞优美")
    add("guliang", "谷梁传", "典籍", "春秋三传之一，重义理阐发")
    add("gongyang", "公羊传", "典籍", "春秋三传之一，重微言大义")
    add("erya", "尔雅", "典籍", "中国最早的辞书，训诂学之祖")
    add("xiaojing", "孝经", "典籍", "论述孝道的儒家经典")
    add("sishuwujing", "四书五经", "典籍", "儒家核心典籍体系，科举考试依据")

    # ── 典籍 — 史部 (12) ──────────────────────────────────
    add("shiji", "史记", "典籍", "司马迁著，纪传体通史之祖，史家之绝唱")
    add("hanshu", "汉书", "典籍", "班固著，断代史开创之作")
    add("houhanshu", "后汉书", "典籍", "范晔著，记东汉历史")
    add("sanguozhi", "三国志", "典籍", "陈寿著，记魏蜀吴三国史")
    add("zztj", "资治通鉴", "典籍", "司马光编，编年体通史巨著，共294卷")
    add("zhanguoce", "战国策", "典籍", "记战国纵横家言行，文辞雄辩")
    add("guoyu", "国语", "典籍", "国别体史书之祖，记各国言论")
    add("shanhaijing", "山海经", "典籍", "先秦奇书，记地理博物神话传说")
    add("shuijingzhu", "水经注", "典籍", "郦道元著，综合性地理名著")
    add("ershisishi", "二十四史", "典籍", "中国官方正史总称，纪传体史书集合")
    add("tongdian", "通典", "典籍", "杜佑著，中国第一部典制体通史")
    add("wenxiantongkao", "文献通考", "典籍", "马端临著，典制体通史集大成")

    # ── 典籍 — 子部 (12) ──────────────────────────────────
    add("daodejing", "道德经", "典籍", "老子著，道家根本经典，五千言")
    add("zhuangzi_shu", "庄子", "典籍", "庄周著，道家重要经典，文学性极强")
    add("hanfeizi_shu", "韩非子", "典籍", "法家集大成著作")
    add("mozi_shu", "墨子", "典籍", "墨家学说总集，含逻辑学与自然科学")
    add("sunzi_shu", "孙子兵法", "典籍", "世界最早军事理论著作")
    add("lvshi_chunqiu", "吕氏春秋", "典籍", "吕不韦主编，杂家代表作")
    add("huainanzi", "淮南子", "典籍", "西汉刘安编，杂糅百家")
    add("lunheng", "论衡", "典籍", "王充著，批判迷信的唯物论著作")
    add("xunzi_shu", "荀子", "典籍", "荀况著作，论性恶与礼法")
    add("liezi_shu", "列子", "典籍", "道家著作，含愚公移山等名篇")
    add("guanzi", "管子", "典籍", "托名管仲的政治经济学著作")
    add("sikuquanshu", "四库全书", "典籍", "清乾隆敕编，中国最大丛书，收书3400余种")

    # ── 典籍 — 集部与文学 (15) ────────────────────────────
    add("chuci", "楚辞", "典籍", "屈原为主的浪漫主义诗歌总集")
    add("wenxuan", "昭明文选", "典籍", "萧统编，中国现存最早诗文总集")
    add("wenxindiaolong", "文心雕龙", "典籍", "刘勰著，中国文学理论批评巅峰")
    add("shipin", "诗品", "典籍", "钟嵘著，品评汉魏六朝诗人120家")
    add("tangshi300", "唐诗三百首", "典籍", "清人编选唐诗精华，流传最广的唐诗选本")
    add("songci300", "宋词三百首", "典籍", "清末朱孝臧编选宋词精华")
    add("guwenguanzhi", "古文观止", "典籍", "清人编选散文名篇，从先秦到明末")
    add("soushenji", "搜神记", "典籍", "干宝著，志怪小说集大成之作")
    add("shishuoxinyu", "世说新语", "典籍", "刘义庆编，记魏晋名士逸闻")
    add("hongloumeng", "红楼梦", "典籍", "曹雪芹著，中国古典小说巅峰")
    add("sanguoyanyi", "三国演义", "典籍", "罗贯中著，历史演义小说开山之作")
    add("shuihuzhuan", "水浒传", "典籍", "施耐庵著，英雄传奇小说代表")
    add("xiyouji", "西游记", "典籍", "吴承恩著，神魔小说巅峰之作")
    add("liaozhai", "聊斋志异", "典籍", "蒲松龄著，文言短篇小说集")
    add("mudanting", "牡丹亭", "典籍", "汤显祖著，明传奇巅峰，至情至性")

    # ── 历史事件 (20) ─────────────────────────────────────
    add("baijia_zhengming", "百家争鸣", "历史事件", "春秋战国时期思想文化大繁荣，诸子百家各抒己见")
    add("fenshu_kengru", "焚书坑儒", "历史事件", "秦始皇统一思想，焚毁民间藏书，坑杀术士儒生")
    add("duchun_rushu", "罢黜百家独尊儒术", "历史事件", "汉武帝采纳董仲舒建议，确立儒学正统地位")
    add("jingxue_fenzheng", "今古文经之争", "历史事件", "两汉经学分歧，今文重义理，古文重训诂")
    add("jian_an_wenxue", "建安文学", "历史事件", "曹操父子主导的文学繁荣，风骨遒劲")
    add("zhulin_qixian", "竹林七贤", "历史事件", "魏晋名士避世隐逸，崇尚清谈老庄")
    add("yongjia_nandu", "永嘉南渡", "历史事件", "西晋灭亡，中原文化南迁，影响文学格局")
    add("kaiyuan_shengshi", "开元盛世", "历史事件", "唐玄宗治下的文化鼎盛，诗歌黄金时代")
    add("guwen_yundong", "古文运动", "历史事件", "韩愈柳宗元倡导，反对骈文，复兴散文")
    add("keju_zhidu", "科举制度", "历史事件", "隋唐创立的选官制度，延续1300年，深刻影响文学")
    add("jingkang_zhibian", "靖康之变", "历史事件", "北宋灭亡，文人南渡，催生爱国文学")
    add("siku_bianzuan", "四库全书编纂", "历史事件", "清乾隆敕修，系统整理中国古籍，兼有文字狱背景")
    add("wenziyu", "文字狱", "历史事件", "清代因文字获罪的思想控制，压制学术自由")
    add("yinshua_faming", "活字印刷术发明", "历史事件", "北宋毕昇发明，推动书籍传播与文化普及")
    add("zhinan_faming", "造纸术改良", "历史事件", "东汉蔡伦改良造纸术，使书写载体廉价普及")
    add("xuanhe_shupu", "宣和书谱", "历史事件", "北宋官方书法著录，记录历代书法名作")
    add("qianjia_xp", "乾嘉学派", "历史事件", "清代考据学全盛期，段玉裁王念孙等人精研文字训诂")
    add("xinwenhua", "新文化运动", "历史事件", "提倡白话文、反对文言文，古籍传统面临变革")
    add("dunhuang_faxian", "敦煌文献发现", "历史事件", "1900年发现莫高窟藏经洞，大量古籍写本重见天日")
    add("jiaguwen_faxian", "甲骨文发现", "历史事件", "1899年发现殷墟甲骨，中国最早文字实物，改写上古史")

    # ── 补充人物 (5+15=20) ─────────────────────────────────
    add("bishen", "毕昇", "人物", "北宋发明家，发明活字印刷术")
    add("cailun", "蔡伦", "人物", "东汉宦官，改良造纸术")
    add("duanyucai", "段玉裁", "人物", "清代训诂学家，著《说文解字注》")
    add("wangniansun", "王念孙", "人物", "清代训诂学家，著《广雅疏证》")
    add("zhengxuan", "郑玄", "人物", "东汉经学大师，遍注群经")
    add("gao_shi", "高适", "人物", "唐代边塞诗人，与岑参并称'高岑'")
    add("cen_shen", "岑参", "人物", "唐代边塞诗人，善写西域风光")
    add("jia_dao", "贾岛", "人物", "唐代苦吟诗人，推敲典故之主")
    add("wentyun", "温庭筠", "人物", "花间词派鼻祖，词风秾艳")
    add("liyu", "李煜", "人物", "南唐后主，词中帝王，亡国词凄美")
    add("yansh", "晏殊", "人物", "北宋词人，词风闲雅清婉")
    add("yanjidao", "晏几道", "人物", "晏殊之子，工小令，情深语婉")
    add("zhoubangyan", "周邦彦", "人物", "北宋词家正宗，格律精严")
    add("jiangkui", "姜夔", "人物", "南宋词人兼音乐家，词风清空骚雅")
    add("yuanhaowen", "元好问", "人物", "金代文学家，著《论诗三十首》")
    add("nalan", "纳兰性德", "人物", "清初词人，以真挚著称，王国维誉为'北宋以来一人'")
    add("yuanmei", "袁枚", "人物", "清代诗人，著《随园诗话》，倡性灵说")
    add("gongzizhen", "龚自珍", "人物", "晚清思想家，著《己亥杂诗》")
    add("liangqichao", "梁启超", "人物", "近代学者，著《饮冰室合集》，推动古籍整理")
    add("wangguowei", "王国维", "人物", "近代学者，著《人间词话》，融通中西学术")

    # ── 补充典籍 (15) ─────────────────────────────────────
    add("shuowen", "说文解字", "典籍", "许慎著，中国最早字典，分析字形探究本义")
    add("qieyun", "切韵", "典籍", "陆法言著，中国最早韵书，音韵学基础")
    add("guangyun", "广韵", "典籍", "宋代官修韵书，在切韵基础上增补")
    add("kangxi_zidian", "康熙字典", "典籍", "清代官修字典，收字47035个")
    add("yupian", "玉篇", "典籍", "顾野王著，南朝字书")
    add("yongle_dadian", "永乐大典", "典籍", "明永乐年间编纂的类书，中国古代最大百科全书")
    add("taiping_yulan", "太平御览", "典籍", "宋代类书，引用古籍1690种")
    add("renjiancihua", "人间词话", "典籍", "王国维著，融通中西的词学批评经典")
    add("suiyuanshiphua", "随园诗话", "典籍", "袁枚著，倡性灵说，清代诗话代表")
    add("yilin", "儒林外史", "典籍", "吴敬梓著，讽刺科举与士人，中国讽刺小说经典")
    add("jinpingmei", "金瓶梅", "典籍", "中国第一部文人独创长篇小说，世情小说先驱")
    add("taohuashan", "桃花扇", "典籍", "孔尚任著，清代传奇巅峰，以离合之情写兴亡之感")
    add("changshengdian", "长生殿", "典籍", "洪昇著，清代传奇名作，写李杨爱情")
    add("guwen_cixue", "古文辞类纂", "典籍", "姚鼐编，桐城派古文选本")
    add("wenzhangguifan", "文章轨范", "典籍", "谢枋得编，宋代古文选本")

    # ── 补充历史事件 (10) ─────────────────────────────────
    add("liuchao_pianwen", "六朝骈文", "历史事件", "魏晋南北朝骈文盛行，追求声律对偶")
    add("cishi_fuxing", "词的兴起", "历史事件", "唐五代词体兴起，由民间曲子词发展为文人词")
    add("yuanqu_xingqi", "元曲兴起", "历史事件", "元代戏曲繁荣，杂剧散曲成为主流文学形式")
    add("mingqing_xiaoshuo", "明清小说繁荣", "历史事件", "长篇章回小说发展成熟，四大名著诞生")
    add("tongcheng_pai", "桐城派", "历史事件", "清代散文流派，方苞姚鼐为代表，讲究义法")
    add("changzhou_cipai", "常州词派", "历史事件", "清代词学流派，主张词须有寄托")
    add("wusi_baihua", "五四白话文运动", "历史事件", "1919年后白话文取代文言文成为书面语")
    add("jiajing_dali", "嘉靖大礼议", "历史事件", "明代政治事件，影响文人创作与心态")
    add("taiping_tianguo", "太平天国运动", "历史事件", "近代战乱导致大量古籍损毁")
    add("guji_zhengli", "古籍整理运动", "历史事件", "近现代学者系统整理校勘出版古籍")

    return nodes


def _build_seed_edges() -> List[Dict[str, Any]]:
    """构建种子关系数据"""
    edges = []
    eid_counter = [0]

    def add(src: str, tgt: str, label: str):
        eid_counter[0] += 1
        edges.append({"id": f"e{eid_counter[0]}", "from": src, "to": tgt, "label": label})

    # ── 人物 → 流派 ──────────────────────────────────────
    add("kongzi", "rujia", "创立")
    add("mengzi", "rujia", "属于")
    add("xunzi", "rujia", "属于")
    add("zisi", "rujia", "属于")
    add("zengzi", "rujia", "属于")
    add("dongzhongshu", "rujia", "属于")
    add("zhuxi", "lixue", "创立")
    add("wangyangming", "xinxue", "创立")
    add("laozi", "daojia", "创立")
    add("zhuangzi", "daojia", "属于")
    add("liezi", "daojia", "属于")
    add("hanfeizi", "fajia", "属于")
    add("shangyang", "fajia", "属于")
    add("lisi", "fajia", "属于")
    add("mozi", "mojia", "创立")
    add("sunzi", "bingjia", "属于")
    add("sunbin", "bingjia", "属于")
    add("gongsunlong", "mingjia", "属于")
    add("huishi", "mingjia", "属于")
    add("guiguzi", "zongheng", "属于")
    add("lvbuwei", "zajia", "属于")
    add("duanyucai", "kaoju", "属于")
    add("wangniansun", "kaoju", "属于")
    add("guyanwu", "kaoju", "影响")

    # ── 人物 → 著作 ──────────────────────────────────────
    add("kongzi", "lunyu", "言行录于")
    add("kongzi", "chunqiu", "编修")
    add("mengzi", "mengzi_shu", "著")
    add("laozi", "daodejing", "著")
    add("zhuangzi", "zhuangzi_shu", "著")
    add("hanfeizi", "hanfeizi_shu", "著")
    add("mozi", "mozi_shu", "著")
    add("sunzi", "sunzi_shu", "著")
    add("xunzi", "xunzi_shu", "著")
    add("liezi", "liezi_shu", "著")
    add("lvbuwei", "lvshi_chunqiu", "主编")
    add("simaqian", "shiji", "著")
    add("bangu", "hanshu", "著")
    add("fan_ye", "houhanshu", "著")
    add("simaguang", "zztj", "著")
    add("liuxiang", "zhanguoce", "编校")
    add("liuxiang", "chuci", "编校")
    add("wangchong", "lunheng", "著")
    add("quyu", "chuci", "著")
    add("xiao_tong", "wenxuan", "编")
    add("liuxie", "wenxindiaolong", "著")
    add("zhongr", "shipin", "著")
    add("liuyi_qing", "shishuoxinyu", "编")
    add("gan_bao", "soushenji", "著")
    add("luoguanzhong", "sanguoyanyi", "著")
    add("shinaian", "shuihuzhuan", "著")
    add("wuchengen", "xiyouji", "著")
    add("caoxueqin", "hongloumeng", "著")
    add("psongling", "liaozhai", "著")
    add("tangxianzu", "mudanting", "著")
    add("guanhanqing", "doueyuan", "著")
    add("wangshipu", "xixiangji", "著")
    add("zisi", "zhongyong", "著")
    add("zengzi", "daxue", "著")
    add("zuoqiuming", "zuozhuan", "著")
    add("zuoqiuming", "guoyu", "著")
    add("zhuxi", "sishuwujing", "注释")
    add("zhengxuan", "liji", "注")
    add("jixiaolan", "sikuquanshu", "主编")
    add("bishen", "yinshua_faming", "发明")
    add("cailun", "zhinan_faming", "改良")

    # ── 师承关系 ──────────────────────────────────────────
    add("kongzi", "zengzi", "师承")
    add("kongzi", "zilu", "师承")
    add("kongzi", "zigong", "师承")
    add("kongzi", "zixia", "师承")
    add("zengzi", "zisi", "师承")
    add("zisi", "mengzi", "影响")
    add("guiguzi", "sunbin", "师承")
    add("quyu", "songyu", "师承")
    add("xunzi", "hanfeizi", "师承")
    add("xunzi", "lisi", "师承")

    # ── 人物之间 ──────────────────────────────────────────
    add("zhuangzi", "huishi", "论辩")
    add("libai", "dufu", "交游")
    add("sushi", "ouyangxiu", "师承")
    add("sushi", "sushi_che", "兄弟")
    add("hanyu", "liuzongyuan", "同倡古文运动")
    add("caocao", "caozhi", "父子")
    add("caocao", "caopi", "父子")
    add("liuxiang", "liuxin", "父子")
    add("wangwei", "meng_haoran", "交游")

    # ── 典籍之间 ──────────────────────────────────────────
    add("lunyu", "sishuwujing", "属于")
    add("mengzi_shu", "sishuwujing", "属于")
    add("daxue", "sishuwujing", "属于")
    add("zhongyong", "sishuwujing", "属于")
    add("shijing", "sishuwujing", "属于")
    add("shangshu", "sishuwujing", "属于")
    add("yijing", "sishuwujing", "属于")
    add("liji", "sishuwujing", "属于")
    add("chunqiu", "sishuwujing", "属于")
    add("zuozhuan", "chunqiu", "注解")
    add("guliang", "chunqiu", "注解")
    add("gongyang", "chunqiu", "注解")
    add("shiji", "ershisishi", "属于")
    add("hanshu", "ershisishi", "属于")
    add("houhanshu", "ershisishi", "属于")
    add("sanguozhi", "ershisishi", "属于")
    add("chuci", "shijing", "继承")
    add("wenxuan", "chuci", "收录")
    add("wenxuan", "shijing", "收录")
    add("tangshi300", "libai", "收录")
    add("tangshi300", "dufu", "收录")
    add("tangshi300", "wangwei", "收录")
    add("tangshi300", "baijiuyi", "收录")
    add("tangshi300", "meng_haoran", "收录")
    add("tangshi300", "wangchangling", "收录")
    add("songci300", "sushi", "收录")
    add("songci300", "liqingzhao", "收录")
    add("songci300", "xinqiji", "收录")
    add("songci300", "liuyong", "收录")

    # ── 流派之间 ──────────────────────────────────────────
    add("rujia", "daojia", "对立互补")
    add("rujia", "fajia", "论争")
    add("rujia", "mojia", "论争")
    add("rujia", "lixue", "发展为")
    add("lixue", "xinxue", "发展为")
    add("daojia", "foxue", "互相影响")
    add("rujia", "foxue", "融合")
    add("kaoju", "lixue", "反思")

    # ── 事件关联 ──────────────────────────────────────────
    add("baijia_zhengming", "rujia", "催生")
    add("baijia_zhengming", "daojia", "催生")
    add("baijia_zhengming", "fajia", "催生")
    add("baijia_zhengming", "mojia", "催生")
    add("fenshu_kengru", "rujia", "打击")
    add("fenshu_kengru", "fajia", "推行")
    add("duchun_rushu", "rujia", "确立正统")
    add("duchun_rushu", "dongzhongshu", "提出者")
    add("guwen_yundong", "hanyu", "倡导者")
    add("guwen_yundong", "liuzongyuan", "倡导者")
    add("jian_an_wenxue", "caocao", "领袖")
    add("jian_an_wenxue", "caozhi", "代表")
    add("jian_an_wenxue", "caopi", "代表")
    add("kaiyuan_shengshi", "libai", "活跃于")
    add("kaiyuan_shengshi", "dufu", "活跃于")
    add("kaiyuan_shengshi", "wangwei", "活跃于")
    add("keju_zhidu", "lunyu", "考试用")
    add("keju_zhidu", "sishuwujing", "考试用")
    add("jingkang_zhibian", "liqingzhao", "影响")
    add("jingkang_zhibian", "xinqiji", "影响")
    add("jingkang_zhibian", "luyoou", "影响")
    add("siku_bianzuan", "sikuquanshu", "产出")
    add("siku_bianzuan", "jixiaolan", "主持者")
    add("wenziyu", "siku_bianzuan", "伴随")
    add("jingxue_fenzheng", "liuxin", "古文派")
    add("jingxue_fenzheng", "dongzhongshu", "今文派")
    add("jingxue_fenzheng", "zhengxuan", "调和者")
    add("qianjia_xp", "duanyucai", "代表")
    add("qianjia_xp", "wangniansun", "代表")
    add("qianjia_xp", "kaoju", "属于")
    add("zhulin_qixian", "daojia", "崇尚")
    add("zhulin_qixian", "taoqian", "影响")
    add("yongjia_nandu", "xie_lingyun", "影响")
    add("dunhuang_faxian", "shanhaijing", "发现写本")
    add("yinshua_faming", "bishen", "发明者")
    add("zhinan_faming", "cailun", "改良者")

    # ── 典籍 → 流派 ──────────────────────────────────────
    add("lunyu", "rujia", "核心经典")
    add("daodejing", "daojia", "核心经典")
    add("zhuangzi_shu", "daojia", "核心经典")
    add("hanfeizi_shu", "fajia", "核心经典")
    add("mozi_shu", "mojia", "核心经典")
    add("sunzi_shu", "bingjia", "核心经典")
    add("guanzi", "fajia", "属于")

    # ── 补充节点的关系 ────────────────────────────────────
    add("wentyun", "cishi_fuxing", "代表")
    add("liyu", "cishi_fuxing", "代表")
    add("yansh", "songci300", "收录")
    add("yanjidao", "songci300", "收录")
    add("zhoubangyan", "songci300", "收录")
    add("jiangkui", "songci300", "收录")
    add("nalan", "songci300", "收录")
    add("wangguowei", "renjiancihua", "著")
    add("yuanmei", "suiyuanshiphua", "著")
    add("duanyucai", "shuowen", "注释")
    add("guanhanqing", "yuanqu_xingqi", "代表")
    add("wangshipu", "yuanqu_xingqi", "代表")
    add("yuanhaowen", "jingkang_zhibian", "影响")
    add("gongzizhen", "guji_zhengli", "推动")
    add("liangqichao", "guji_zhengli", "推动")
    add("wujingzi", "yilin", "著")
    add("gao_shi", "tangshi300", "收录")
    add("cen_shen", "tangshi300", "收录")
    add("lihe", "tangshi300", "收录")
    add("dumy", "tangshi300", "收录")
    add("lishangyin", "tangshi300", "收录")
    add("liuyu", "tangshi300", "收录")
    add("jia_dao", "tangshi300", "收录")
    add("mingqing_xiaoshuo", "hongloumeng", "代表")
    add("mingqing_xiaoshuo", "sanguoyanyi", "代表")
    add("mingqing_xiaoshuo", "shuihuzhuan", "代表")
    add("mingqing_xiaoshuo", "xiyouji", "代表")
    add("tongcheng_pai", "guwen_cixue", "产出")
    add("changzhou_cipai", "songci300", "影响")
    add("liuchao_pianwen", "wenxuan", "收录于")
    add("sikuquanshu", "yongle_dadian", "参考")
    add("sikuquanshu", "kangxi_zidian", "收录")
    add("guangyun", "qieyun", "增补")
    add("taiping_yulan", "shanhaijing", "引用")
    add("taiping_yulan", "shuijingzhu", "引用")

    return edges


def scrape_ancient_texts_data(output_dir: str = None) -> Dict[str, Any]:
    """
    生成古籍知识图谱数据，写入 JSON 文件。

    参数:
        output_dir: 输出目录，默认为 src/backend-gateway/data/

    返回:
        包含 nodes, edges, stats 的字典
    """
    nodes = _build_seed_nodes()
    edges = _build_seed_edges()

    # 验证所有边引用的节点存在
    node_ids = {n["id"] for n in nodes}
    invalid_edges = []
    for e in edges:
        if e["from"] not in node_ids:
            invalid_edges.append(f"edge {e['id']}: from '{e['from']}' not found")
        if e["to"] not in node_ids:
            invalid_edges.append(f"edge {e['id']}: to '{e['to']}' not found")

    if invalid_edges:
        # 自动移除无效边并记录警告
        valid_edges = [
            e for e in edges
            if e["from"] in node_ids and e["to"] in node_ids
        ]
        print(f"Warning: removed {len(edges) - len(valid_edges)} invalid edges:")
        for msg in invalid_edges:
            print(f"  - {msg}")
        edges = valid_edges

    groups = sorted(set(n["group"] for n in nodes))
    stats = {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "groups": groups
    }

    graph_data = {
        "nodes": nodes,
        "edges": edges,
        "stats": stats
    }

    # 确定输出路径
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(__file__), "..", "data")

    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "ancient_texts_graph.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)

    print(f"Graph data written to {output_path}")
    print(f"  Nodes: {stats['node_count']}, Edges: {stats['edge_count']}")
    print(f"  Groups: {', '.join(groups)}")

    return graph_data


if __name__ == "__main__":
    scrape_ancient_texts_data()
