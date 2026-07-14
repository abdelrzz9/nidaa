/*
 * Adhkar detail view — scrollable dialog showing full adhkar text.
 *
 * When the user clicks "Open Adhkar" in a notification, this view
 * is displayed as a modal dialog with:
 *   - Category title (Morning / Evening / Post-Prayer)
 *   - Each dhikr showing Arabic text, transliteration, and translation
 *   - Repeat count indicator
 *   - Reference (surah/hadith)
 *
 * Uses GNOME Shell's St (Shell Toolkit) for rendering, following
 * the same patterns as the popup section (src/ui/popup/index.js).
 *
 * Usage:
 *   import { showAdhkarDetail } from './src/ui/adhkar/detail.js';
 *   showAdhkarDetail('morning');
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import { Main } from 'resource:///org/gnome/shell/ui/main.js';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { getAdhkarContent } from '../../core/adhkar/index.js';

const LOG_PREFIX = '[Nidaa:Adhkar:Detail]';

/** Category display titles. */
const CATEGORY_TITLES = {
  morning: 'Morning Adhkar',
  evening: 'Evening Adhkar',
  post_prayer: 'Post-Prayer Adhkar',
};

const CATEGORY_TITLES_FR = {
  morning: 'Adhkar du matin',
  evening: 'Adhkar du soir',
  post_prayer: 'Adhkar après la prière',
};

/**
 * Show the adhkar detail dialog for a given category.
 *
 * @param {'morning'|'evening'|'post_prayer'} category
 * @param {'en'|'fr'} [lang='en'] - Translation language
 */
export function showAdhkarDetail(category, lang = 'en') {
  const content = getAdhkarContent(category);
  if (!content || content.length === 0) {
    console.warn(`${LOG_PREFIX} no content for category "${category}"`);
    return;
  }

  const dialog = new ModalDialog({
    styleClass: 'nidaa-adhkar-dialog',
    destroyOnClose: true,
  });

  const contentLayout = dialog.contentLayout;
  contentLayout.set_style('max-width: 600px; max-height: 500px;');

  // --- Title ---
  const titleText = lang === 'fr'
    ? (CATEGORY_TITLES_FR[category] || category)
    : (CATEGORY_TITLES[category] || category);

  const titleLabel = new St.Label({
    text: titleText,
    style_class: 'nidaa-adhkar-title',
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.START,
  });
  contentLayout.add_child(titleLabel);

  // --- Scrollable content area ---
  const scrollView = new St.ScrollView({
    style_class: 'nidaa-adhkar-scroll',
    x_expand: true,
    y_expand: true,
    overlay_scrollbars: true,
  });

  const scrollBox = new St.BoxLayout({
    vertical: true,
    x_expand: true,
    style_class: 'nidaa-adhkar-scroll-box',
  });
  scrollView.set_child(scrollBox);

  // --- Render each dhikr ---
  for (let i = 0; i < content.length; i++) {
    const item = content[i];

    const dhikrBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      style_class: 'nidaa-adhkar-item',
    });

    // Separator between items (except first)
    if (i > 0) {
      const sep = new St.Label({
        text: '─'.repeat(40),
        style_class: 'nidaa-adhkar-separator',
        x_align: Clutter.ActorAlign.CENTER,
      });
      scrollBox.add_child(sep);
    }

    // Arabic text (right-to-left, larger font)
    const arabicLabel = new St.Label({
      text: item.arabic,
      style_class: 'nidaa-adhkar-arabic',
      x_align: Clutter.ActorAlign.END,
      x_expand: true,
    });
    // Set RTL and wrap mode for Arabic
    const arabicClutterText = arabicLabel.get_clutter_text();
    if (arabicClutterText) {
      arabicClutterText.set_layout_dirs(Clutter.TextDirection.RTL);
      arabicClutterText.set_line_wrap(true);
      arabicClutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    }
    dhikrBox.add_child(arabicLabel);

    // Repeat count (if > 1)
    if (item.repeat > 1) {
      const repeatText = lang === 'fr'
        ? (item.repeat_note_fr || `×${item.repeat}`)
        : (item.repeat_note_en || `×${item.repeat}`);
      const repeatLabel = new St.Label({
        text: `⟲ ${repeatText}`,
        style_class: 'nidaa-adhkar-repeat',
        x_align: Clutter.ActorAlign.CENTER,
      });
      dhikrBox.add_child(repeatLabel);
    }

    // Transliteration
    const transLabel = new St.Label({
      text: item.transliteration,
      style_class: 'nidaa-adhkar-transliteration',
      x_expand: true,
    });
    const transClutterText = transLabel.get_clutter_text();
    if (transClutterText) {
      transClutterText.set_line_wrap(true);
      transClutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    }
    dhikrBox.add_child(transLabel);

    // Translation
    const translation = lang === 'fr' ? item.translation_fr : item.translation_en;
    if (translation) {
      const transEnLabel = new St.Label({
        text: translation,
        style_class: 'nidaa-adhkar-translation',
        x_expand: true,
      });
      const transEnClutterText = transEnLabel.get_clutter_text();
      if (transEnClutterText) {
        transEnClutterText.set_line_wrap(true);
        transEnClutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
      }
      dhikrBox.add_child(transEnLabel);
    }

    // Reference
    if (item.reference) {
      const refLabel = new St.Label({
        text: `(${item.reference})`,
        style_class: 'nidaa-adhkar-reference',
        x_align: Clutter.ActorAlign.END,
      });
      dhikrBox.add_child(refLabel);
    }

    scrollBox.add_child(dhikrBox);
  }

  scrollView.set_child(scrollBox);
  contentLayout.add_child(scrollView);

  // --- Close button ---
  const closeButton = new St.Button({
    label: 'Close',
    style_class: 'nidaa-adhkar-close-button',
    x_align: Clutter.ActorAlign.CENTER,
    reactive: true,
    can_focus: true,
    track_hover: true,
  });
  closeButton.connect('clicked', () => dialog.close());
  contentLayout.add_child(closeButton);

  dialog.open();
  console.log(`${LOG_PREFIX} opened detail view for "${category}"`);
}

/**
 * Close the currently open adhkar detail dialog, if any.
 */
export function closeAdhkarDetail() {
  // ModalDialog handles its own lifecycle; nothing to do here.
  // This function exists for API symmetry.
}
