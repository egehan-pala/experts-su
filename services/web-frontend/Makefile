.PHONY: all dev build start lint install

# Default target
all: dev

install:
	npm install

dev: install
	./node_modules/.bin/next dev

build: install
	./node_modules/.bin/next build

start: install
	./node_modules/.bin/next start

lint: install
	./node_modules/.bin/eslint .
