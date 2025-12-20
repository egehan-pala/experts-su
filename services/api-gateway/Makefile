.PHONY: dev install run

install:
	pip install -r requirements.txt

dev: install
	uvicorn main:app --reload --port 8000

run:
	uvicorn main:app --host 0.0.0.0 --port 8000
