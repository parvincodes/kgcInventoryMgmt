# Photo test set

Each entry in `manifest.json` is one shelf photo and the items a reviewer would expect to see in it.

```json
{
  "photos": [
    {
      "file": "kitchen-shelf-1.jpg",
      "location": "Shelves",
      "expect": [
        { "name": "Atta flour" },
        { "name": "Basmati rice", "count": 1 }
      ]
    }
  ]
}
```

- `file` is relative to this folder. JPEG, PNG and WebP work.
- `location` is one of Kitchen, Shelves, Fridge, Freezer.
- `name` matches loosely: case and punctuation are ignored, and "Atta" matches "Atta flour".
- `count` is optional. Leave it out to check only the name.

Run with `npm run test:photos`. It calls Claude, so it costs a few cents per photo.
Set `PHOTO_MIN_RECALL` (default 0.8) to change the pass mark.
