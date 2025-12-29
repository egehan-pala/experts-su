#!/bin/bash
# Helper script to run the image scraper

# Activate virtual environment
source venv/bin/activate

# Go to data service directory
cd services/data-service

# Run the scraper
echo "Starting Image Scraper..."
export PYTHONPATH=$PYTHONPATH:$(pwd)/src
python3 -m data_service.cli scrape-images

# Go back
cd ../..
echo "Done."
