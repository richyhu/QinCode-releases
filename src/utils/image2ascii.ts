import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Convert image to ASCII art using Python script
 */
export function imageToAscii(imagePath: string, width = 40, height = 20): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const scriptPath = path.join(__dirname, '../../scripts/image2ascii.py');
    const result = execSync(`python3 "${scriptPath}" "${imagePath}" ${width} ${height}`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return result.trim();
  } catch (error) {
    console.error('Failed to convert image to ASCII:', error);
    return '';
  }
}