import uvicorn
import sys
import os

# Add local directory to path
sys.path.append(os.getcwd())

try:
    from main import app
    print("Import successful. Starting uvicorn...")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="debug")
except Exception as e:
    print(f"FAILED TO START: {e}")
    import traceback
    traceback.print_exc()
