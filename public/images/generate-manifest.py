#!/usr/bin/env python3
import os
import json

# Change working directory to where this script lives
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Define valid image extensions
valid_extensions = {".png", ".jpg", ".jpeg", ".webp"}

# Get sorted list of images in this folder
image_files = sorted([
    f for f in os.listdir(".") 
    if os.path.splitext(f)[1].lower() in valid_extensions
])

# Write clean JSON
with open("manifest.json", "w") as f:
    json.dump(image_files, f, indent=2)
