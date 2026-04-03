#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
重建古籍FAISS索引
为古文NLP验证准备匹配的测试数据
"""
import os
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from core.embeddings import WenDaoEmbeddings


def build_ancient_docs():
    """构建与测试样本匹配的古籍文档"""
    docs = []

    # Query 1: 什么是斗拱？
    docs.append(Document(
        page_content="斗拱是中国古代建筑特有的结构构件，位于柱与梁之间。它由方形的斗和弓形的拱组成，层层叠加，将屋顶的重量均匀分散到柱子上。斗拱不仅具有结构功能，还是建筑等级的重要标志。",
        metadata={"source": "营造法式·斗拱", "id": "doc_1", "category": "structure"}
    ))
    docs.append(Document(
        page_content="《营造法式》详细记载了斗拱的制作规范。斗拱由栌斗、散斗、华拱、昂等部件组成，按铺作数分为四铺作、五铺作直至八铺作，铺作数越多，建筑等级越高。斗拱的出跳使屋檐向外延伸，形成优美的曲线。",
        metadata={"source": "营造法式·铺作制度", "id": "doc_2", "category": "structure"}
    ))

    # Query 2: 榫卯结构的作用
    docs.append(Document(
        page_content="榫卯是中国古代木构建筑的核心连接方式，不用钉子，完全依靠木材之间的凹凸结合。榫是凸出部分，卯是凹进部分。这种结构既牢固又灵活，能够抵抗地震等自然灾害。",
        metadata={"source": "天工开物·榫卯", "id": "doc_3", "category": "technique"}
    ))
    docs.append(Document(
        page_content="常见的榫卯类型包括：直榫、燕尾榫、抱肩榫、格肩榫等。每种榫卯适用于不同的连接场景。燕尾榫因形似燕尾而得名，具有极强的抗拉能力，常用于梁柱连接。",
        metadata={"source": "考工记·木工", "id": "doc_4", "category": "technique"}
    ))

    # Query 3: 营造法式记载了什么内容？
    docs.append(Document(
        page_content="《营造法式》是北宋官方颁布的建筑规范，由李诫编撰。全书共34卷，包含大木作、小木作、石作、瓦作、彩画作等13个工种的详细规范，是中国古代建筑学的集大成之作。",
        metadata={"source": "营造法式·总序", "id": "doc_5", "category": "classic"}
    ))
    docs.append(Document(
        page_content="《营造法式》确立了'材'作为建筑设计的基本模数，将建筑用材分为八等。书中详细记载了各类构件的尺寸比例、制作工艺、施工方法，是研究宋代建筑技术的第一手资料。",
        metadata={"source": "营造法式·材分制度", "id": "doc_6", "category": "classic"}
    ))

    # Query 4: 飞檐翘角的建筑特点
    docs.append(Document(
        page_content="飞檐翘角是中国古建筑屋顶的典型特征，屋檐向外挑出并在角部上翘，形成优美的曲线。这种设计不仅美观，还能增加室内采光，使雨水远离墙体，保护木构架。",
        metadata={"source": "园冶·屋宇", "id": "doc_7", "category": "form"}
    ))
    docs.append(Document(
        page_content="飞檐的形成依靠飞椽和翼角梁的巧妙组合。角部的斗拱出跳更多，使角梁能够向外挑出更远。宋代建筑的飞檐曲线较为平缓，清代则更加夸张，形成了不同时代的风格特征。",
        metadata={"source": "营造法式·屋顶", "id": "doc_8", "category": "form"}
    ))

    # Query 5: 古代建筑的材分制度
    docs.append(Document(
        page_content="材分制度是宋代建筑设计的核心体系。'材'是基本模数单位，高15分、厚10分。在材之上叠加'栔'（高6分），合称'足材'。所有构件尺寸都以材的倍数确定，实现了模数化设计。",
        metadata={"source": "营造法式·材分", "id": "doc_9", "category": "system"}
    ))
    docs.append(Document(
        page_content="材等分为八等，一等材用于最高等级的殿阁，八等材用于小型构件。不同材等对应不同的建筑规模和等级。这种标准化体系使得建筑设计和施工更加规范，也便于工料估算。",
        metadata={"source": "营造法式·材等", "id": "doc_10", "category": "system"}
    ))

    # Query 6: 柱础的功能和样式
    docs.append(Document(
        page_content="柱础是柱子底部的石质基座，主要功能是防潮、承重和稳定。柱础将木柱与地面隔离，防止木材受潮腐烂，同时将柱子的压力均匀传递到地基。",
        metadata={"source": "营造法式·石作", "id": "doc_11", "category": "component"}
    ))
    docs.append(Document(
        page_content="柱础的样式丰富多样，常见的有覆盆式、鼓镜式、莲瓣式等。宋代柱础多为覆盆式，造型简洁；明清柱础则雕刻精美，常饰以莲花、云纹等图案，既有实用功能，又是重要的装饰构件。",
        metadata={"source": "石作图样", "id": "doc_12", "category": "component"}
    ))

    # Query 7: 天工开物中的建筑技术
    docs.append(Document(
        page_content="《天工开物》是明代宋应星编撰的科技著作，其中'舟车'、'陶埏'等章节涉及建筑相关技术。书中记载了砖瓦烧制、木材加工、石料开采等工艺流程，反映了明代建筑材料的生产技术。",
        metadata={"source": "天工开物·陶埏", "id": "doc_13", "category": "technology"}
    ))
    docs.append(Document(
        page_content="《天工开物》详细描述了榫卯制作工艺，包括木材选择、干燥处理、榫卯加工等步骤。书中强调木材要'顺纹理'加工，榫卯要'严丝合缝'，体现了古代工匠对材料性能和加工精度的深刻理解。",
        metadata={"source": "天工开物·木工", "id": "doc_14", "category": "technology"}
    ))

    # Query 8: 间架和进深的区别
    docs.append(Document(
        page_content="间架是指建筑面阔方向相邻两柱之间的空间，也称'开间'。进深是指建筑纵深方向前后柱之间的距离。间架决定了建筑的宽度，进深决定了建筑的纵深。",
        metadata={"source": "营造法式·间架", "id": "doc_15", "category": "layout"}
    ))
    docs.append(Document(
        page_content="建筑的规模常用'几间几进'来表示。如'三间两进'表示面阔三间、进深两间。间架和进深的比例影响建筑的空间感受，宋代建筑多采用方形或近方形的间架，明清建筑则进深较大，空间更加纵深。",
        metadata={"source": "营造法式·平面布局", "id": "doc_16", "category": "layout"}
    ))

    # Query 9: 举架制度的计算方法
    docs.append(Document(
        page_content="举架是指相邻两檩之间的高度差与水平距离之比，决定了屋顶的坡度。举架越大，屋顶越陡峭。《营造法式》规定了不同位置檩条的举架标准，从檐部到脊部逐渐增大，形成优美的屋顶曲线。",
        metadata={"source": "营造法式·举架", "id": "doc_17", "category": "roof"}
    ))
    docs.append(Document(
        page_content="举架的计算以'举'为单位，通常檐部举架为五举或六举，中部为七举或八举，近脊部为九举或十举。这种递增的举架使屋顶呈现出柔和的曲面，既美观又利于排水。",
        metadata={"source": "营造法式·屋顶曲线", "id": "doc_18", "category": "roof"}
    ))

    # Query 10: 雀替的装饰作用
    docs.append(Document(
        page_content="雀替是安装在梁与柱交接处的三角形构件，主要作用是缩短梁的净跨，增强连接强度。雀替因形似鸟雀张开的翅膀而得名，是结构与装饰相结合的典型构件。",
        metadata={"source": "营造法式·雀替", "id": "doc_19", "category": "decoration"}
    ))
    docs.append(Document(
        page_content="雀替的装饰手法丰富多样，常雕刻花卉、云纹、龙凤等图案。宋代雀替造型简洁，明清雀替则雕刻精美，成为室内装饰的重要组成部分。雀替的使用体现了中国建筑'寓美于用'的设计理念。",
        metadata={"source": "清式营造则例·装修", "id": "doc_20", "category": "decoration"}
    ))

    return docs


def main():
    print("=" * 60)
    print("重建古籍FAISS索引")
    print("=" * 60)

    # Build documents
    print("\n[1/3] 构建古籍文档...")
    docs = build_ancient_docs()
    print(f"  [OK] 创建了 {len(docs)} 个文档")

    # Initialize embeddings
    print("\n[2/3] 初始化Embedding模型...")
    try:
        embeddings = WenDaoEmbeddings()
        print("  [OK] Embedding模型初始化成功")
    except Exception as e:
        print(f"  [ERROR] Embedding初始化失败: {e}")
        return 1

    # Build FAISS index
    print("\n[3/3] 构建FAISS索引...")
    try:
        # Create FAISS index from documents
        vectorstore = FAISS.from_documents(docs, embeddings)

        # Save index using Python IO to avoid Chinese path issues
        faiss_dir = Path(__file__).parent.parent / "faiss_db"
        faiss_dir.mkdir(exist_ok=True)

        # Use serialize_index + Python IO instead of C++ write
        import faiss
        import pickle
        import numpy as np

        index_bytes = faiss.serialize_index(vectorstore.index)
        with open(faiss_dir / "index.faiss", "wb") as f:
            f.write(index_bytes)

        # Save docstore and index_to_docstore_id as tuple (not dict)
        with open(faiss_dir / "index.pkl", "wb") as f:
            pickle.dump((vectorstore.docstore, vectorstore.index_to_docstore_id), f)

        metadata = {
            "embedding_backend": embeddings.active_backend,
            "embedding_dim": int(vectorstore.index.d),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "document_count": len(docs),
        }
        (faiss_dir / "index.meta.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print(f"  [OK] FAISS索引已保存到: {faiss_dir}")
        print(f"  [OK] 索引包含 {len(docs)} 个文档")
        print(f"  [OK] 当前 embedding 后端: {embeddings.active_backend}")

    except Exception as e:
        print(f"  [ERROR] FAISS索引构建失败: {e}")
        import traceback
        traceback.print_exc()
        return 1

    print("\n" + "=" * 60)
    print("索引重建完成！")
    print("=" * 60)
    print("\n现在可以运行验证脚本:")
    print("  python scripts/validate_ancient_nlp.py --verbose")

    return 0


if __name__ == "__main__":
    sys.exit(main())
