#!/bin/bash
# Project Local CI script

echo "🔍 Running Backend Linting (Flake8)..."
cd backend
source venv/bin/activate
flake8 apps/ --count --show-source --statistics
LINT_EXIT=$?

if [ $LINT_EXIT -eq 0 ]; then
    echo "✅ Linting passed!"
else
    echo "❌ Linting failed! Fix errors before pushing."
    exit 1
fi

echo "🧪 Running Backend Tests (Pytest)..."
pytest --cov=apps --cov-report=term
TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ Tests passed!"
else
    echo "❌ Tests failed!"
    exit 1
fi

echo "📦 Verifying Frontend Build..."
cd ../e-commerce-app
npm run build
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    echo "✅ Frontend Build passed!"
else
    echo "❌ Frontend Build failed!"
    exit 1
fi

echo "🚀 ALL CHECKS PASSED. Ready to push!"
