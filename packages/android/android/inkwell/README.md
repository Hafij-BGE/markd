# Inkwell

Handwritten notes and PDF annotation for Android, modelled on Xournal++ 1.3.8.

- **Notes** are `.ink` files using the Xournal++ file structure (gzip XML, fileversion 4).
  Rename one to `.xopp` to open it in desktop Xournal++. Desktop `.xopp` files import directly.
- **Annotating a PDF** keeps a copy beside the note as `<note>.ink.bg.pdf` and never changes it.
- **Export as PDF** writes a vector PDF: original pages stay as they are (text stays selectable),
  and ink, text and images are drawn into the page content.
- Tools: pen (5 widths, solid/dash/dash-dot/dot, fill, pressure), highlighter, eraser
  (partial or whole stroke), text, image, line/rectangle/ellipse/arrow/double arrow/axes,
  shape recogniser, lasso and rectangle select (move, resize, duplicate, copy/cut/paste,
  recolour), hand tool, undo/redo, page add/duplicate/move/delete, layers, stylus-only mode.

## Build

    source ~/.android/inkwell-release.env
    ~/.local/opt/gradle-8.11.1/bin/gradle --offline assembleRelease

Icons are Lucide (ISC), as shipped with Xournal++; `tools/svg2vector.py` converts them.
PDF engine: PdfBox-Android 2.0.27.0 (Apache 2.0).
