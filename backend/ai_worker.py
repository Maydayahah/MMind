# backend/ai_worker.py
import os
import json
from openai import OpenAI
from database import get_db

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com"
)
MODEL = "deepseek-chat"


def ask_ai(prompt: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


def organize_thoughts(thought_ids: list[int] | None = None):
    conn = get_db()

    if thought_ids:
        placeholders = ",".join("?" * len(thought_ids))
        thoughts = conn.execute(
            f"SELECT * FROM thoughts WHERE id IN ({placeholders}) ORDER BY created_at ASC",
            thought_ids,
        ).fetchall()
    else:
        thoughts = conn.execute("""
            SELECT * FROM thoughts
            WHERE created_at >= datetime('now', '-7 days')
            ORDER BY created_at ASC
        """).fetchall()

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
            "INSERT INTO collections (title, theme, content, thought_ids, period) VALUES (?, ?, ?, ?, ?)",
            (f"{theme} · 随想录", theme, content, ids_str, period)
        )
        conn.commit()

    # 打标签（本地关键词匹配）
    tag_map = {
        "创作与灵感": ["创作", "写作", "灵感", "故事", "小说", "诗"],
        "生活观察": ["生活", "观察", "日常", "感受", "体验"],
        "技术思考": ["技术", "代码", "AI", "程序", "算法", "模型"],
        "阅读笔记": ["读", "书", "作者", "章节", "摘记"],
    }
    for t in thoughts:
        matched = [tag for tag, kws in tag_map.items()
                   if any(kw in t["content"] for kw in kws)]
        if matched:
            conn.execute("UPDATE thoughts SET tags=? WHERE id=?",
                         (",".join(matched), t["id"]))
    conn.commit()
    print(f"✅ 整理完成，生成了 {len(themes)} 个主题文集")
