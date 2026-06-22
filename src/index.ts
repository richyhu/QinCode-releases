#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './ui/App.js';
import { readCredentials } from './auth/credentials.js';
import { loginOAuth, logoutOAuth } from './auth/oauth.js';
import { readConfig, writeConfig, addCustomModel, removeCustomModel, BUILTIN_MODELS } from './config/index.js';
import { loadSkills } from './skills/loader.js';

/**
 * Get version from build-time env var (injected by esbuild define).
 * Falls back to '0.0.0' for non-bundled runs.
 */
const QINCODE_VERSION = process.env.QINCODE_VERSION || '0.0.0';

const cli = meow(
  `
  Usage
    $ qincode [query]

  Commands
    qincode                  Start interactive mode
    qincode <query>          Single task mode
    qincode login            OAuth login
    qincode logout           Clear credentials
    qincode config model     Switch model
    qincode config add-model Add custom model
    qincode config list-models  List available models
    qincode skills           List loaded skills

  Options
    --help, -h  Show help
    --version   Show version
  `,
  {
    importMeta: import.meta,
    version: QINCODE_VERSION,
    flags: {
      help: { type: 'boolean', shortFlag: 'h' },
    },
  },
);

async function main() {
  const [cmd, subcmd] = cli.input;

  // Handle --version and --help explicitly (meow auto-handling may not work in SEA)
  if (cli.flags.version) {
    console.log(QINCODE_VERSION);
    process.exit(0);
  }
  if (cli.flags.help) {
    cli.showHelp();
    process.exit(0);
  }

  if (!cmd) {
    // Interactive mode
    process.stdout.write('\x1Bc'); // Clear terminal
    render(React.createElement(App), process.stdout);
    return;
  }

  switch (cmd) {
    case 'login': {
      console.log('正在打开浏览器进行 OAuth 登录...');
      try {
        const { default: open } = await import('open');
        const result = await loginOAuth(async (url) => {
          await open(url);
        });
        const { writeCredentials } = await import('./auth/credentials.js');
        await writeCredentials(result);
        console.log(`✅ 登录成功！欢迎 ${result.username}`);
      } catch (err: any) {
        console.error('❌ 登录失败:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'logout': {
      await logoutOAuth();
      console.log('✅ 已清除登录凭证');
      break;
    }

    case 'config': {
      const config = await readConfig();
      switch (subcmd) {
        case 'model': {
          console.log('可用模型:\n');
          for (const m of BUILTIN_MODELS) {
            const marker = config.defaultModel === m.id ? ' →' : '';
            console.log(`  ${m.name} (${m.id})${marker}`);
          }
          for (const m of config.customModels) {
            const marker = config.defaultModel === m.id ? ' →' : '';
            console.log(`  ${m.name} (${m.id}) [自定义]${marker}`);
          }
          break;
        }
        case 'add-model': {
          console.log('请输入自定义模型信息:');
          // Simple interactive prompt — in practice use inquirer or env vars
          // For now, a placeholder
          console.log('使用 qincode config add-model 交互式添加暂未实现');
          console.log('请直接编辑 ~/.config/qincode/config.json 中的 customModels');
          break;
        }
        case 'list-models': {
          console.log('内置模型:');
          for (const m of BUILTIN_MODELS) {
            console.log(`  ${m.name} (${m.id}) — ${m.platform}`);
          }
          if (config.customModels.length > 0) {
            console.log('\n自定义模型:');
            for (const m of config.customModels) {
              console.log(`  ${m.name} (${m.id}) — ${m.baseUrl}`);
            }
          }
          break;
        }
        default: {
          console.log('用法: qincode config {model|add-model|list-models}');
          break;
        }
      }
      break;
    }

    case 'skills': {
      const skills = loadSkills();
      if (skills.length === 0) {
        console.log('暂无已加载的技能。');
        console.log('技能文件放在 ~/.config/qincode/skills/ 或 .qincode/skills/ 目录下。');
      } else {
        console.log(`已加载 ${skills.length} 个技能:\n`);
        for (const s of skills) {
          console.log(`  ${s.name}: ${s.description}`);
          console.log(`    路径: ${s.path}`);
        }
      }
      break;
    }

    default: {
      // Treat as a query — single task mode
      const query = cli.input.join(' ');
      if (query) {
        render(React.createElement(App));
        // The app will enter interactive mode;
        // for true single-task mode we'd need to auto-submit the query
        // This is a simplified version
      } else {
        cli.showHelp();
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
