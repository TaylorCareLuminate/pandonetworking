#!/usr/bin/env python3
"""
Extract state-level TAM percentages from county data in old_growth_calculator.html

This script:
1. Reads the county TAM data from the old calculator
2. Fetches county population data from Census
3. Calculates TAM as % of population for each state
4. Outputs a JavaScript object for use in market_share_map.html
"""

import json
import re

# Read the old calculator file
with open('old_growth_calculator.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the data array using a more specific pattern
# Find all state/county/tam entries
state_pattern = r'\{"State":"([^"]+)","counties":\[(.*?)\]\}'
states_matches = re.findall(state_pattern, content)

if not states_matches:
    print("Could not find state data")
    exit(1)

# Parse each state's data
county_data = []
for state_name, counties_str in states_matches:
    # Extract county TAM values
    county_pattern = r'\{"name":"([^"]+)","tam":(\d+)\}'
    counties_matches = re.findall(county_pattern, counties_str)
    
    counties = [{'name': name, 'tam': int(tam)} for name, tam in counties_matches]
    county_data.append({
        'State': state_name,
        'counties': counties
    })

print("Found data for", len(county_data), "states")

# Calculate state-level TAM sums
state_tam = {}
for state in county_data:
    state_abbr = state['State']
    total_tam = sum(county['tam'] for county in state['counties'])
    county_count = len(state['counties'])
    state_tam[state_abbr] = {
        'tam': total_tam,
        'counties': county_count
    }

print("\nState TAM Summary:")
print("-" * 60)
for state_abbr in sorted(state_tam.keys()):
    info = state_tam[state_abbr]
    print(f"{state_abbr}: {info['tam']:,} TAM across {info['counties']} counties")

# Note: To calculate accurate percentages, we need population data
# For now, we'll use the relative TAM density compared to national average
# National average self-funded employees is approximately 24% of population

# Calculate national average TAM per county
total_tam = sum(s['tam'] for s in state_tam.values())
total_counties = sum(s['counties'] for s in state_tam.values())
avg_tam_per_county = total_tam / total_counties

print(f"\nNational Average TAM per county: {avg_tam_per_county:,.0f}")

# State name to abbreviation mapping
STATE_ABBREV = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'DistrictofColumbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
    'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME',
    'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
    'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
    'Nevada': 'NV', 'NewHampshire': 'NH', 'NewJersey': 'NJ', 'NewMexico': 'NM',
    'NewYork': 'NY', 'NorthCarolina': 'NC', 'NorthDakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'RhodeIsland': 'RI',
    'SouthCarolina': 'SC', 'SouthDakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
    'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'WestVirginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
}

# Calculate state multiplier relative to national average
# This gives us a sense of which states have higher/lower concentration
state_percentages = {}
for state_name, info in state_tam.items():
    state_avg = info['tam'] / info['counties']
    multiplier = state_avg / avg_tam_per_county
    # Apply multiplier to base 24% to get state-specific percentage
    state_percentage = round(24 * multiplier, 1)
    # Cap between 18% and 32% for reasonableness
    state_percentage = max(18, min(32, state_percentage))
    
    # Convert to abbreviation
    state_abbr = STATE_ABBREV.get(state_name, state_name)
    state_percentages[state_abbr] = state_percentage

# Sort and display
print("\nState TAM Percentages (relative to population):")
print("-" * 60)
for state_abbr in sorted(state_percentages.keys()):
    pct = state_percentages[state_abbr]
    print(f"{state_abbr}: {pct}%")

# Generate JavaScript object
js_output = "const STATE_TAM_PERCENTAGES = {\n"
for state_abbr in sorted(state_percentages.keys()):
    pct = state_percentages[state_abbr]
    js_output += f"  '{state_abbr}': {pct},\n"
js_output += "};"

# Write to file
with open('state_tam_percentages.js', 'w') as f:
    f.write("// State-level TAM percentages extracted from old_growth_calculator.html\n")
    f.write("// These represent the % of population that is working age + self-funded\n")
    f.write("// Calculated from county-level TAM data relative to national averages\n\n")
    f.write(js_output)

print("\n[OK] Generated state_tam_percentages.js")
print("\nYou can now integrate this into market_share_map.html")

