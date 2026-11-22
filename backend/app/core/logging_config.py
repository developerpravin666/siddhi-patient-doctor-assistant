import os
import sys
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional


class DailyFileHandler(logging.Handler):
    """
    A thread-safe logging handler that writes log records into daily dated text files.
    Format: {log_dir}/{prefix}_{YYYY-MM-DD}.log (e.g. logs/app_2026-11-21.log)

    - Automatically transitions to a new dated file at midnight.
    - Uses UTF-8 encoding so emojis (WhatsApp icons, medical symbols) and multilingual
      messages are stored without encoding errors.
    - Flushes on every write so that logs are immediately readable during active debugging
      or following sudden system crashes.
    """

    def __init__(self, log_dir: Path, filename_prefix: str = "app", encoding: str = "utf-8"):
        super().__init__()
        self.log_dir = Path(log_dir)
        self.filename_prefix = filename_prefix
        self.encoding = encoding
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.current_date = datetime.now().strftime("%Y-%m-%d")
        self.file_path = self.log_dir / f"{self.filename_prefix}_{self.current_date}.log"
        self._stream = open(self.file_path, mode="a", encoding=self.encoding)

    def emit(self, record: logging.LogRecord):
        self.acquire()
        try:
            now_date = datetime.now().strftime("%Y-%m-%d")
            # Date changed at midnight - roll over to the new day's log file
            if now_date != self.current_date:
                self.current_date = now_date
                if self._stream:
                    try:
                        self._stream.flush()
                        self._stream.close()
                    except Exception:
                        pass
                self.file_path = self.log_dir / f"{self.filename_prefix}_{self.current_date}.log"
                self._stream = open(self.file_path, mode="a", encoding=self.encoding)

            msg = self.format(record)
            self._stream.write(msg + "\n")
            self._stream.flush()
        except Exception:
            self.handleError(record)
        finally:
            self.release()

    def close(self):
        self.acquire()
        try:
            if self._stream:
                try:
                    self._stream.flush()
                    self._stream.close()
                except Exception:
                    pass
                self._stream = None
        finally:
            self.release()
        super().close()


def prune_old_logs(log_dir: Path, retention_days: int = 30, prefix: str = "app"):
    """
    Optional maintenance helper to clean up log files older than the retention period.
    """
    try:
        now = datetime.now()
        for log_file in log_dir.glob(f"{prefix}_*.log"):
            try:
                # Extract date from filename app_YYYY-MM-DD.log
                date_str = log_file.stem.replace(f"{prefix}_", "")
                file_date = datetime.strptime(date_str, "%Y-%m-%d")
                age_days = (now - file_date).days
                if age_days > retention_days:
                    log_file.unlink(missing_ok=True)
            except Exception:
                continue
    except Exception:
        pass


def setup_logging(
    log_level: str = "INFO",
    log_dir: Optional[str] = None,
    filename_prefix: str = "app",
    retention_days: int = 30
) -> Path:
    """
    Configures application-wide logging with:
    1. Daily dated text file logging (e.g. backend/logs/app_YYYY-MM-DD.log)
    2. Synchronized console output for active terminal monitoring
    3. Structured, easy-to-debug layout with timestamps, level, module, function, line number, and messages
    4. Full stack traces when logger.error() or logger.exception() is triggered
    """
    # 1. Resolve log directory path (defaults to root logs/ directory)
    if log_dir:
        resolved_log_dir = Path(log_dir)
    else:
        # Place logs in project root logs/ to avoid reload watchers
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        resolved_log_dir = project_root / "logs"

    resolved_log_dir.mkdir(parents=True, exist_ok=True)

    # 2. Format string designed for fast & precise debugging
    # Example: 2026-11-21 21:15:30.124 | INFO     | webhook:receive_whatsapp_event:88 | Inbound WhatsApp event received
    detailed_format = (
        "%(asctime)s.%(msecs)03d | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s"
    )
    date_format = "%Y-%m-%d %H:%M:%S"
    formatter = logging.Formatter(fmt=detailed_format, datefmt=date_format)

    # 3. Configure root logger
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove any existing handlers to avoid duplicate log entries
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # 4. Add Daily Dated File Handler
    daily_file_handler = DailyFileHandler(
        log_dir=resolved_log_dir,
        filename_prefix=filename_prefix,
        encoding="utf-8"
    )
    daily_file_handler.setLevel(numeric_level)
    daily_file_handler.setFormatter(formatter)
    root_logger.addHandler(daily_file_handler)

    # 5. Add Console (Stdout) Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 6. Silence noisy third-party libraries so they NEVER spam the logs
    for noisy_lib in (
        "watchfiles",
        "watchfiles.main",
        "apscheduler",
        "apscheduler.scheduler",
        "apscheduler.executors.default",
        "uvicorn.access",
        "httpcore",
        "httpx",
        "asyncio",
    ):
        noisy_logger = logging.getLogger(noisy_lib)
        noisy_logger.setLevel(logging.WARNING)
        noisy_logger.handlers = []
        noisy_logger.propagate = False

    # 7. Clean up logs older than retention period
    prune_old_logs(resolved_log_dir, retention_days=retention_days, prefix=filename_prefix)

    # Return active log file path
    active_log_file = daily_file_handler.file_path
    return active_log_file
