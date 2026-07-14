UUID = nidaa@abdelrzz9
SOURCE_DIR = $(UUID)
PACKAGE_FILE = $(UUID).zip

.PHONY: all clean install pack

all: pack

pack:
	gnome-extensions pack $(SOURCE_DIR) \
		--force \
		--out-dir=. \
		--extra-source=src \
		--extra-source=assets \
		--extra-source=stylesheet.css

install:
	ln -sfn $(CURDIR)/$(SOURCE_DIR) \
		~/.local/share/gnome-shell/extensions/$(UUID)

uninstall:
	rm -f ~/.local/share/gnome-shell/extensions/$(UUID)

clean:
	rm -f $(PACKAGE_FILE)
