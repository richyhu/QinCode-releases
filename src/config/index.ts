import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { CustomModelConfig } from '../api/index.js';

export interface QinCodeConfig {
  defaultModel: string;
  defaultPlatform: string;
  customModels: CustomModelConfig[];
  shellPermission: 'auto' | 'confirm' | 'deny';
  permissionMode: 'default' | 'plan' | 'auto';
  theme: 'dark' | 'light';
  language: 'zh' | 'en';
  vimMode: boolean;
}

const DEFAULT_CONFIG: QinCodeConfig = {
  defaultModel: 'deepseek-v4-flash',
  defaultPlatform: 'deepseek',
  customModels: [],
  shellPermission: 'confirm',
  permissionMode: 'default',
  theme: 'dark',
  language: 'zh',
  vimMode: false,
};

function configPath(): string {
  return join(homedir(), '.config', 'qincode', 'config.json');
}

export async function readConfig(): Promise<QinCodeConfig> {
  try {
    const raw = await readFile(configPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: QinCodeConfig): Promise<void> {
  const dir = join(homedir(), '.config', 'qincode');
  await mkdir(dir, { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export async function addCustomModel(model: CustomModelConfig): Promise<void> {
  const config = await readConfig();
  config.customModels = config.customModels.filter((m) => m.id !== model.id);
  config.customModels.push(model);
  await writeConfig(config);
}

export async function removeCustomModel(id: string): Promise<void> {
  const config = await readConfig();
  config.customModels = config.customModels.filter((m) => m.id !== id);
  await writeConfig(config);
}

export const BUILTIN_MODELS = [
  { id: 'deepseek-v4-flash',   name: 'DeepSeek V4 Flash',  platform: 'deepseek' as const, description: '快速模型 · 1M 上下文' },
  { id: 'LongCat-2.0-Preview', name: 'LongCat 2.0',        platform: 'longcat'  as const, description: '高性能 Agentic 模型 · 1M 上下文' },
];
