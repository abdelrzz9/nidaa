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
    echo "==> Compiling GSettings schema …"
    glib-compile-schemas "$UUID/schemas/"
    EXT_SCHEMA_DIR="$HOME/.local/share/glib-2.0/schemas"
    mkdir -p "$EXT_SCHEMA_DIR"
    cp "$UUID/schemas/"*.compiled "$EXT_SCHEMA_DIR/"
    cp "$UUID/schemas/"*.gschema.xml "$EXT_SCHEMA_DIR/"
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
