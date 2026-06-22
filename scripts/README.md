# QinCode Releases

QinCode CLI 二进制分发仓库。

## 安装

```bash
curl -fsSL https://github.com/richyhu/qincode-releases/raw/main/install.sh | bash
```

或指定版本：

```bash
curl -fsSL https://github.com/richyhu/qincode-releases/raw/main/install.sh | QINCODE_VERSION=0.1.0-build.2740 bash
```

## 手动下载

从 [Releases](https://github.com/richyhu/qincode-releases/releases) 页面下载对应平台的二进制文件。

## 支持平台

| 平台 | 架构 | 文件名 |
|------|------|--------|
| macOS | ARM64 (Apple Silicon) | qincode-darwin-arm64 |
| macOS | x64 (Intel) | qincode-darwin-x64 |
| Linux | x64 | qincode-linux-x64 |
| Linux | ARM64 | qincode-linux-arm64 |

## 校验

每个 Release 附带 `manifest.json`，包含各平台二进制的 sha256 校验值。
