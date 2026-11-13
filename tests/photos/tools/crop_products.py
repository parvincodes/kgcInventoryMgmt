"""
Cut each product out of a shelf photo into its own image.

usage: python3 tests/photos/tools/crop_products.py <photo> <spec.json> <outdir>

spec.json is a list of products. Each box is [x0, y0, x1, y1] in pixels of the original photo:
  [{"name": "Tata Salt", "location": "Shelves", "box": [0, 455, 180, 560]}, ...]

Writes:
  <outdir>/<slug>.jpg     one crop per product
  <outdir>/crops.json     name, location, file and box for each crop
  <outdir>/_contact.jpg   all crops on one sheet, for checking boxes by eye
"""
import json
import os
import re
import sys

from PIL import Image, ImageDraw


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    photo_path, spec_path, outdir = sys.argv[1:]
    os.makedirs(outdir, exist_ok=True)
    photo = Image.open(photo_path).convert("RGB")
    W, H = photo.size
    spec = json.load(open(spec_path))

    records = []
    crops = []
    for p in spec:
        x0, y0, x1, y1 = [int(v) for v in p["box"]]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(W, x1), min(H, y1)
        if x1 - x0 < 8 or y1 - y0 < 8:
            sys.exit(f"box for {p['name']} is too small or outside the photo: {p['box']}")
        fname = f"{slug(p['name'])}.jpg"
        crop = photo.crop((x0, y0, x1, y1))
        crop.save(os.path.join(outdir, fname), quality=92)
        records.append({"name": p["name"], "location": p.get("location", ""), "file": fname, "box": [x0, y0, x1, y1]})
        crops.append((p["name"], crop))

    json.dump(records, open(os.path.join(outdir, "crops.json"), "w"), indent=2, ensure_ascii=False)

    # Contact sheet: each crop scaled to 160px tall, with its name underneath.
    cell_h, label_h, pad = 160, 26, 10
    scaled = []
    for name, c in crops:
        w = int(c.width * cell_h / c.height)
        scaled.append((name, c.resize((w, cell_h))))
    row_w = 1100
    rows, row, row_x = [], [], 0
    for item in scaled:
        if row and row_x + item[1].width + pad > row_w:
            rows.append(row)
            row, row_x = [], 0
        row.append(item)
        row_x += item[1].width + pad
    if row:
        rows.append(row)
    sheet_h = sum(cell_h + label_h + pad for _ in rows)
    sheet = Image.new("RGB", (row_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for row in rows:
        x = 0
        for name, im in row:
            sheet.paste(im, (x, y))
            draw.text((x, y + cell_h + 4), name[:28], fill="black")
            x += im.width + pad
        y += cell_h + label_h + pad
    sheet.save(os.path.join(outdir, "_contact.jpg"), quality=90)
    print(f"wrote {len(records)} crops to {outdir}")


if __name__ == "__main__":
    main()
