#!/usr/bin/env python3
"""Convert image to ASCII art for terminal display."""
import sys
from PIL import Image

def image_to_ascii(image_path, width=40, height=20):
    """Convert image to ASCII art with better quality."""
    # More characters for better detail
    chars = " .:-=+*#%@"
    
    img = Image.open(image_path)
    img = img.convert('L')  # Grayscale
    
    # Maintain aspect ratio
    aspect_ratio = img.height / img.width
    new_height = int(width * aspect_ratio * 0.5)  # Adjust for terminal character aspect ratio
    img = img.resize((width, new_height))
    
    ascii_art = []
    for y in range(new_height):
        line = ""
        for x in range(width):
            pixel = img.getpixel((x, y))
            # Invert: darker pixels should be more dense characters
            inverted_pixel = 255 - pixel
            char_idx = min(len(chars) - 1, inverted_pixel * (len(chars) - 1) // 255)
            line += chars[char_idx]
        ascii_art.append(line)
    
    return "\n".join(ascii_art)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: image2ascii.py <image_path> [width] [height]")
        sys.exit(1)
    
    image_path = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    height = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    
    try:
        ascii_art = image_to_ascii(image_path, width, height)
        print(ascii_art)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)