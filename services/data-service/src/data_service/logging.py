"""Structured logging helpers for the data-service.

Logging in a distributed ETL system should emit structured messages so that
they can be easily consumed by log aggregation systems. This module
configures Python's built‑in logging to use JSON formatting via the
`python-json-logger` package. All code in this repository should call
`configure_logging()` once at startup to set up the root logger.
"""

import logging
from typing import Optional

from pythonjsonlogger import jsonlogger


def configure_logging(level: int | str = logging.INFO) -> None:
    """Configure the root logger to emit JSON formatted logs.

    Parameters
    ----------
    level: int | str
        The logging level to set on the root logger. Defaults to
        ``logging.INFO``.
    """
    root_logger = logging.getLogger()

    # Avoid adding multiple handlers if called repeatedly
    if root_logger.handlers:
        return

    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(name)s %(levelname)s %(message)s",
        rename_fields={
            "levelname": "level",
            "asctime": "timestamp",
        },
    )
    handler.setFormatter(formatter)

    root_logger.setLevel(level)
    root_logger.addHandler(handler)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return a named logger configured for JSON output.

    Parameters
    ----------
    name: Optional[str]
        The name of the logger. If omitted, the root logger is returned.
    """
    return logging.getLogger(name)