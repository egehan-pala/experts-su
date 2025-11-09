"""Configuration management for the data-service.

This module defines a Pydantic settings class that reads configuration
parameters from environment variables or an optional `.env` file. Having
centralised configuration simplifies testing and deployment since each
component of the service can depend on the same settings object.
"""

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables or a `.env` file."""

    # OpenAlex API configuration
    openalex_base_url: str = Field(
        "https://api.openalex.org", env="OPENALEX_BASE_URL", description="Base URL for OpenAlex API"
    )
    openalex_ror_id: str = Field(
        ..., env="OPENALEX_ROR_ID", description="ROR identifier for the target institution"
    )
    openalex_rate_limit_per_min: int = Field(
        60,
        env="OPENALEX_RATE_LIMIT_PER_MIN",
        description="Maximum number of API requests allowed per minute",
    )
    openalex_mailto: str | None = Field(
        None,
        env="OPENALEX_MAILTO",
        description="Optional email used to identify the caller to OpenAlex (polite pool)",
    )

    # Database configuration
    db_host: str = Field(..., env="DB_HOST", description="Database host")
    db_port: int = Field(5432, env="DB_PORT", description="Database port")
    db_name: str = Field(..., env="DB_NAME", description="Database name")
    db_user: str = Field(..., env="DB_USER", description="Database user")
    db_password: str = Field(..., env="DB_PASSWORD", description="Database password")

    # Operational parameters
    batch_size: int = Field(
        100, env="BATCH_SIZE", description="Batch size for API pagination and bulk inserts"
    )
    since_default: str = Field(
        "2020-01-01",
        env="SINCE_DEFAULT",
        description="Default ISO date used when --since is not provided on the CLI",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_settings() -> Settings:
    """Return a singleton settings object.

    Lazily instantiate the Settings class on first call. Reuse the same
    instance thereafter so that environment variables are not reloaded
    repeatedly.
    """
    global _SETTINGS
    try:
        return _SETTINGS
    except NameError:
        _SETTINGS = Settings()  # type: ignore[name-defined]
        return _SETTINGS