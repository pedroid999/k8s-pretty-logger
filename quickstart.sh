#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 K8s Pretty Logger Quickstart Script"
echo "======================================"

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "❌ uv is not installed. Please install it first with:"
    echo "curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "✅ uv is installed"

# Create a virtual environment
echo "📦 Creating virtual environment..."
uv venv

# Activate the virtual environment
echo "🔌 Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
uv sync

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file from template..."
    cp sample.env .env
    echo "📝 Please edit the .env file with your own configuration"
fi

# Start the web interface
echo "🌐 Starting the web interface..."
echo "Press Ctrl+C to exit"
uv run app.py 