# backend/ai_worker.py
import os
import json
from openai import OpenAI
from database import get_db

# ── OCR ───────────────────────────────────────────────────────────────────────

_ocr_model = None


def get_ocr_model():
    global _ocr_model
    if _ocr_model is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_model = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
            print("[OCR] PaddleOCR 模型加载成功")
        except Exception as e:
            print(f"[OCR] PaddleOCR 加载失败: {e}")
    return _ocr_model


def run_ocr(image_path: str) -> str:
    model = get_ocr_model()
    if model is None:
        raise RuntimeError("PaddleOCR 未安装，请运行: pip install paddlepaddle paddleocr")
    result = model.ocr(image_path, cls=True)
    lines = []
    for page in (result or []):
        if page:
            for line in page:
                text = line[1][0].strip()
                if text:
                    lines.append(text)
    return '\n'.join(lines)

MODEL = "deepseek-chat"
_embedding_model = None


def get_ai_client() -> OpenAI:
    return OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY", ""), base_url="https://api.deepseek.com")


def ask_ai(prompt: str) -> str:
    response = get_ai_client().chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer("BAAI/bge-small-zh-v1.5")
            print("[Embed] 模型加载成功")
        except Exception as e:
            print(f"[Embed] 模型加载失败（仅关键词检索可用）: {e}")
    return _embedding_model


def generate_embedding(text: str) -> list[float] | None:
    model = get_embedding_model()
    if model is None:
        return None
    try:
        import numpy as np
        return model.encode(text, normalize_embeddings=True).tolist()
    except Exception:
        return None


def embed_thought(thought_id: int, content: str):
    emb = generate_embedding(content)
    if emb is None:
        return
    try:
        conn = get_db()
        conn.execute("UPDATE thoughts SET embedding=? WHERE id=?", (json.dumps(emb), thought_id))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Embed] 存储失败 id={thought_id}: {e}")


