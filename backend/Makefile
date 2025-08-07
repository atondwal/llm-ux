.PHONY: test type-check lint all clean

# Run all checks
all: type-check test lint

# Run tests with coverage
test:
	source .venv/bin/activate && python -m pytest tests/ -v

# Run type checking
type-check:
	source .venv/bin/activate && mypy src/ --strict

# Run linting
lint:
	source .venv/bin/activate && ruff check src/ tests/

# Clean up generated files
clean:
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -f .coverage
	find . -type d -name __pycache__ -exec rm -rf {} +

# Install dependencies
install:
	uv venv
	source .venv/bin/activate && uv pip install -r requirements.txt

# Run the development server
dev:
	source .venv/bin/activate && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000