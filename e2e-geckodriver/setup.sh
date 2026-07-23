#!/usr/bin/env bash
# One-time setup for the Selenium/geckodriver Firefox E2E harness.
# Fetches a NON-SNAP Firefox + geckodriver — snap Firefox is sandboxed and can't be
# driven by geckodriver. Idempotent: re-running only fetches what's missing.
#
# The Selenium client itself is an npm devDependency (selenium-webdriver), so no pip here.
set -euo pipefail

GECKO_VER=${GECKO_VER:-v0.36.0}
# Pin Firefox so the PR gate is deterministic (a red run means your change broke, not that
# Firefox shipped a release). The canary sets FIREFOX_VER=latest for early-warning signal.
FIREFOX_VER=${FIREFOX_VER:-142.0}
# Version-keyed cache dir so pinned and canary installs don't clobber each other on a
# persistent (self-hosted) runner. Override with FIREFOX_DIR if you need a fixed path.
FIREFOX_DIR=${FIREFOX_DIR:-$HOME/.local/firefox-nonsnap-$FIREFOX_VER}
GECKO_BIN=${GECKO_BIN:-$HOME/.local/bin/geckodriver}

# Single cleanup trap for any temp dirs the blocks below create (guarded for `set -u`).
tmp='' ff_tmp=''
trap 'rm -rf "${tmp:-}" "${ff_tmp:-}"' EXIT

if [[ ! -x "$GECKO_BIN" ]]; then
    echo "[setup] installing geckodriver $GECKO_VER -> $GECKO_BIN"
    mkdir -p "$(dirname "$GECKO_BIN")"
    tmp=$(mktemp -d)
    curl -fsSL "https://github.com/mozilla/geckodriver/releases/download/$GECKO_VER/geckodriver-$GECKO_VER-linux64.tar.gz" \
        | tar -xz -C "$tmp"
    install -m 0755 "$tmp/geckodriver" "$GECKO_BIN"
fi
"$GECKO_BIN" --version | head -1

# `latest` must re-download every run — a version-keyed dir named "latest" would otherwise
# freeze the first resolved binary forever on a self-hosted runner.
if [[ "$FIREFOX_VER" == "latest" ]]; then
    rm -rf "$FIREFOX_DIR"
fi

if [[ ! -x "$FIREFOX_DIR/firefox/firefox" ]]; then
    echo "[setup] downloading non-snap Firefox $FIREFOX_VER -> $FIREFOX_DIR"
    mkdir -p "$FIREFOX_DIR"
    if [[ "$FIREFOX_VER" == "latest" ]]; then
        firefox_url="https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
    else
        firefox_url="https://ftp.mozilla.org/pub/firefox/releases/$FIREFOX_VER/linux-x86_64/en-US/firefox-$FIREFOX_VER.tar.xz"
    fi
    ff_tmp=$(mktemp -d)
    curl -fsSL "$firefox_url" -o "$ff_tmp/firefox.tar.xz"
    tar -xJf "$ff_tmp/firefox.tar.xz" -C "$FIREFOX_DIR"
fi
"$FIREFOX_DIR/firefox/firefox" --version

echo "[setup] OK — run: pnpm zip:firefox && pnpm test:e2e:gecko"
