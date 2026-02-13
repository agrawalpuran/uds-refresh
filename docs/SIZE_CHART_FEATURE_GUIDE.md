# Size Chart Feature – UDS (Myntra/Amazon Style)

## Current Data Modeling (Already Done)

### ProductSizeChart model (`lib/models/ProductSizeChart.ts`)

- **One size chart per product** (unique on `productId`).
- **Image-based**: stores a single image URL per product.
  - `productId` – reference to Uniform (product)
  - `imageUrl` – path to size chart image (e.g. `/uploads/size-charts/product-200001.jpg`)
  - `imageType` – jpg | jpeg | png | webp
  - `fileName`, `fileSize` – metadata

**Flow today:**  
"View Size Chart" link is shown **only when** a size chart record exists for that product. On click, a modal opens and shows the image (what M, L, etc. mean + measurements, if you put that in the image).

---

## How Myntra/Amazon Show Size Charts

1. **Static link on every product**  
   "Size Guide" or "Size Chart" is always visible (not conditional on data).
2. **On click**  
   - Either an **image** (one pic with M, L, XL and measurements), or  
   - A **table** (Size | Chest | Length | Shoulder | etc.) in a modal/sheet.

Your current model supports the **image** approach. The **table** approach would need an optional structured size chart (see below).

---

## Implementation Options

### Option A – Static link + image only (current model)

- **Static link:** Always show "Size Guide" / "View Size Chart" on every product card.
- **On click:**
  - If product has a size chart image → open modal and show that image (M, L, measurements as in the image).
  - If no size chart → open modal with message: "Size chart not available for this product" (or a category default image later).

No schema change. Only UI: always render the link and handle missing chart in the modal.

### Option B – Add structured size chart (table like Myntra/Amazon)

- **Extend model** with optional measurements:
  - e.g. `measurements?: Array<{ size: string; chest?: number; length?: number; shoulder?: number; ... }>`  
  - Or a separate collection `ProductSizeChartMeasurements` keyed by `productId`.
- **Modal behaviour:**
  - If product has **image** → show image.
  - If product has **measurements** → show table (Size | Chest | Length | …).
  - If both → show both (e.g. image on top, table below).

Requires: schema change, API changes, and admin UI to enter measurements.

### Option C – Category-level default image

- **Static link** (as in A).
- If product has no size chart, **fallback** to a category-level default image (e.g. "Shirt Size Guide", "Pant Size Guide") stored by category.
- Model: e.g. `CategorySizeChart` with `category` + `imageUrl`, or a config map category → imageUrl.

---

## Recommended path

1. **Implement Option A now**  
   - Static "Size Guide" link on every product.  
   - Modal shows image when present, otherwise a clear “not available” message.  
   - Uses your existing `ProductSizeChart` model and APIs; no DB changes.

2. **Later (if you want table + measurements)**  
   - Add Option B: optional measurements array or collection, extend API and modal to show a table when present.

3. **Optional**  
   - Add Option C for category default images so every product can show at least a generic size guide when product-specific one is missing.

---

## File storage (unchanged)

- **Path:** `public/uploads/size-charts/`
- **Naming:** `product-{productId}.{ext}` (e.g. `product-200001.jpg`)
- **Content:** One image per product that explains what S, M, L, XL mean and measurements (in inches/cm) – same idea as Myntra/Amazon size guide images.
