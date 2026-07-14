# Tests

GNOME Shell extension code is tightly coupled to the Shell runtime and
cannot easily be unit-tested outside of it. Pure logic modules (prayer
calculations, location parsing, Hijri date math) will be tested with
plain **GJS** scripts run via `gjs`:

```bash
gjs tests/test-prayer-times.js
```

UI components and Shell integration code will be tested manually until
a suitable testing framework (e.g., gnome-shell's own test harness or
mocking library) is introduced.
