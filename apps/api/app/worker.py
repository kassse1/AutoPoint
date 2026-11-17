"""Background worker: `python -m app.worker`.

Delivers the notification outbox to Telegram and does periodic housekeeping. Safe to run
several copies (rows are claimed with SKIP LOCKED).
"""

import logging
import signal
import time
from datetime import UTC, datetime

from sqlalchemy import delete

from app.config import get_settings
from app.db import SessionLocal
from app.logs import setup_logging
from app.modules.auth.models import RefreshSession
from app.modules.notifications.telegram import is_configured, process_batch
from app.ratelimit import purge_old_counters

logger = logging.getLogger("app.worker")
POLL_SECONDS = 3
HOUSEKEEPING_SECONDS = 3600


def housekeeping(now: datetime) -> None:
    with SessionLocal.begin() as session:
        counters = purge_old_counters(session)
        sessions = session.execute(
            delete(RefreshSession).where(RefreshSession.expires_at < now)
        ).rowcount
    logger.info("Housekeeping: %s rate-limit rows, %s expired sessions removed", counters, sessions)


def main() -> None:
    setup_logging(get_settings().log_level)
    stop = False

    def _stop(*_: object) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    if not is_configured():
        logger.warning("Telegram is not configured: notifications stay queued in the outbox")
    last_housekeeping = 0.0
    while not stop:
        if time.monotonic() - last_housekeeping > HOUSEKEEPING_SECONDS:
            housekeeping(datetime.now(UTC))
            last_housekeeping = time.monotonic()
        sent = 0
        if is_configured():
            try:
                with SessionLocal() as session:
                    sent = process_batch(session, datetime.now(UTC))
            except Exception:
                logger.exception("Outbox batch failed; retrying shortly")
        if sent == 0:
            time.sleep(POLL_SECONDS)
    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
