"""Utilities for configuring retry behaviour with tenacity.

The tenacity library provides a flexible way to retry operations that fail
transiently (for example, due to network hiccups). This helper defines
a decorator that can be applied to asynchronous functions to apply
exponential backoff with jitter. Use this decorator for any calls
involving network requests or database interactions that may benefit from
retrying.
"""

from tenacity import retry, wait_exponential_jitter, stop_after_attempt, retry_if_exception_type
import httpx


def async_retry(retries: int = 5):
    """Return a tenacity decorator with sensible defaults for async operations.

    Parameters
    ----------
    retries: int
        The maximum number of retry attempts before giving up. Defaults to 5.

    Returns
    -------
    Callable
        A decorator configured for exponential backoff with jitter on common
        transient exceptions.
    """
    return retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential_jitter(initial=1, max=10),
        stop=stop_after_attempt(retries),
        reraise=True,
    )