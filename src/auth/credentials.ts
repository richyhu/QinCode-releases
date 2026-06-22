import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const CREDENTIALS_PATH = join(homedir(), '.config', 'qincode', 'credentials.json');

export interface PlatformApiKey {
  platform: string;
  apiKey: string;
}

export async function readCredentials(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function writeCredentials(data: Record<string, string>): Promise<void> {
  const dir = join(homedir(), '.config', 'qincode');
  await mkdir(dir, { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getApiKey(platform: string): Promise<string | undefined> {
  const creds = await readCredentials();
  return creds[`api_key_${platform}`];
}

export async function setApiKey(platform: string, apiKey: string): Promise<void> {
  const creds = await readCredentials();
  creds[`api_key_${platform}`] = apiKey;
  await writeCredentials(creds);
}

export function credentialsPath(): string {
  return CREDENTIALS_PATH;
}
