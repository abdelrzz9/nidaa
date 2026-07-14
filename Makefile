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

install: compile-schemas
	ln -sfn $(CURDIR)/$(SOURCE_DIR) \
		~/.local/share/gnome-shell/extensions/$(UUID)

compile-schemas:
	mkdir -p $(SOURCE_DIR)/schemas
	glib-compile-schemas $(SOURCE_DIR)/schemas/
	cp $(SOURCE_DIR)/schemas/gschemas.compiled \
	   ~/.local/share/glib-2.0/schemas/
	cp $(SOURCE_DIR)/schemas/org.gnome.shell.extensions.nidaa.gschema.xml \
	   ~/.local/share/glib-2.0/schemas/

uninstall:
	rm -f ~/.local/share/gnome-shell/extensions/$(UUID)

clean:
	rm -f $(PACKAGE_FILE)
