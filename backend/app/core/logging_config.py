import os
import sys
import threading
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional


class DailyFileHandler(logging.Handler):
    """
    A thread-safe logging handler that writes log records into daily dated text files.
    Format: {log_dir}/{prefix}_{YYYY-MM-DD}.log (e.g. backend/logs/app_2026-11-23.log)

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

    def flush(self):
        self.acquire()
        try:
            if self._stream:
                self._stream.flush()
        except Exception:
            pass
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
    Cleans up daily log files older than the configured retention period.
    """
    try:
        now = datetime.now()
        for log_file in log_dir.glob(f"{prefix}_*.log"):
            try:
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
    1. Daily dated text file logging in both backend/logs and project root logs/
    2. Synchronized console output for active terminal monitoring
    3. Structured layout with millisecond timestamps, level, module, function, line number, and messages
    4. Integration with uvicorn, fastapi, and sys/thread unhandled exception hooks
    """
    # 1. Resolve log directory paths
    # We resolve backend/logs as primary, ensuring it is always created and written to
    backend_root = Path(__file__).resolve().parent.parent.parent
    project_root = backend_root.parent

    target_dirs = []
    if log_dir:
        custom_dir = Path(log_dir)
        if not custom_dir.is_absolute():
            custom_dir = backend_root / log_dir
        target_dirs.append(custom_dir)
    else:
        target_dirs.append(backend_root / "logs")
        if (project_root / "logs").exists() or not (backend_root / "logs").exists():
            target_dirs.append(project_root / "logs")

    for d in target_dirs:
        d.mkdir(parents=True, exist_ok=True)

    primary_log_dir = target_dirs[0]

    # 2. Format string designed for fast & precise debugging
    detailed_format = (
        "%(asctime)s.%(msecs)03d | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s"
    )
    date_format = "%Y-%m-%d %H:%M:%S"
    formatter = logging.Formatter(fmt=detailed_format, datefmt=date_format)

    # 3. Configure root logger
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove any existing handlers
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # 4. Add Daily Dated File Handlers
    daily_handlers = []
    for d in target_dirs:
        h = DailyFileHandler(log_dir=d, filename_prefix=filename_prefix, encoding="utf-8")
        h.setLevel(numeric_level)
        h.setFormatter(formatter)
        root_logger.addHandler(h)
        daily_handlers.append(h)

    # 5. Add Console (Stdout) Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 6. Hook into Uvicorn and FastAPI loggers so server events and internal exceptions are captured in file
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        l = logging.getLogger(logger_name)
        l.setLevel(numeric_level)
        l.handlers = []
        l.propagate = True

    # 7. Silence excessive third-party chatter
    for noisy_lib in (
        "watchfiles",
        "watchfiles.main",
        "apscheduler",
        "apscheduler.scheduler",
        "apscheduler.executors.default",
        "httpcore",
        "httpx",
        "asyncio",
    ):
        noisy_logger = logging.getLogger(noisy_lib)
        noisy_logger.setLevel(logging.WARNING)
        noisy_logger.handlers = []
        noisy_logger.propagate = False

    # 8. Unhandled Exception Hooks for sys & threading
    def handle_uncaught_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        root_logger.critical("Uncaught system exception:", exc_info=(exc_type, exc_value, exc_traceback))
        for h in daily_handlers:
            h.flush()

    sys.excepthook = handle_uncaught_exception

    def handle_thread_exception(args):
        if issubclass(args.exc_type, KeyboardInterrupt):
            return
        root_logger.critical(f"Uncaught thread exception in {args.thread.name}:", exc_info=(args.exc_type, args.exc_value, args.exc_traceback))
        for h in daily_handlers:
            h.flush()

    if hasattr(threading, "excepthook"):
        threading.excepthook = handle_thread_exception

    # 9. Clean up old logs in all target directories
    for d in target_dirs:
        prune_old_logs(d, retention_days=retention_days, prefix=filename_prefix)

    # Return primary active log file path
    return daily_handlers[0].file_path
