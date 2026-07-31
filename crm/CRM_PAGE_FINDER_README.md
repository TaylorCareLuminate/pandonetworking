# CRM Page Finder

## Overview
A comprehensive search and navigation system for finding CRM pages quickly. Located at the **top of the CRM Home page** (`home.html`), it provides both search functionality and taxonomy-based browsing.

## Features

### 🔍 Smart Search
- **Full-text search** across page titles, descriptions, and keywords
- **Real-time results** as you type
- **Relevance ranking** - title matches appear first
- **Highlighted matches** - search terms are highlighted in yellow
- **Minimum 2 characters** to start searching
- **Keyboard shortcut** - Press `Ctrl+K` (or `Cmd+K` on Mac) to open search

### 📂 Taxonomy Browser
- **7 Main Categories**:
  - **Email & Outreach** - Email campaign management and inbox tools
  - **LinkedIn & Social** - LinkedIn outreach and HeyReach integration
  - **Phone & Calls** - Phone campaign management and call scheduling
  - **Lead Management** - Lead tracking and contact management
  - **Analytics & Reporting** - Performance dashboards and activity logs
  - **Campaign Tools** - Tools for managing various outreach campaigns
  - **Administration** - System settings and user management
- **Subcategory Filtering** - Refine results within a selected main category
- **Visual Cards** - Easy-to-understand category cards with icons and descriptions
- **Page Counts** - See how many pages are in each category

### 🚀 How to Use

1. **Access the Finder**: Open `home.html` (CRM Home). The "Find CRM Pages" section is at the top of the page.
2. **Toggle Visibility**: Click the header or the chevron icon to expand/collapse the finder.
3. **Search**:
   - Type at least 2 characters into the search bar.
   - Results will appear dynamically, sorted by relevance.
   - Click on a result to navigate to the CRM page.
4. **Browse by Category**:
   - Click on any of the category cards (e.g., "Email & Outreach").
   - The search results will update to show pages only within that category.
   - If subcategories exist, filter buttons will appear. Click a subcategory button to further refine results.
   - Click the "Clear Filter" button to return to all pages in the category.
5. **Clear Search**: Click the "Clear" button in the results header or press `Escape` to reset.
6. **Persistent State**: The finder remembers whether you had it collapsed or expanded (stored in localStorage).

## Technical Details

### `crm-pages-catalog.json`
- **Location**: `crm/js/crm-pages-catalog.json`
- **Purpose**: Stores all CRM page metadata, including:
  - `version`, `lastUpdated`
  - `taxonomy`: Defines main categories, their icons, descriptions, and subcategories.
  - `pages`: An array of objects, each representing a CRM page with:
    - `title`: Display name of the page.
    - `filename`: The HTML filename (e.g., `inbox.html`).
    - `shortSummary`: Concise description.
    - `longSummary`: Detailed description.
    - `category`: Main category (e.g., "Email & Outreach").
    - `subcategory`: Specific subcategory (e.g., "Compose & Send").
    - `keywords`: An array of additional search terms.

### `home.html` Modifications
- **HTML Structure**: A new `div.crm-finder` was added at the top of the `div.container` to house the search input, taxonomy browser, and results.
- **CSS Styling**: New styles were added to the `<style>` block to define the visual appearance of the finder, including responsive design considerations and hover effects.
- **JavaScript Logic**: A new `<script>` block was added at the end of the `<body>` to implement:
  - `toggleFinder()`: Shows/hides the search interface.
  - `loadCrmPagesCatalog()`: Fetches and parses `crm-pages-catalog.json`.
  - `renderTaxonomy()`: Dynamically creates category cards.
  - `selectCategory(categoryName)`: Filters results by main category and renders subcategory filters.
  - `displaySubcategoryFilters(categoryName)`: Creates buttons for subcategories.
  - `filterBySubcategory(subcategoryName)`: Filters results by subcategory.
  - `clearSubcategoryFilter()`: Clears subcategory filter.
  - `searchCRMPages()`: The core search logic, filtering by search input and rendering results with highlighting.
  - `displayResults()`: Renders search results with highlighting and category badges.
  - `navigateToPage()`: Navigates to the selected page.
  - `clearSearch()`: Resets search state and hides results.
  - Event listeners for `DOMContentLoaded` and keyboard shortcuts.

## Dependencies
- Font Awesome (for icons)
- Standard browser APIs (Fetch API, DOM manipulation, localStorage)

## Future Enhancements
- Add debounce to search input for performance optimization.
- Implement fuzzy search algorithms for better matching.
- Allow multi-select for categories/subcategories.
- Add favorites/bookmarks functionality.
- Track most-used pages and show them in a "Frequently Accessed" section.
- Add search history.

