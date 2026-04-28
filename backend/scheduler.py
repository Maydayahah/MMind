from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


def start_scheduler():
    from ai_worker import organize_thoughts

    _scheduler.add_job(
        organize_thoughts,
        trigger=CronTrigger(hour=2, minute=0),  # 每天凌晨 2:00
        id="daily_organize",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    print("[Scheduler] 定时整理任务已启动（每日 02:00 Asia/Shanghai）")


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[Scheduler] 已停止")
