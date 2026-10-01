# Brand asset manifest

Hashes below are SHA-256 of the checked-in source bytes. The source images are preserved; Admin explicitly selects “Use supplied default” or uploads a replacement. Neither business asset silently replaces generic ServOS product identity.

| Source asset | Source dimensions / format | Purpose and configured use | Derived output | SHA-256 |
|---|---|---|---|---|
| `APP-LOGO.png` | 2000 × 2000, PNG | Optional property app emblem; Admin opt-in in Business branding settings | White-composited, aspect-preserving JPEG at no more than 720 × 360 and 240,000 encoded characters | `BBE8277B3E5394371C2B1F62A3F8742F0F83167D8C9F619200CB418D534C45C6` |
| `reciept-logo.png` | 1374 × 1088, PNG | Optional customer receipt logo; Admin opt-in in Business branding settings | White-composited display JPEG plus monochrome thermal raster bounded to 576 × 220 dots; captured with the receipt branding version | `1DD07A970A8C4C65A2E82648601AA7698B545D1BFD706EC88A8D10F921A7C5E4` |
| `public/icons/servos-192.svg` | 192 × 192, SVG | Generic ServOS favicon/PWA icon | None | `051156042EBCDF6D79B9CA8A8E17E74EED93462CA077C7B0CDBD6DF7C9E98CFD` |
| `public/icons/servos-512.svg` | 512 × 512, SVG (`viewBox` 192 × 192) | Generic ServOS install icon | None | `66F10EE084BFB858F7933AE51C36022E5A08F379857192E5E516B9BCD52C552F` |
| `public/icons/servos-maskable.svg` | 512 × 512, SVG (`viewBox` 192 × 192) | Generic ServOS maskable install icon | None | `B0867A4ABE32E93358B4F4D2AD5DBC88E086F6B10487CD0F7B039D08DFD620E9` |

Thermal data is generated from the explicitly configured receipt logo during image normalization and stored in each new immutable receipt snapshot. It is not a mutable shared file; old reprints use their captured bytes. An incompatible/missing raster produces a text-only fallback. Actual XP-80T readability, scaling, alignment, feed and cut remain hardware acceptance gates.
