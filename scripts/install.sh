#!/usr/bin/env bash
#
# QinCode 安装脚本（macOS / Linux）
#
# 用法：
#   curl -fsSL https://github.com/richyhu/QinCode-releases/raw/main/install.sh | bash
#   curl -fsSL https://... | QINCODE_VERSION=0.1.0-build.2740 bash
#   curl -fsSL https://... | bash -s -- --version 0.1.0-build.2740
#
# 可选环境变量：
#   QINCODE_VERSION        指定版本；不填则自动获取最新
#   QINCODE_INSTALL_DIR    安装目录，默认 $HOME/.qincode
#   QINCODE_NO_MODIFY_PATH 设置后跳过 PATH 修改
#

set -euo pipefail

QINCODE_REPO="richyhu/QinCode-releases"
QINCODE_GITHUB_BASE="https://github.com/${QINCODE_REPO}"
QINCODE_API_BASE="https://api.github.com/repos/${QINCODE_REPO}"

QINCODE_VERSION="${QINCODE_VERSION:-}"
QINCODE_INSTALL_DIR="${QINCODE_INSTALL_DIR:-$HOME/.qincode}"
QINCODE_NO_MODIFY_PATH="${QINCODE_NO_MODIFY_PATH:-}"

QINCODE_PATH_UPDATED_RC=""

# 国内镜像配置
QINCODE_GITCODE_BASE="https://gitcode.com/richy_CBS/qincode"

# ── 工具函数 ──

_have() { command -v "$1" >/dev/null 2>&1; }

# 检测最佳下载源：国内 IP 用 gitcode，国外用 GitHub
_detect_mirror() {
  local tag="$1"
  # 允许用户手动强制指定源
  if [ -n "${QINCODE_MIRROR:-}" ]; then
    case "$QINCODE_MIRROR" in
      gitcode) echo "${QINCODE_GITCODE_BASE}/releases/download/${tag}"; return ;;
      github)  echo "${QINCODE_GITHUB_BASE}/releases/download/${tag}"; return ;;
    esac
  fi

  # 通过 IP 国家检测
  local country
  country="$(_download "https://ipapi.co/country/" 2>/dev/null || true)"
  if [ "$country" = "CN" ]; then
    echo "${QINCODE_GITCODE_BASE}/releases/download/${tag}"
    return
  fi

  # IP 检测失败时，测速选源：先尝试 gitcode（3 秒超时）
  if _have curl; then
    if curl --fail --location --max-time 3 --silent "${QINCODE_GITCODE_BASE}/releases/download/${tag}/manifest.json" >/dev/null 2>&1; then
      echo "${QINCODE_GITCODE_BASE}/releases/download/${tag}"
      return
    fi
  fi

  # 默认回退 GitHub
  echo "${QINCODE_GITHUB_BASE}/releases/download/${tag}"
}

_log() {
  if [ -t 1 ]; then
    printf '\033[1;36m==>\033[0m %s\n' "$*"
  else
    printf '==> %s\n' "$*"
  fi
}

_err() {
  printf '\033[1;31m错误：\033[0m %s\n' "$*" >&2
  exit 1
}

_parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)
        echo "用法: curl -fsSL https://github.com/richyhu/QinCode-releases/raw/main/install.sh | bash"
        exit 0 ;;
      --version)
        [ -n "${2:-}" ] || _err "--version 需要一个值"
        QINCODE_VERSION="$2"; shift 2 ;;
      --version=*)
        QINCODE_VERSION="${1#--version=}"
        [ -n "$QINCODE_VERSION" ] || _err "--version 需要一个值"
        shift ;;
      -*) _err "未知选项：$1" ;;
      *) QINCODE_VERSION="$1"; shift ;;
    esac
  done
}

_detect_target() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux"  ;;
    MINGW*|MSYS*|CYGWIN*)
      _err "暂不支持 Windows，请从 ${QINCODE_GITHUB_BASE}/releases 手动下载" ;;
    *) _err "不支持的操作系统：$(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch="x64"   ;;
    arm64|aarch64) arch="arm64" ;;
    *) _err "不支持的架构：$(uname -m)" ;;
  esac
  # Rosetta 2 检测：x64 shell 跑在 ARM Mac 上，用原生 arm64 二进制
  if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
      arch="arm64"
    fi
  fi
  echo "${os}-${arch}"
}

