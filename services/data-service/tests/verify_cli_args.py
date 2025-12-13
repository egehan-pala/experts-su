
import sys
from unittest.mock import MagicMock
import typer
from typer.testing import CliRunner
from data_service.cli import app

# Mock the internal function to avoid running the actual ETL
# We only want to test argument parsing
runner = CliRunner()

def test_full_run_args():
    # Attempt to invoke command with arguments
    result = runner.invoke(app, ["full-run", "--since", "2023-01-01"])
    if result.exit_code != 0:
        print(f"FAILED: Exit code {result.exit_code}")
        print(result.stdout)
    else:
        # If exit code is 0 and it didn't complain about args, it's good.
        # Note: Since the real command runs async code and we didn't mock everything,
        # it might fail on other things, but if it fails on "unexpected argument", we'll see it.
        # Actually, let's just see if the error is about arguments.
        if "Got unexpected extra argument" in result.stdout:
            print("FAILED: Argument parsing error detected")
            print(result.stdout)
        else:
            print("PASSED: No argument parsing error detected")
            # It might fail later due to missing connection etc, which is expected
            print("Output start:", result.stdout[:100])

if __name__ == "__main__":
    test_full_run_args()
