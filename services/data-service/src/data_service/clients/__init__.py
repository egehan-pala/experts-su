"""Clients for external services (OpenAlex API, database).

This package provides thin wrappers around HTTP and database connections to
external services. Having dedicated client objects makes it easier to
mock dependencies in unit tests and isolates network logic from the ETL
workflow.
"""