_download() {
  local url="$1" dest="${2:-}"
  if _have curl; then
    if [ -n "$dest" ]; then
      if [ -t 1 ]; then
        curl --fail --location --progress-bar -o "$dest" "$url"
      else
        curl --fail --location --silent -o "$dest" "$url"
      fi
    else
      curl --fail --location --silent "$url"
    fi
  elif _have wget; then
    if [ -n "$dest" ]; then
      wget -q -O "$dest" "$url"
    else
      wget -q -O - "$url"
    fi
  else
    _err "需要 curl 或 wget"
  fi
}

_json_field() {
  local json="$1" field="$2"
  if _have jq; then
    printf '%s' "$json" | jq -er ".$field // empty"
  else
    # 纯 bash 解析简单字符串字段
    local one_line
    one_line="$(printf '%s' "$json" | tr -d '\n\r\t' | sed 's/ \+/ /g')"
    if [[ $one_line =~ \"$field\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      printf '%s' "${BASH_REMATCH[1]}"
    fi
  fi
}

_manifest_checksum() {
  local manifest_json="$1" target="$2"
  if _have jq; then
    printf '%s' "$manifest_json" | jq -er ".platforms[\"$target\"].checksum // empty"
  else
    local one_line
    one_line="$(printf '%s' "$manifest_json" | tr -d '\n\r\t' | sed 's/ \+/ /g')"
    if [[ $one_line =~ \"$target\"[^}]*\"checksum\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      printf '%s' "${BASH_REMATCH[1]}"
    fi
  fi
}

_sha256_check() {
  local file="$1" expected="$2" actual
  if _have shasum; then
    actual="$(shasum -a 256 "$file" | cut -d' ' -f1)"
  elif _have sha256sum; then
    actual="$(sha256sum "$file" | cut -d' ' -f1)"
  else
    _err "需要 shasum 或 sha256sum 来校验下载文件"
  fi
  [ "$actual" = "$expected" ] || _err "校验失败（期望 $expected，实际 $actual）"
}

_detect_shell_rc() {
  local shell_name
  shell_name="$(basename "${SHELL:-/bin/bash}")"
  case "$shell_name" in
    zsh)  echo "$HOME/.zshrc" ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    bash)
      if   [ -f "$HOME/.bashrc"       ]; then echo "$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then echo "$HOME/.bash_profile"
      elif [ -f "$HOME/.profile"      ]; then echo "$HOME/.profile"
      else echo "$HOME/.bashrc"; fi ;;
    *) echo "$HOME/.profile" ;;
  esac
}

_update_path() {
  [ -z "$QINCODE_NO_MODIFY_PATH" ] || return 0
  case ":$PATH:" in
    *":${QINCODE_INSTALL_DIR}/bin:"*) return 0 ;;
  esac
  local rc export_line
  rc="$(_detect_shell_rc)"
  mkdir -p "$(dirname "$rc")"
  if [[ "$rc" == *fish* ]]; then
    export_line="fish_add_path -g \"${QINCODE_INSTALL_DIR}/bin\""
  else
    export_line="export PATH=\"${QINCODE_INSTALL_DIR}/bin:\$PATH\""
  fi
  if ! grep -qsF "${QINCODE_INSTALL_DIR}/bin" "$rc"; then
    printf '\n# qincode\n%s\n' "$export_line" >> "$rc"
    _log "已将 ${QINCODE_INSTALL_DIR}/bin 添加到 $rc"
    QINCODE_PATH_UPDATED_RC="$rc"
  fi
}

# ── 主流程 ──

TMPDIR_INSTALL=""
_cleanup() {
  [ -n "$TMPDIR_INSTALL" ] && [ -d "$TMPDIR_INSTALL" ] && rm -rf "$TMPDIR_INSTALL"
}
trap _cleanup EXIT

