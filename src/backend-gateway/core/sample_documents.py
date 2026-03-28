# -*- coding: utf-8 -*-
"""Curated sample classical texts for first-run experience.

These are product demos, not a full reading platform corpus. They exist so
users without their own scan/image can still experience the core "read and
understand classical Chinese" workflow immediately.
"""

from __future__ import annotations

from typing import Any


SAMPLE_DOCUMENTS: list[dict[str, Any]] = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "title": "体验样例 · 《论语·学而》",
        "original_text": "学而时习之不亦说乎有朋自远方来不亦乐乎人不知而不愠不亦君子乎",
        "punctuated_text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
        "translated_text": "学习后经常复习实践，不也是快乐的吗？有朋友从远方来，不也是高兴的吗？别人不了解自己却不生气，不也是君子的风度吗？",
        "entity_ids": ["kongzi", "lunyu"],
        "source_type": "sample",
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "title": "体验样例 · 《孟子·梁惠王上》",
        "original_text": "王何必曰利亦有仁义而已矣",
        "punctuated_text": "王何必曰利？亦有仁义而已矣。",
        "translated_text": "大王为什么一定要把利益挂在嘴边呢？只要讲仁义就够了。",
        "entity_ids": ["mengzi"],
        "source_type": "sample",
    },
    {
        "id": "33333333-3333-4333-8333-333333333333",
        "title": "体验样例 · 《道德经》第一章",
        "original_text": "道可道非常道名可名非常名无名天地之始有名万物之母",
        "punctuated_text": "道可道，非常道；名可名，非常名。无名，天地之始；有名，万物之母。",
        "translated_text": "如果一个“道”能被完整说清，它就不是永恒不变的道；如果一个“名”能被完全定义，它就不是永恒的名。无名是天地开始时的状态，有名则是万物生成后的称谓。",
        "entity_ids": ["laozi", "daodejing"],
        "source_type": "sample",
    },
    {
        "id": "44444444-4444-4444-8444-444444444444",
        "title": "体验样例 · 《庄子·逍遥游》",
        "original_text": "北冥有鱼其名为鲲鲲之大不知其几千里也化而为鸟其名为鹏",
        "punctuated_text": "北冥有鱼，其名为鲲。鲲之大，不知其几千里也；化而为鸟，其名为鹏。",
        "translated_text": "北海有一种鱼，名字叫鲲。它大到不知道有几千里；后来变化成鸟，名字叫鹏。",
        "entity_ids": ["zhuangzi"],
        "source_type": "sample",
    },
    {
        "id": "55555555-5555-4555-8555-555555555555",
        "title": "体验样例 · 《诗经·关雎》",
        "original_text": "关关雎鸠在河之洲窈窕淑女君子好逑",
        "punctuated_text": "关关雎鸠，在河之洲。窈窕淑女，君子好逑。",
        "translated_text": "水鸟关关地鸣叫，在河中的小洲上。文静美好的女子，是君子理想的伴侣。",
        "entity_ids": ["shijing"],
        "source_type": "sample",
    },
]
