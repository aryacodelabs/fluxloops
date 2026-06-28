# Planned features

Backlog items scheduled for upcoming development. See [GitHub issues](https://github.com/aryacodelabs/fluxloops/issues) for discussion.

---

## 1. Export dependency table to Excel (`.xlsx`)

**Status:** Done (v0.2.0)  
**Target:** v0.2.0  
**Priority:** High

### Summary

Add an **Export to Excel** action on the **Table** tab that downloads the current filtered dependency table as an `.xlsx` file.

### User story

As a Fluxor developer reviewing dependencies, I want to export the dependency table to Excel so I can share, annotate, or pivot the data outside VS Code.

### Requirements

- Export reflects **current UI state**:
  - Active **project** filter
  - Active **feature** filter
  - Active **view** mode (reducer / effects / components / all)
  - All **column filters** applied in the table header row
- Output file name pattern: `fluxloops-dependencies-{project}-{yyyy-MM-dd}.xlsx` (sanitized).
- Worksheet name: e.g. `Dependencies`.

### Excel format

| Column | Source field |
|--------|----------------|
| Project | `project` |
| Feature | `feature` |
| From kind | `fromKind` |
| From name | `fromName` |
| Relationship | `relationship` |
| To kind | `toKind` |
| To name | `toName` |
| File | `filePath` |

- **Header row:** bold, frozen pane (row 1).
- **Excel AutoFilter** enabled on the header row (dropdown filters in Excel).
- Optional: auto-width columns; wrap text on File column.

### Technical notes (implementation sketch)

- **UI:** `Export to Excel` button on the table toolbar (`d3GraphWebviewPanel.ts` HTML + `dependencyTable.ts` or `graph.js` webview).
- **Data path:** webview posts `exportTable` message with serialized rows → extension host writes file via `vscode.window.showSaveDialog` or default Downloads path.
- **Library options:**
  - `xlsx` / SheetJS (lightweight, common in Node)
  - or `exceljs` (richer styling + AutoFilter API)
- **Tests:** unit test row serialization; manual test with Ziji.Forms (~200+ rows, filters applied).

### Acceptance criteria

- [x] Button visible on Table tab when graph has rows
- [x] Exported file opens in Excel with filters on header row
- [x] Exported rows match on-screen filtered table exactly
- [x] Empty/filtered-to-zero state shows a clear message (no empty file surprise)

---

## 2. Export D3 graph to PNG

**Status:** Done (v0.2.0)  
**Target:** v0.2.0  
**Priority:** High

### Summary

Add **Export graph as PNG** on the **Graph** tab to save the current D3 visualization as an image file.

### User story

As a Fluxor developer documenting architecture, I want to export the dependency graph as a PNG so I can paste it into wiki pages, PRs, or design docs.

### Requirements

- Export **what the user sees** (current zoom/pan position and visible nodes/edges), or offer:
  - **Viewport** (default) — current SVG viewBox / zoom transform
  - **Full graph** (stretch goal) — fit all nodes into export bounds
- Respect active **project**, **feature**, **view**, and **search** filters.
- Output file name pattern: `fluxloops-graph-{feature}-{yyyy-MM-dd}.png`.
- Reasonable default resolution (e.g. 2× for retina); optional width/height in settings later.

### Technical notes (implementation sketch)

- **SVG → PNG approaches:**
  1. **Serialize SVG** in webview, draw to `<canvas>`, `canvas.toBlob('image/png')` (handle embedded styles).
  2. **`html2canvas`** on graph container (simpler, may miss some SVG styling).
  3. **d3-svg-export** or manual clone of SVG with inline computed styles (best fidelity).
- **CSP:** webview already allows scripts; may need blob URL + `postMessage` with base64 to extension host for `showSaveDialog`.
- **Extension host:** receive PNG bytes → save dialog → write file.
- **Edge cases:** very large graphs (218+ nodes) — show progress or cap export size; dark/light theme consistency.

### Acceptance criteria

- [x] Button visible on Graph tab when graph has nodes
- [x] PNG opens correctly in image viewer
- [x] Node colors, edge styles, and labels are readable
- [x] Export completes in &lt; 5s for typical project graphs (~200 nodes)

---

## Tracking

| Feature | Issue | Assignee | Target |
|---------|-------|----------|--------|
| Excel table export | TBD | — | v0.2.0 |
| D3 graph PNG export | TBD | — | v0.2.0 |

When work starts, open GitHub issues and link them here.