main() {
  _parse_args "$@"

  local target version tag release_json manifest checksum binary_url filename

  target="$(_detect_target)"
  _log "检测到平台：$target"

  # 1. 获取版本
  if [ -n "$QINCODE_VERSION" ]; then
    tag="${QINCODE_VERSION#v}"   # tag 与版本号一致（不含 v 前缀）
    version="$tag"
    _log "使用指定版本：$version"
  else
    _log "正在获取最新版本..."
    release_json="$(_download "${QINCODE_API_BASE}/releases/latest")"
    tag="$(_json_field "$release_json" "tag_name")"
    [ -n "$tag" ] || _err "无法获取最新版本，请检查网络"
    version="$tag"
    _log "最新版本：$version"
  fi

  # 2. 选择下载源并下载 manifest.json（含 sha256）
  local download_base
  download_base="$(_detect_mirror "$tag")"
  _log "使用下载源：${download_base}"

  local manifest_url="${download_base}/manifest.json"
  _log "正在获取 manifest..."
  manifest="$(_download "$manifest_url")"
  if [ -z "$manifest" ]; then
    # manifest 下载失败，回退到 GitHub
    _log "首选源失败，回退到 GitHub..."
    download_base="${QINCODE_GITHUB_BASE}/releases/download/${tag}"
    manifest_url="${download_base}/manifest.json"
    manifest="$(_download "$manifest_url")"
    [ -n "$manifest" ] || _err "manifest 为空或不可访问（GitHub 也失败了）"
  fi

  # 3. 从 manifest 取校验值
  checksum="$(_manifest_checksum "$manifest" "$target")"
  [[ "$checksum" =~ ^[a-f0-9]{64}$ ]] || _err "manifest 中找不到平台 $target 的校验值"

  # 4. 下载二进制
  filename="qincode-${target}"
  binary_url="${download_base}/${filename}"
  TMPDIR_INSTALL="$(mktemp -d)"
  _log "正在下载 ${binary_url}"
  if ! _download "$binary_url" "${TMPDIR_INSTALL}/${filename}"; then
    # 二进制下载失败，回退到 GitHub
    _log "首选源下载失败，回退到 GitHub..."
    download_base="${QINCODE_GITHUB_BASE}/releases/download/${tag}"
    binary_url="${download_base}/${filename}"
    _download "$binary_url" "${TMPDIR_INSTALL}/${filename}"
  fi

  # 5. 校验
  _log "正在校验..."
  _sha256_check "${TMPDIR_INSTALL}/${filename}" "$checksum"

  # 6. 安装
  chmod +x "${TMPDIR_INSTALL}/${filename}"
  mkdir -p "${QINCODE_INSTALL_DIR}/bin"
  if [ -f "${QINCODE_INSTALL_DIR}/bin/qincode" ]; then
    cp "${QINCODE_INSTALL_DIR}/bin/qincode" "${QINCODE_INSTALL_DIR}/bin/qincode.bak"
    _log "已备份旧版本到 qincode.bak"
  fi
  install -m 0755 "${TMPDIR_INSTALL}/${filename}" "${QINCODE_INSTALL_DIR}/bin/qincode"

  # macOS: remove quarantine attribute to avoid Gatekeeper blocking
  if [ "$(uname -s)" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "${QINCODE_INSTALL_DIR}/bin/qincode" 2>/dev/null || true
  fi

  _log "已安装到 ${QINCODE_INSTALL_DIR}/bin/qincode"

  # 7. 修改 PATH
  _update_path

  _log "安装完成！"
  "${QINCODE_INSTALL_DIR}/bin/qincode" --version 2>/dev/null || true

  if [ -n "$QINCODE_PATH_UPDATED_RC" ]; then
    if [ -t 1 ]; then
      printf '\033[1;33m==>\033[0m 如果 qincode 命令找不到，运行：\033[1msource %s\033[0m\n' "$QINCODE_PATH_UPDATED_RC"
    else
      printf '==> 如果 qincode 命令找不到，运行：source %s\n' "$QINCODE_PATH_UPDATED_RC"
    fi
  fi
}

main "$@"
