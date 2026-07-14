#!/usr/bin/env bash
set -euo pipefail

UUID="nidaa@abdelrzz9"

case "${1:-pack}" in
  pack)
    echo "==> Packaging extension …"
    gnome-extensions pack "$UUID" \
      --force \
      --out-dir=. \
      --extra-source=src \
      --extra-source=assets \
      --extra-source=stylesheet.css
    echo "==> Created $UUID.zip"
    ;;
  install)
    echo "==> Symlinking source dir into GNOME extensions …"
    mkdir -p ~/.local/share/gnome-shell/extensions
    ln -sfn "$(pwd)/$UUID" ~/.local/share/gnome-shell/extensions/"$UUID"
    echo "==> Installed (symlinked) $UUID"
    echo "==> Restart GNOME Shell (or log out/in on Wayland) to load."
    ;;
  uninstall)
    rm -f ~/.local/share/gnome-shell/extensions/"$UUID"
    echo "==> Removed symlink for $UUID"
    ;;
  *)
    echo "Usage: $0 {pack|install|uninstall}"
    exit 1
    ;;
esac
