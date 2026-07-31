# Firestore Indexes - Copy/Paste Guide

## How to Create Indexes Manually

1. Go to: https://console.firebase.google.com
2. Select your project
3. Click **Firestore Database** in left menu
4. Click **Indexes** tab at top
5. Click **Create Index** button
6. Copy/paste the values below for each index

---

## INDEX 1: Load Agent's Reserved Calls

**Purpose**: When agent loads their reserved calls

```
Collection ID: phone_activities
Fields to index:
  1. campaignId          → Ascending
  2. assignedTo          → Ascending
  3. status              → Ascending
  4. scheduledDate       → Ascending

Query scope: Collection
```

**How to enter**:
- Collection ID: `phone_activities`
- Click "Add field" 4 times and enter each field name
- Set each to "Ascending"
- Click "Create"

---

## INDEX 2: Load Pool Calls

**Purpose**: When agent loads unassigned pool calls

```
Collection ID: phone_activities
Fields to index:
  1. campaignId          → Ascending
  2. assignedTo          → Ascending
  3. scheduledDate       → Ascending
  4. status              → Ascending

Query scope: Collection
```

**How to enter**:
- Collection ID: `phone_activities`
- Click "Add field" 4 times
- Set each to "Ascending"
- Click "Create"

---

## INDEX 3: Nightly Expiry Job

**Purpose**: For automated cleanup of expired reservations

```
Collection ID: phone_activities
Fields to index:
  1. assignmentType      → Ascending
  2. reservationDeadline → Ascending
  3. status              → Ascending

Query scope: Collection
```

**How to enter**:
- Collection ID: `phone_activities`
- Click "Add field" 3 times
- Set each to "Ascending"
- Click "Create"

---

## INDEX 4: Priority Sorting (Optional but recommended)

**Purpose**: For sorting calls by priority score

```
Collection ID: phone_activities
Fields to index:
  1. campaignId          → Ascending
  2. status              → Ascending
  3. priorityScore       → Descending

Query scope: Collection
```

**How to enter**:
- Collection ID: `phone_activities`
- Click "Add field" 3 times
- First two: "Ascending"
- priorityScore: "Descending"
- Click "Create"

---

## After Creating Indexes

1. **Wait 5-15 minutes** for indexes to build
2. Status will show "Building..." then "Enabled"
3. You can continue to next step (migration script) while waiting
4. Indexes will be ready by the time you need them

---

## Troubleshooting

**"Index already exists"**
- Skip it, you already have it!

**"Building for a long time"**
- Large databases take longer
- Usually done in 5-15 minutes
- Can take up to 30 minutes for very large databases

**"How do I know they're ready?"**
- Check Firebase Console → Firestore → Indexes
- Status should show "Enabled" (green)

