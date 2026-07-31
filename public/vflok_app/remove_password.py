#!/usr/bin/env python3
"""
Remove Password and Auto-Load All Data
This script modifies the dashboard to remove password protection
and automatically load all data on startup.
"""

import re
import sys
from pathlib import Path

def main():
    # File paths
    html_file = Path('renderer/index_base.html')
    backup_file = Path('renderer/index_base.html.backup')
    
    print("================================================================")
    print("  Removing Password and Auto-Loading Data")
    print("================================================================")
    print()
    
    # Check if file exists
    if not html_file.exists():
        print(f"[ERROR] File not found: {html_file}")
        input("Press Enter to exit...")
        sys.exit(1)
    
    # Backup
    if not backup_file.exists():
        print("[1/4] Creating backup...")
        backup_file.write_text(html_file.read_text(encoding='utf-8'), encoding='utf-8')
        print("  [OK] Backed up original file")
    else:
        print("[1/4] Backup already exists")
    print()
    
    # Read content
    print("[2/4] Reading file...")
    content = html_file.read_text(encoding='utf-8')
    print("  [OK] File loaded")
    print()
    
    # Make changes
    print("[3/4] Applying changes...")
    
    # 1. Remove password modal
    content = re.sub(
        r'<!-- Password Modal -->.*?<!-- Disclaimer Modal -->',
        '<!-- Password Modal Removed -->\n\n  <!-- Disclaimer Modal -->',
        content,
        flags=re.DOTALL
    )
    print("  [OK] Removed password modal")
    
    # 2. Disable password check function
    content = re.sub(
        r'window\.checkPassword\s*=\s*function\(\)\s*{[^}]*PAGE_PASSWORD[^}]*};',
        '// Password check removed - authentication disabled',
        content,
        flags=re.DOTALL
    )
    print("  [OK] Disabled password check")
    
    # 3. Disable checkAuth function  
    content = re.sub(
        r'function checkAuth\(\)\s*{[^}]*passwordModal[^}]*}',
        'function checkAuth() { /* Authentication disabled - load data directly */ loadHospitalsData(); }',
        content,
        flags=re.DOTALL
    )
    print("  [OK] Disabled auth check")
    
    # 4. Set allDataLoaded to true by default
    content = content.replace(
        'let allDataLoaded = false;',
        'let allDataLoaded = true;  // Auto-load all data'
    )
    print("  [OK] Enabled auto-load all data")
    
    # 5. Hide "Load All Data" button
    content = re.sub(
        r'(<div id="dataLoadingIndicator"[^>]*>)',
        r'\1<!-- Auto-hidden - all data loads automatically --> <div style="display: none;">',
        content
    )
    content = content.replace(
        '</button>\n    </div>\n    \n    <!-- All Data Loaded Indicator',
        '</button>\n    </div></div><!-- End auto-hidden section -->\n    \n    <!-- All Data Loaded Indicator'
    )
    print("  [OK] Hid load data button")
    
    # 6. Show "All Data Loaded" indicator by default
    content = content.replace(
        'id="allDataLoadedIndicator" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid var(--success); padding: 1rem 1.5rem; border-radius: var(--border-radius); margin-bottom: 1.5rem; display: none;',
        'id="allDataLoadedIndicator" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid var(--success); padding: 1rem 1.5rem; border-radius: var(--border-radius); margin-bottom: 1.5rem; display: flex;'
    )
    print("  [OK] Show loaded indicator")
    
    print()
    
    # Write changes
    print("[4/4] Saving changes...")
    html_file.write_text(content, encoding='utf-8')
    print("  [OK] File saved")
    print()
    
    print("================================================================")
    print("  SUCCESS! Changes Applied")
    print("================================================================")
    print()
    print("  Your dashboard now:")
    print("  - NO password required")
    print("  - Loads ALL data automatically")
    print("  - Ready for clients!")
    print()
    print("  Next step: Run RUN_APP.bat to test")
    print()
    print("================================================================")
    print()

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    input("Press Enter to close...")
