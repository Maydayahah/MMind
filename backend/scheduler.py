from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


def _generate_and_save_prompt():
    from ai_worker import generate_daily_prompt
    from database import get_today_prompt, save_today_prompt
    if not get_today_prompt():
        try:
            content = generate_daily_prompt()
            save_today_prompt(content)
            print(f"[Scheduler] 今日写作提示已生成：{content[:30]}…")
        except Exception as e:
            print(f"[Scheduler] 写作提示生成失败: {e}")


def start_scheduler():
    from ai_worker import organize_thoughts

    _scheduler.add_job(
        organize_thoughts,
        trigger=CronTrigger(hour=2, minute=0),
        id="daily_organize",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        _generate_and_save_prompt,
        trigger=CronTrigger(hour=8, minute=0),  # 每天早上 8:00 预生成提示
        id="daily_prompt",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    print("[Scheduler] 定时任务已启动（整理 02:00 / 提示 08:00 Asia/Shanghai）")


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[Scheduler] 已停止")
