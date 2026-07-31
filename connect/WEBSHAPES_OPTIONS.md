# HealthConnect Header - Image Options

## Currently Selected Image

The header currently uses: **`connection people.png`**

This image features abstract people/connection graphics that perfectly represent the LinkedIn networking theme.

## Available Webshape Images

All images are located in: `../images/webshapes/`

### Connection Theme Images (Recommended)
These images best represent the HealthConnect LinkedIn connection management theme:

1. ✅ **connection people.png** (Currently Active)
   - Abstract people icons
   - Connection/networking theme
   - Perfect for LinkedIn context
   - Size: 1.0 MB

2. **connection wave.png**
   - Wave/flow design
   - Represents data flow and connections
   - Size: 1.2 MB

3. **connection abstract.png**
   - Abstract connection graphics
   - Modern and professional
   - Size: 1.7 MB

### Tech/Pattern Images
More technical or pattern-based designs:

4. **Circuitboards.png**
   - Circuit board pattern
   - Tech/data theme
   - Size: 914 KB

5. **Patterns 1.png**
   - Geometric patterns
   - Clean and modern
   - Size: 849 KB

### Abstract Design Images
Modern abstract designs with unique identifiers:

6. **njdFKWQppEekuImXNaBoD.png** - Size: 1.5 MB
7. **wROq57YlcbIhbwp63yWL9.png** - Size: 1.6 MB
8. **VyepreJXDe_zr99z-j8Wr.png** - Size: 1.7 MB
9. **tB3cFKs2CtZKhuZD22Y0D.png** - Size: 1.5 MB
10. **C15vITB_Dyo_lb-S3-j-9.png** - Size: 1.5 MB
11. **NxaYh4ZlKX8lTIIW0yGbW.png** - Size: 1.4 MB
12. **SKrRwT1XRzPqLzTQOWf-z.png** - Size: 581 KB

## How to Change the Header Image

### Option 1: Edit the JavaScript File

Open `healthconnect-header.js` and find the `createHeaderHTML()` function (around line 240):

```javascript
<img src="../images/webshapes/connection people.png" alt="HealthConnect" class="healthconnect-logo">
```

Change to your preferred image:

```javascript
<img src="../images/webshapes/connection wave.png" alt="HealthConnect" class="healthconnect-logo">
```

### Option 2: Add Configuration Option

To make it easier to change in the future, you can add the image path to the configuration at the top of the file:

```javascript
const HEALTHCONNECT_CONFIG = {
    brandName: 'HealthConnect',
    brandColor: '#0077b5',
    accentColor: '#8b5cf6',
    logoImage: '../images/webshapes/connection people.png',  // Add this line
    navItems: [
        // ... navigation items
    ]
};
```

Then update the image tag to use the config:

```javascript
<img src="${HEALTHCONNECT_CONFIG.logoImage}" alt="HealthConnect" class="healthconnect-logo">
```

## Recommendations by Use Case

### For LinkedIn/Networking Focus
Best options:
- ✅ connection people.png (Current - Best match)
- connection wave.png
- connection abstract.png

### For Tech/Data Focus
Best options:
- Circuitboards.png
- Patterns 1.png
- SKrRwT1XRzPqLzTQOWf-z.png (smallest file size)

### For Modern/Abstract Look
Any of the abstract design images (items 6-12) would work well.

## Image Display Properties

The header logo has these CSS properties:

```css
.healthconnect-logo {
    width: 60px;
    height: 60px;
    object-fit: contain;
    filter: brightness(1.1) contrast(1.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    padding: 8px;
}
```

These properties ensure:
- ✓ Consistent size across all images
- ✓ Proper scaling without distortion
- ✓ Subtle enhancement filters
- ✓ Rounded corners with padding
- ✓ Semi-transparent background

## Testing Different Images

To test different images:

1. Open any HealthConnect page (e.g., `header-demo.html`)
2. Open browser developer tools (F12)
3. In the Console, run:
   ```javascript
   document.querySelector('.healthconnect-logo').src = '../images/webshapes/connection wave.png';
   ```
4. See the change instantly without editing files
5. Once you find one you like, update `healthconnect-header.js`

## Performance Notes

All images are relatively large (500KB - 1.7MB). The header:
- Loads images asynchronously
- Uses browser caching
- Applies `object-fit: contain` to prevent layout shift
- Shows gracefully if image fails to load

For best performance, consider:
- Using the smallest suitable image (SKrRwT1XRzPqLzTQOWf-z.png at 581KB)
- Optimizing images if possible
- Using CDN if available

---

**Current Selection:** connection people.png  
**Rationale:** Best represents LinkedIn networking and connection management theme