def hybrid_search(query: str, user_id: int | None = None, top_k: int = 10) -> list[dict]:
    import numpy as np

    conn = get_db()
    uid_clause = "AND user_id=?" if user_id is not None else ""
    base_params = (user_id,) if user_id is not None else ()

    # ── 关键词检索 ──────────────────────────────────────────────────────────────
    keywords = [w for w in query.split() if w.strip()]
    keyword_ids: set[int] = set()
    if keywords:
        like_clauses = " OR ".join(["(content LIKE ? OR tags LIKE ?)"] * len(keywords))
        like_params = [v for kw in keywords for v in (f"%{kw}%", f"%{kw}%")]
        rows = conn.execute(
            f"SELECT id FROM thoughts WHERE ({like_clauses}) {uid_clause} LIMIT 30",
            (*like_params, *base_params),
        ).fetchall()
        keyword_ids = {r["id"] for r in rows}

    # ── 语义检索 ────────────────────────────────────────────────────────────────
    semantic_ids: set[int] = set()
    query_emb = generate_embedding(query)
    if query_emb is not None:
        all_rows = conn.execute(
            f"SELECT id, embedding FROM thoughts"
            f" WHERE embedding != '' {uid_clause} ORDER BY created_at DESC LIMIT 300",
            base_params,
        ).fetchall()
        q_vec = np.array(query_emb)
        scored = []
        for r in all_rows:
            try:
                vec = np.array(json.loads(r["embedding"]))
                scored.append((r["id"], float(np.dot(q_vec, vec))))
            except Exception:
                continue
        scored.sort(key=lambda x: x[1], reverse=True)
        semantic_ids = {s[0] for s in scored[:top_k]}

    combined = keyword_ids | semantic_ids

    # ── 回退：无结果时取最近随想 ───────────────────────────────────────────────
    if not combined:
        rows = conn.execute(
            f"SELECT id, content, tags, created_at FROM thoughts WHERE 1=1 {uid_clause}"
            f" ORDER BY created_at DESC LIMIT {top_k}",
            base_params,
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    placeholders = ",".join("?" * len(combined))
    rows = conn.execute(
        f"SELECT id, content, tags, created_at FROM thoughts WHERE id IN ({placeholders})"
        f" ORDER BY created_at DESC",
        list(combined),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_thoughts(query: str, user_id: int | None = None, top_k: int = 20) -> dict:
    import numpy as np

    conn = get_db()
    uid_clause = "AND user_id=?" if user_id is not None else ""
    base_params = (user_id,) if user_id is not None else ()

    # ── 关键词命中 ────────────────────────────────────────────────────────────────
    keywords = [w for w in query.split() if w.strip()]
    keyword_ids: set[int] = set()
    if keywords:
        like_clauses = " OR ".join(["(content LIKE ? OR tags LIKE ?)"] * len(keywords))
        like_params = [v for kw in keywords for v in (f"%{kw}%", f"%{kw}%")]
        rows = conn.execute(
            f"SELECT id FROM thoughts WHERE ({like_clauses}) {uid_clause} LIMIT 50",
            (*like_params, *base_params),
        ).fetchall()
        keyword_ids = {r["id"] for r in rows}

    # ── 语义检索 ──────────────────────────────────────────────────────────────────
    scored: list[tuple[int, float]] = []
    semantic_available = False
    query_emb = generate_embedding(query)
    if query_emb is not None:
        semantic_available = True
        all_rows = conn.execute(
            f"SELECT id, embedding FROM thoughts"
            f" WHERE embedding != '' {uid_clause} ORDER BY created_at DESC LIMIT 500",
            base_params,
        ).fetchall()
        q_vec = np.array(query_emb)
        for r in all_rows:
            try:
                vec = np.array(json.loads(r["embedding"]))
                scored.append((r["id"], float(np.dot(q_vec, vec))))
            except Exception:
                continue
        scored.sort(key=lambda x: x[1], reverse=True)

    semantic_top = scored[:top_k]
    semantic_ids = {s[0] for s in semantic_top}
    score_map: dict[int, float] = {s[0]: s[1] for s in semantic_top}

    combined = semantic_ids | keyword_ids
    if not combined:
        conn.close()
        return {"results": [], "semantic": semantic_available}

    placeholders = ",".join("?" * len(combined))
    rows = conn.execute(
        f"SELECT * FROM thoughts WHERE id IN ({placeholders})",
        list(combined),
    ).fetchall()
    conn.close()

    results = []
    for r in rows:
        t = dict(r)
        tid = t["id"]
        sem_score = score_map.get(tid, 0.0)
        in_keyword = tid in keyword_ids
        in_semantic = tid in semantic_ids
        t["score"] = round(sem_score, 4)
        t["match_mode"] = "both" if (in_keyword and in_semantic) else ("semantic" if in_semantic else "keyword")
        results.append(t)

    results.sort(key=lambda x: (x["score"], x["match_mode"] == "both"), reverse=True)
    return {"results": results[:top_k], "semantic": semantic_available}


def chat_with_notes(message: str, history: list[dict], user_id: int | None = None) -> str:
    relevant = hybrid_search(message, user_id)

    if relevant:
        context_lines = []
        for r in relevant:
            line = f"[{r['created_at'][:10]}] {r['content']}"
            if r.get("tags"):
                line += f"（标签：{r['tags']}）"
            context_lines.append(line)
        context = "\n".join(context_lines)
        system = (
            "你是用户的私人笔记助手，只基于以下随想记录回答问题。"
            "如果记录中没有相关信息，如实说明。回答简洁自然。\n\n"
            f"相关随想：\n{context}"
        )
    else:
        system = "你是用户的私人笔记助手。用户目前还没有随想记录，请友好地说明。"

    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    response = get_ai_client().chat.completions.create(
        model=MODEL, max_tokens=1024, messages=messages
    )
    return response.choices[0].message.content


def get_related_thought_ids(thought_id: int, user_id: int | None = None, top_k: int = 4) -> list[int]:
    import numpy as np
    conn = get_db()
    row = conn.execute("SELECT embedding FROM thoughts WHERE id=?", (thought_id,)).fetchone()
    if not row or not row["embedding"]:
        conn.close()
        return []
    try:
        target = np.array(json.loads(row["embedding"]))
    except Exception:
        conn.close()
        return []

    uid_clause = "AND user_id=?" if user_id is not None else ""
    params = [thought_id] + ([user_id] if user_id is not None else [])
    rows = conn.execute(
        f"SELECT id, embedding FROM thoughts WHERE id != ? AND embedding != '' {uid_clause}",
        params,
    ).fetchall()
    conn.close()

    scored = []
    for r in rows:
        try:
            vec = np.array(json.loads(r["embedding"]))
            scored.append((r["id"], float(np.dot(target, vec))))
        except Exception:
            continue
    scored.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scored[:top_k]]


def tag_thought_ai(thought_id: int, content: str):
    prompt = f"""为以下随想内容选择最合适的标签（1-3个）。
优先从预设标签中选择：创作与灵感、生活观察、技术思考、阅读笔记
如果都不合适，可以自定义一个简短标签（2-4字）。
只返回JSON，不要其他文字：{{"tags": ["标签1"]}}

内容：{content}"""
    try:
        result = json.loads(ask_ai(prompt))
        tags = [t.strip() for t in result.get("tags", []) if t.strip()]
        if tags:
            conn = get_db()
            conn.execute("UPDATE thoughts SET tags=? WHERE id=?", (",".join(tags), thought_id))
            conn.commit()
            conn.close()
            print(f"[AI Tag] id={thought_id} → {tags}")
    except Exception as e:
        print(f"[AI Tag] 失败 id={thought_id}: {e}")


EMOTION_LABELS = ["开心", "兴奋", "平静", "思考", "焦虑", "低落"]


def analyze_emotion(thought_id: int, content: str):
    labels = "、".join(EMOTION_LABELS)
    prompt = (
        f"分析以下文字的情绪倾向，从【{labels}】中选一个最符合的，"
        f"同时给出情绪强度分数（-1极消极，0中性，1极积极）。"
        f"只返回JSON，不要其他文字：{{\"emotion\": \"平静\", \"score\": 0.1}}\n\n"
        f"内容：{content}"
    )
    try:
        result = json.loads(ask_ai(prompt))
        emotion = result.get("emotion", "平静")
        if emotion not in EMOTION_LABELS:
            emotion = "平静"
        score = round(max(-1.0, min(1.0, float(result.get("score", 0.0)))), 3)
        conn = get_db()
        conn.execute(
            "UPDATE thoughts SET emotion=?, emotion_score=? WHERE id=?",
            (emotion, score, thought_id),
        )
        conn.commit()
        conn.close()
        print(f"[Emotion] id={thought_id} → {emotion} ({score})")
    except Exception as e:
        print(f"[Emotion] 分析失败 id={thought_id}: {e}")


def generate_insight(user_id: int | None = None) -> str | None:
    conn = get_db()
    uid_clause = "AND user_id=?" if user_id is not None else ""
    params = (user_id,) if user_id is not None else ()

    rows = conn.execute(
        f"SELECT content, tags, created_at FROM thoughts"
        f" WHERE created_at >= datetime('now', '-30 days') {uid_clause}"
        f" ORDER BY created_at DESC LIMIT 30",
        params,
    ).fetchall()
    conn.close()

    if not rows:
        return None

    summary = "\n".join([f"[{r['created_at'][:10]}] {r['content'][:120]}" for r in rows])
    prompt = f"""你是用户的私人思维分析师。基于用户最近的随想记录，给出一段深刻、个性化的洞察（150-200字）。
要求：发现近期关注的模式或主题，指出值得深入探索的方向，语气温暖像智慧的朋友。

近期随想：
{summary}"""

    try:
        insight = ask_ai(prompt).strip()
        conn = get_db()
        conn.execute("INSERT INTO insights (user_id, content) VALUES (?, ?)", (user_id, insight))
        conn.commit()
        conn.close()
        return insight
    except Exception as e:
        print(f"[AI Insight] 生成失败: {e}")
        return None


def generate_daily_prompt() -> str:
    prompt = (
        "你是一位写作引导师。为今天生成一个随想写作提示，帮助用户记录和反思自己的思想。\n"
        "要求：简洁有力（20-35字）、引发深思、像一个好问题或独特的观察角度、中文。\n"
        "每次风格多样——可以是哲思问题、生活观察、创意设想、情感回顾等。\n"
        "只返回提示文字本身，不要任何解释或前缀。"
    )
    return ask_ai(prompt).strip()


def generate_report(user_id: int, period: str, thoughts: list[dict], start_label: str, end_label: str) -> str:
    from collections import Counter

    if not thoughts:
        return f"## {start_label} — {end_label}\n\n这段时间没有随想记录。"

    total = len(thoughts)
    # Top tags
    tag_counter: Counter = Counter()
    for t in thoughts:
        for tag in (t.get("tags") or "").split(","):
            tag = tag.strip()
            if tag:
                tag_counter[tag] += 1
    top_tags = [f"{tag}（{cnt}条）" for tag, cnt in tag_counter.most_common(5)]

    # Emotion breakdown
    emo_counter: Counter = Counter()
    for t in thoughts:
        e = (t.get("emotion") or "").strip()
        if e:
            emo_counter[e] += 1
    emo_summary = "、".join(f"{e}×{n}" for e, n in emo_counter.most_common(4)) or "暂无情绪标签"

    # Active days
    from datetime import datetime as _dt
    day_counter: Counter = Counter()
    for t in thoughts:
        try:
            day_counter[_dt.fromisoformat(t["created_at"]).strftime("%m月%d日")] += 1
        except Exception:
            pass
    most_active = day_counter.most_common(1)[0][0] if day_counter else "未知"
    active_days = len(day_counter)

    # Sample excerpts (up to 3)
    excerpts = "\n".join(
        f"- {t['content'][:80].replace(chr(10), ' ')}…"
        for t in thoughts[:3]
    )

    period_label = "本周" if period == "week" else "本月"
    prompt = f"""你是用户的私人思绪分析师，请根据以下数据生成一份{period_label}随想报告（中文 Markdown 格式）。

数据摘要：
- 时间范围：{start_label} — {end_label}
- 记录总数：{total} 条
- 写作天数：{active_days} 天，最活跃：{most_active}
- 主要标签：{', '.join(top_tags) or '无'}
- 情绪分布：{emo_summary}
- 部分随想节选：
{excerpts}

请生成包含以下章节的 Markdown 报告（不要输出代码块，直接输出 Markdown 文本）：
## 📊 数据概览
## 💭 主要话题
## 😊 情绪轨迹
## ✨ 值得回顾
## 🔮 给下一{'周' if period == 'week' else '月'}的建议

要求：洞察深刻、语气温暖友好、总字数 300-400 字。"""

    return ask_ai(prompt).strip()


def get_wordcloud_data(user_id: int | None = None) -> list[dict]:
    try:
        import jieba
        jieba.setLogLevel(60)  # suppress logs
    except ImportError:
        return []

    from database import get_all_thought_contents
    from collections import Counter

    STOP_WORDS = set("的了是在我你他她它们这那也都和与或及等到从但不有说想会可就而为吗呢吧啊哦嗯吗很非常所以因为因此虽然然后如果虽但是所以因为还有一些这些那些什么怎么为什么如何只是就是真的其实其他其它即使可以已经一个一些一直一样更加对于关于来说关于还是没有好的能够看看下面上面这里那里之间之后之前通过使用")

    contents = get_all_thought_contents(user_id)
    full_text = " ".join(contents)
    words = jieba.cut(full_text)
    counter: Counter = Counter()
    for w in words:
        w = w.strip()
        if len(w) >= 2 and w not in STOP_WORDS and not w.isdigit() and not all(c.isascii() for c in w):
            counter[w] += 1

    return [{"text": w, "value": v} for w, v in counter.most_common(80)]


def get_thought_graph(user_id: int | None = None, max_nodes: int = 80) -> dict:
    import numpy as np

    conn = get_db()
    uid_clause = "AND user_id=?" if user_id is not None else ""
    params: tuple = (user_id,) if user_id is not None else ()

    rows = conn.execute(
        f"SELECT id, content, tags, emotion, embedding FROM thoughts"
        f" WHERE embedding != '' {uid_clause}"
        f" ORDER BY created_at DESC LIMIT ?",
        (*params, max_nodes),
    ).fetchall()
    conn.close()

    if len(rows) < 2:
        return {"nodes": [], "edges": []}

    nodes = []
    vecs = []
    for r in rows:
        try:
            vec = np.array(json.loads(r["embedding"]))
            vecs.append(vec)
            nodes.append({
                "id": r["id"],
                "preview": r["content"][:40].replace("\n", " "),
                "tags": r["tags"] or "",
                "emotion": r["emotion"] or "",
            })
        except Exception:
            continue

    if len(nodes) < 2:
        return {"nodes": nodes, "edges": []}

    seen: set[tuple] = set()
    edges = []
    for i, vi in enumerate(vecs):
        scores = []
        for j, vj in enumerate(vecs):
            if i == j:
                continue
            sim = float(np.dot(vi, vj))
            if sim >= 0.6:
                scores.append((j, sim))
        scores.sort(key=lambda x: x[1], reverse=True)
        for j, sim in scores[:3]:
            key = (min(nodes[i]["id"], nodes[j]["id"]), max(nodes[i]["id"], nodes[j]["id"]))
            if key not in seen:
                seen.add(key)
                edges.append({
                    "source": nodes[i]["id"],
                    "target": nodes[j]["id"],
                    "weight": round(sim, 3),
                })

    return {"nodes": nodes, "edges": edges}


def organize_thoughts(thought_ids: list[int] | None = None, user_id: int | None = None):
    conn = get_db()

    if thought_ids:
        placeholders = ",".join("?" * len(thought_ids))
        uid_clause = " AND user_id=?" if user_id is not None else ""
        params = (*thought_ids, user_id) if user_id is not None else thought_ids
        thoughts = conn.execute(
            f"SELECT * FROM thoughts WHERE id IN ({placeholders}){uid_clause} ORDER BY created_at ASC",
            params,
        ).fetchall()
    else:
        uid_clause = "AND user_id=?" if user_id is not None else ""
        params = (user_id,) if user_id is not None else ()
        thoughts = conn.execute(
            f"SELECT * FROM thoughts WHERE created_at >= datetime('now', '-7 days') {uid_clause} ORDER BY created_at ASC",
            params,
        ).fetchall()

    if len(thoughts) < 3:
        print(f"[AI] 随想数量 {len(thoughts)} < 3，跳过整理")
        return

    content_list = [f"[{t['created_at']}] {t['content']}" for t in thoughts]
    all_text = "\n".join(content_list)

    # 第一步：提取主题
    themes_prompt = f"""
以下是用户最近的随想记录，分析并提取2-5个核心主题。
只返回JSON，不要其他文字，格式：{{"themes": ["主题1", "主题2"]}}

随想内容：
{all_text}
"""
    try:
        themes = json.loads(ask_ai(themes_prompt))["themes"]
    except Exception:
        themes = ["综合随想"]

    # 时间段
    dates = [t["created_at"][:10] for t in thoughts]
    period = f"{min(dates)} ~ {max(dates)}"

    # 第二步：按主题生成文集
    for theme in themes:
        collection_prompt = f"""
你是一位文学编辑。从以下随想中筛选与主题"{theme}"相关的内容，
整理成一篇有结构、有文采的文章（500-800字）。
保留作者的思维方式和语气，适当润色但不改变原意。
用Markdown格式，以 # {theme} 作为标题开头，包含小节。

随想原文：
{all_text}
"""
        content = ask_ai(collection_prompt)
        ids_str = ",".join(str(t["id"]) for t in thoughts)
        conn.execute(
            "INSERT INTO collections (user_id, title, theme, content, thought_ids, period) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, f"{theme} · 随想录", theme, content, ids_str, period)
        )
        conn.commit()

    # AI 批量打标签
    batch_lines = "\n".join([f"id={t['id']}: {t['content'][:150]}" for t in thoughts])
    tag_prompt = f"""为以下每条随想选择1-2个最合适的标签。
预设标签：创作与灵感、生活观察、技术思考、阅读笔记（如都不合适可自定义2-4字标签）
只返回JSON，不要其他文字：{{"results": [{{"id": 数字, "tags": ["标签"]}}]}}

{batch_lines}"""
    try:
        tag_result = json.loads(ask_ai(tag_prompt))
        for item in tag_result.get("results", []):
            tags = [t.strip() for t in item.get("tags", []) if t.strip()]
            if tags:
                conn.execute("UPDATE thoughts SET tags=? WHERE id=?",
                             (",".join(tags), item["id"]))
        conn.commit()
    except Exception as e:
        print(f"[AI Tag Batch] 失败: {e}")
    print(f"✅ 整理完成，生成了 {len(themes)} 个主题文集")
