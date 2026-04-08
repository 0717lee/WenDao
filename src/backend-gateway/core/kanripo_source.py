# -*- coding: utf-8 -*-
"""Shared Kanripo source helpers for catalog parsing and on-demand imports."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover - optional dependency at runtime
    OpenCC = None  # type: ignore[assignment]

from core.reading_guides import READING_GUIDES
from core.document_segments import (
    build_featured_excerpt,
    build_original_text,
    build_segment_guides,
    enrich_segments,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
KANRIPO_ORG = "https://github.com/kanripo"
KANRIPO_NAMESPACE = uuid.UUID("7a27c81e-b555-4c78-a631-519a846fc8e1")
DEFAULT_CACHE_DIR = REPO_ROOT.parent / "tmp" / "kanripo-repos"
DEFAULT_CATALOG_CACHE_DIR = REPO_ROOT.parent / "tmp" / "kanripo-catalog"
CATALOG_INDEX_PATH = Path(__file__).resolve().parents[1] / "data" / "kanripo_catalog_index.json"

PINNED_CURATED_WORKS = [
    {"repo_id": "KR1a0001", "title": "《周易》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1b0001", "title": "《尚书》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1c0001", "title": "《诗经》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1d0052", "title": "《礼记》", "dynasty": "西汉", "author": "戴圣", "category": "经学典籍"},
    {"repo_id": "KR1e0001", "title": "《左传》", "dynasty": "先秦", "author": "左丘明", "category": "经学典籍"},
    {"repo_id": "KR1f0001", "title": "《孝经》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1h0004", "title": "《论语》", "dynasty": "春秋", "author": "孔子弟子", "category": "四书"},
    {"repo_id": "KR1h0001", "title": "《孟子》", "dynasty": "战国", "author": "孟子弟子", "category": "四书"},
    {"repo_id": "KR1h0018", "title": "《中庸辑略》", "dynasty": "南宋", "author": "石𡼖", "category": "四书"},
    {"repo_id": "KR1h0029", "title": "《大学疏义》", "dynasty": "南宋", "author": "真德秀", "category": "四书"},
    {"repo_id": "KR2a0001", "title": "《史记》", "dynasty": "西汉", "author": "司马迁", "category": "史书"},
    {"repo_id": "KR2a0012", "title": "《三国志》", "dynasty": "西晋", "author": "陈寿", "category": "史书"},
    {"repo_id": "KR2b0007", "title": "《资治通鉴》", "dynasty": "北宋", "author": "司马光", "category": "史书"},
    {"repo_id": "KR2e0001", "title": "《国语》", "dynasty": "春秋战国", "author": "相传左丘明", "category": "史书"},
    {"repo_id": "KR2e0003", "title": "《战国策》", "dynasty": "西汉", "author": "刘向整理", "category": "史书"},
    {"repo_id": "KR2e0006", "title": "《贞观政要》", "dynasty": "唐", "author": "吴兢", "category": "史书"},
    {"repo_id": "KR2g0003", "title": "《晏子春秋》", "dynasty": "春秋", "author": "晏婴相关记载", "category": "史书"},
    {"repo_id": "KR3a0002", "title": "《荀子》", "dynasty": "战国", "author": "荀况", "category": "儒家"},
    {"repo_id": "KR3a0006", "title": "《盐铁论》", "dynasty": "西汉", "author": "桓宽", "category": "政论"},
    {"repo_id": "KR3a0042", "title": "《近思录》", "dynasty": "南宋", "author": "朱熹", "category": "理学"},
    {"repo_id": "KR3a0058", "title": "《大学衍义》", "dynasty": "南宋", "author": "真德秀", "category": "政论"},
    {"repo_id": "KR3b0003", "title": "《孙子》", "dynasty": "春秋", "author": "孙武", "category": "兵家"},
    {"repo_id": "KR3c0001", "title": "《管子》", "dynasty": "春秋战国", "author": "托名管仲", "category": "政论"},
    {"repo_id": "KR3c0005", "title": "《韩非子》", "dynasty": "战国", "author": "韩非", "category": "法家"},
    {"repo_id": "KR3j0002", "title": "《墨子》", "dynasty": "战国", "author": "墨翟", "category": "墨家"},
    {"repo_id": "KR3j0009", "title": "《吕氏春秋》", "dynasty": "秦", "author": "吕不韦门客", "category": "杂家"},
    {"repo_id": "KR3j0092", "title": "《梦溪笔谈》", "dynasty": "北宋", "author": "沈括", "category": "笔记"},
    {"repo_id": "KR3l0002", "title": "《世说新语》", "dynasty": "刘宋", "author": "刘义庆", "category": "笔记小说"},
    {"repo_id": "KR3l0090", "title": "《山海经》", "dynasty": "先秦", "author": "佚名", "category": "志怪"},
    {"repo_id": "KR3l0099", "title": "《搜神记》", "dynasty": "东晋", "author": "干宝", "category": "志怪"},
    {"repo_id": "KR4a0001", "title": "《楚辞》", "dynasty": "西汉", "author": "王逸编", "category": "辞赋"},
    {"repo_id": "KR4h0001", "title": "《文选》", "dynasty": "南朝梁", "author": "萧统编", "category": "文学总集"},
    {"repo_id": "KR4i0001", "title": "《文心雕龙》", "dynasty": "南朝梁", "author": "刘勰", "category": "文学理论"},
    {"repo_id": "KR5c0045", "title": "《道德经》", "dynasty": "战国", "author": "老子", "category": "道家"},
    {"repo_id": "KR5c0126", "title": "《庄子》", "dynasty": "战国", "author": "庄子", "category": "道家"},
    {"repo_id": "KR5c0124", "title": "《列子》", "dynasty": "战国", "author": "列子", "category": "道家"},
    {"repo_id": "KR1e0008", "title": "《春秋穀梁传》", "dynasty": "汉前传本", "author": "穀梁赤传", "category": "经学典籍"},
    {"repo_id": "KR6c0023", "title": "《金刚经》", "dynasty": "姚秦", "author": "鸠摩罗什译", "category": "佛学"},
    {"repo_id": "KR6c0128", "title": "《心经》", "dynasty": "唐", "author": "玄奘译", "category": "佛学"},
    {"repo_id": "KR6q0083", "title": "《坛经》", "dynasty": "元刊本", "author": "宗宝编", "category": "佛学"},
]

ADDITIONAL_CURATED_REPO_IDS = [
    "KR1d0001",  # 《周禮》
    "KR1d0026",  # 《儀禮》
    "KR2i0002",  # 《越絕書》
    "KR2a0007",  # 《前漢書》
    "KR2a0009",  # 《後漢書》
    "KR2a0015",  # 《晉書》
    "KR2a0016",  # 《宋書》
    "KR2a0017",  # 《南齊書》
    "KR2a0018",  # 《梁書》
    "KR2a0019",  # 《陳書》
    "KR2a0020",  # 《魏書》
    "KR2a0021",  # 《北齊書》
    "KR2a0022",  # 《周書》
    "KR2a0023",  # 《隋書》
    "KR2a0024",  # 《南史》
    "KR2a0025",  # 《北史》
    "KR2a0026",  # 《舊唐書》
    "KR2a0027",  # 《新唐書》
    "KR2i0001",  # 《吳越春秋》
    "KR2k0111",  # 《東京夢華錄》
    "KR2m0001",  # 《通典》
    "KR3a0001",  # 《孔子家語》
    "KR3a0004",  # 《新語》
    "KR3a0005",  # 《新書》
    "KR3a0007",  # 《說苑》
    "KR3a0008",  # 《新序》
    "KR3a0010",  # 《潛夫論》
    "KR3a0011",  # 《申鑒》
    "KR3a0012",  # 《中論》
    "KR3a0013",  # 《傅子》
    "KR3a0016",  # 《帝範》
    "KR3i0019",  # 《茶經》
    "KR3j0014",  # 《顏氏家訓》
    "KR4b0008",  # 《陶淵明集》
    "KR4c0012",  # 《李太白文集》
    "KR4c0069",  # 《白氏長慶集》
    "KR4d0072",  # 《嘉祐集》
    "KR4d0076",  # 《東坡全集》
    "KR4d0189",  # 《歐陽修撰集》
    "KR4h0005",  # 《玉臺新詠》
    "KR4h0010",  # 《國秀集》
    "KR4h0021",  # 《古文苑》
    "KR4h0024",  # 《唐文粹》
    "KR4h0034",  # 《樂府詩集》
    "KR4h0107",  # 《古詩紀》
    "KR4h0119",  # 《古樂苑》
    "KR4i0006",  # 《六一詩話》
    "KR4j0062",  # 《花間集》
    "KR5a0306",  # 《列仙傳》
    "KR5c0118",  # 《文子》
    "KR5c0317",  # 《神仙傳》
    "KR5d0037",  # 《亢倉子》
    "KR5f0019",  # 《抱朴子內篇》
    "KR5f0021",  # 《抱朴子外篇》
    "KR6d0002",  # 《正法華經》
    "KR6h0016",  # 《地藏菩薩本願經》
    "KR6i0076",  # 《維摩詰所說經》
    "KR6r0052",  # 《高僧傳》
    "KR6r0137",  # 《弘明集》
    "KR6s0002",  # 《法苑珠林》
]


def load_catalog_index() -> list[dict[str, object]]:
    if not CATALOG_INDEX_PATH.exists():
        return []
    return json.loads(CATALOG_INDEX_PATH.read_text(encoding="utf-8"))


def get_converter():
    return OpenCC("t2s") if OpenCC else None


def infer_category(family: str | None, section: str | None) -> str:
    if section == "四書類":
        return "四书"
    if family == "经部":
        return "经学典籍"
    if family == "史部":
        return "史书"
    if section == "儒家類":
        return "儒家"
    if section == "兵家類":
        return "兵家"
    if section == "法家類":
        return "法家"
    if section == "雜家類":
        return "杂家"
    if section == "小說家類":
        return "笔记小说"
    if section == "譜錄類":
        return "笔记"
    if section == "藝術類":
        return "艺术"
    if family == "子部":
        return "子部典籍"
    if section == "詩文評類":
        return "文学理论"
    if section == "詞曲類":
        return "词曲"
    if family == "集部":
        return "文学总集"
    if family == "道部":
        return "道家"
    if family == "佛部":
        return "佛学"
    return "古籍"


def build_basic_reading_guide(
    metadata: dict[str, object],
    chapter_titles: list[str],
) -> dict[str, object]:
    family = str(metadata.get("family") or "")
    title = str(metadata.get("title") or "这部作品")
    category = str(metadata.get("category") or infer_category(family, str(metadata.get("section") or "")))

    if family == "史部":
        difficulty = "进阶"
        guide_summary = f"{title} 属于{category}，适合从人物、事件或时代线索进入。"
        reading_tip = "建议先从较熟悉的篇章开始，再顺着目录把前后关系连起来。"
    elif family == "经部":
        difficulty = "进阶"
        guide_summary = f"{title} 属于{category}，适合先抓核心概念，再逐步进入全书。"
        reading_tip = "建议先读较常见的章节，先理解关键词，再回头细看句义。"
    elif family == "集部":
        difficulty = "入门"
        guide_summary = f"{title} 属于{category}，适合从名篇或熟悉主题开始阅读。"
        reading_tip = "建议先读较短、较熟悉的篇章，先把大意读顺，再细看字句。"
    elif family == "道部":
        difficulty = "进阶"
        guide_summary = f"{title} 属于{category}，适合先抓核心词，再慢慢体会全文意思。"
        reading_tip = "建议先读篇幅较短、主题较清楚的部分，不必一开始追求全懂。"
    elif family == "佛部":
        difficulty = "进阶"
        guide_summary = f"{title} 属于{category}，适合先从核心章节进入，再逐步理解术语。"
        reading_tip = "建议先读较短章节，先把主旨读明白，再回头看术语和层次。"
    else:
        difficulty = "入门"
        guide_summary = f"{title} 属于{category}，适合从主题较清楚的部分开始。"
        reading_tip = "建议先读较短章节，先理解大意，再逐步扩展到全书。"

    return {
        "difficulty": difficulty,
        "guide_summary": guide_summary,
        "reading_tip": reading_tip,
        "recommended_chapters": chapter_titles[:3],
    }


def normalize_display_title(title: str, converter=None) -> str:
    cleaned = title.strip()
    if converter:
        cleaned = converter.convert(cleaned)
    return f"《{cleaned}》" if not cleaned.startswith("《") else cleaned


def _build_additional_curated_works() -> list[dict[str, object]]:
    converter = get_converter()
    catalog_by_repo = {
        str(item.get("repo_id")): item
        for item in load_catalog_index()
        if isinstance(item, dict) and item.get("repo_id")
    }
    works: list[dict[str, object]] = []
    for repo_id in ADDITIONAL_CURATED_REPO_IDS:
        entry = catalog_by_repo.get(repo_id)
        if not entry:
            raise KeyError(f"Missing catalog metadata for curated repo_id={repo_id}")
        title = str(entry.get("title") or repo_id)
        if converter:
            title = normalize_display_title(title.strip("《》"), converter)
        works.append({
            "repo_id": repo_id,
            "title": title,
            "dynasty": entry.get("dynasty"),
            "author": entry.get("author"),
            "family": entry.get("family"),
            "section": entry.get("section"),
            "category": infer_category(str(entry.get("family") or ""), str(entry.get("section") or "")),
        })
    return works


CURATED_WORKS = [*PINNED_CURATED_WORKS, *_build_additional_curated_works()]

PRIMARY_REPO_IDS = {item["repo_id"] for item in CURATED_WORKS}
TRANSLATION_PREWARM_REPO_IDS = {item["repo_id"] for item in CURATED_WORKS}
PAGE_BREAK_PATTERN = re.compile(r"<pb:[^>]+>")
TITLE_PATTERN = re.compile(r"^\*\*\s+")
INLINE_NUMBER_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)")
SEGMENT_NUMBER_PATTERN = re.compile(r"^\d+(?:\.\d+)?\s*")
FULL_TRANSLATION_CORE_REPO_IDS = {
    "KR1c0001",  # 《诗经》
    "KR1f0001",  # 《孝经》
    "KR1h0004",  # 《论语》
    "KR1h0001",  # 《孟子》
    "KR4a0001",  # 《楚辞》
    "KR5c0045",  # 《道德经》
    "KR5c0126",  # 《庄子》
}


def run_git(args: list[str], cwd: Path | None = None, retries: int = 3, timeout_seconds: int = 300) -> None:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            subprocess.run(
                ["git", *args], cwd=cwd, check=True,
                timeout=timeout_seconds, capture_output=True,
            )
            return
        except subprocess.TimeoutExpired as exc:
            last_error = exc
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
    if last_error:
        raise last_error


def _download_repo_archive(repo_id: str, target_dir: Path) -> Path:
    archive_candidates = [
        f"https://codeload.github.com/kanripo/{repo_id}/zip/refs/heads/master",
        f"https://codeload.github.com/kanripo/{repo_id}/zip/refs/heads/main",
    ]
    last_error: Exception | None = None
    for url in archive_candidates:
        try:
            with urlopen(url, timeout=300) as response:
                archive_bytes = response.read()
            break
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
    else:
        raise RuntimeError(f"Failed to download archive for {repo_id}: {last_error}")

    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)
    target_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
        archive.extractall(target_dir)

    extracted_roots = [path for path in target_dir.iterdir() if path.is_dir()]
    if len(extracted_roots) == 1:
        extracted_root = extracted_roots[0]
        for child in extracted_root.iterdir():
            destination = target_dir / child.name
            if destination.exists():
                if destination.is_dir():
                    shutil.rmtree(destination, ignore_errors=True)
                else:
                    destination.unlink(missing_ok=True)
            shutil.move(str(child), str(destination))
        shutil.rmtree(extracted_root, ignore_errors=True)

    return target_dir


def ensure_repo(repo_id: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    repo_dir = cache_dir / repo_id
    if repo_dir.exists():
        if any(repo_dir.glob(f"{repo_id}_*.txt")):
            return repo_dir
        try:
            run_git(["pull", "--ff-only"], cwd=repo_dir, timeout_seconds=1200)
        except Exception:
            temp_repo_dir = cache_dir / f"{repo_id}__fresh_{uuid.uuid4().hex[:8]}"
            if temp_repo_dir.exists():
                shutil.rmtree(temp_repo_dir, ignore_errors=True)
            try:
                run_git(["clone", "--depth", "1", f"{KANRIPO_ORG}/{repo_id}.git", str(temp_repo_dir)], timeout_seconds=1200)
            except Exception:
                _download_repo_archive(repo_id, temp_repo_dir)
            try:
                shutil.rmtree(repo_dir, ignore_errors=True)
                temp_repo_dir.replace(repo_dir)
                return repo_dir
            except PermissionError:
                return temp_repo_dir
        return repo_dir

    try:
        _download_repo_archive(repo_id, repo_dir)
    except Exception:
        run_git(["clone", "--depth", "1", f"{KANRIPO_ORG}/{repo_id}.git", str(repo_dir)], timeout_seconds=1200)
    return repo_dir


def iter_text_files(repo_dir: Path, repo_id: str) -> Iterable[Path]:
    return sorted(
        (path for path in repo_dir.glob(f"{repo_id}_*.txt") if path.is_file()),
        key=lambda path: path.name,
    )
def safe_convert(converter, text: str) -> str:
    if not converter:
        return text
    try:
        result = converter.convert(text)
        if '\ufffd' not in result and '' not in result:
            return result
    except Exception:
        pass
    
    # Fallback to character-by-character conversion
    output = []
    for char in text:
        try:
            converted = converter.convert(char)
            if '\ufffd' in converted or '' in converted:
                output.append(char)
            else:
                output.append(converted)
        except Exception:
            output.append(char)
    return "".join(output)


def normalize_line(line: str, converter) -> str:
    line = PAGE_BREAK_PATTERN.sub("", line)
    line = line.replace("¶", "\n")
    line = line.replace("\u3000", " ").replace("\t", " ")
    parts: list[str] = []
    for part in line.splitlines():
        cleaned = part.strip()
        if not cleaned:
            continue
        if cleaned.startswith("#+") or cleaned.startswith("# "):
            continue
        if cleaned.startswith("# src:") or cleaned.startswith("# dating:"):
            continue
        if cleaned.startswith(":") or cleaned == "目次":
            continue
        if cleaned.startswith("* "):
            continue
        if TITLE_PATTERN.match(cleaned):
            cleaned = TITLE_PATTERN.sub("", cleaned)
        cleaned = INLINE_NUMBER_PATTERN.sub(lambda m: f"{m.group(1)} ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        cleaned = safe_convert(converter, cleaned)
        parts.append(cleaned)
    return "\n".join(parts).strip()


def extract_segment_title(raw_text: str, path: Path, converter) -> str:
    for line in raw_text.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        if TITLE_PATTERN.match(cleaned):
            title = TITLE_PATTERN.sub("", cleaned)
            title = INLINE_NUMBER_PATTERN.sub(lambda m: f"{m.group(1)} ", title)
            title = SEGMENT_NUMBER_PATTERN.sub("", title).strip()
            title = safe_convert(converter, title)
            return title or path.stem
    return path.stem


def build_segments(repo_dir: Path, repo_id: str, converter) -> list[dict[str, str]]:
    segments: list[dict[str, str]] = []
    for path in iter_text_files(repo_dir, repo_id):
        raw_text = path.read_text(encoding="utf-8")
        title = extract_segment_title(raw_text, path, converter)
        normalized = normalize_line(raw_text, converter)
        if normalized:
            segments.append({"title": title, "text": normalized})
    return segments


def build_punctuated_text(segments: list[dict[str, str]]) -> str:
    text = "\n\n".join(segment["text"] for segment in segments)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def pick_segments_for_translation(
    repo_id: str,
    recommended_chapters: list[str] | None = None,
    max_segments: int = 3,
    cache_dir: Path = DEFAULT_CACHE_DIR,
) -> list[dict[str, str]]:
    segments = build_segments(ensure_repo(repo_id, cache_dir=cache_dir), repo_id, get_converter())
    if not segments:
        return []

    selected: list[dict[str, str]] = []
    if recommended_chapters:
        for segment in segments:
            if any(
                recommendation in segment["title"] or segment["title"] in recommendation
                for recommendation in recommended_chapters
            ):
                selected.append(segment)

    if not selected:
        selected = segments[:max_segments]

    return selected[:max_segments]


def build_repo_record(metadata: dict[str, object], cache_dir: Path = DEFAULT_CACHE_DIR) -> dict[str, object]:
    converter = get_converter()
    repo_id = str(metadata["repo_id"])
    repo_dir = ensure_repo(repo_id, cache_dir=cache_dir)
    raw_segments = build_segments(repo_dir, repo_id, converter)
    segments = enrich_segments(raw_segments, metadata)
    punctuated_text = build_punctuated_text(raw_segments)
    original_text = build_original_text(punctuated_text)
    chapter_titles = [segment["title"] for segment in segments]
    segment_guides = build_segment_guides(segments)
    reading_guide = dict(READING_GUIDES.get(repo_id, {}))
    if not reading_guide.get("guide_summary") or not reading_guide.get("reading_tip"):
        fallback_guide = build_basic_reading_guide(metadata, chapter_titles)
        reading_guide = {**fallback_guide, **reading_guide}

    return {
        "id": str(uuid.uuid5(KANRIPO_NAMESPACE, repo_id)),
        "repo_id": repo_id,
        "title": metadata["title"],
        "author": metadata.get("author"),
        "dynasty": metadata.get("dynasty"),
        "category": metadata.get("category"),
        "family": metadata.get("family"),
        "section": metadata.get("section"),
        "source_name": "Kanripo",
        "source_url": f"{KANRIPO_ORG}/{repo_id}",
        "source_type": "corpus",
        "chapter_titles": chapter_titles,
        "chapter_count": len(chapter_titles),
        "featured_excerpt": build_featured_excerpt(segments),
        "segment_guides": segment_guides,
        "segments": segments,
        "difficulty": reading_guide.get("difficulty"),
        "guide_summary": reading_guide.get("guide_summary"),
        "reading_tip": reading_guide.get("reading_tip"),
        "recommended_chapters": reading_guide.get("recommended_chapters", []),
        "translation_cache": [],
        "translation_status": "none",
        "original_text": original_text,
        "punctuated_text": punctuated_text,
        "translated_text": "",
        "entity_ids": [],
    }


def parse_catalog_title(raw_title: str) -> tuple[str, str | None, str | None]:
    cleaned = raw_title.strip()
    is_primary = "(正文)" in cleaned
    cleaned = cleaned.replace("(正文)", "").strip()
    parts = cleaned.split("-")
    title = parts[0].strip()
    dynasty = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
    author = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
    return title, dynasty, author


def serialize_json(data: object, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
