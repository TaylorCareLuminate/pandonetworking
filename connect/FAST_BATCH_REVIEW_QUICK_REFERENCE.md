# ⚡ Fast Batch Review - Quick Reference

**One-Page Guide for Admins**

---

## 🚀 Quick Start (30 seconds)

1. Click **Admin** → **Fast Batch Review** in header
2. Select a **BDR** from dropdown
3. Enter number of messages (default 25)
4. Click **Load Messages**
5. Check boxes: ✅ Approve / ⛔ Exclude / 🗑️ Delete
6. Click **Submit Batch**
7. Done! Load next batch

---

## 📋 What Gets Displayed

Each message card shows:
- ✓ Contact name, title, company
- ✓ LinkedIn post text
- ✓ Reshared post content (if any)
- ✓ Message to be sent
- ✓ Links to profile & post

---

## ✅ Three Actions

| Checkbox | What It Does | Color |
|----------|--------------|-------|
| **Approve** | Sends to Queue 2 (or approves if internal BDR) | Green |
| **Exclude Contact** | Adds to exclusion list, deletes message | Yellow |
| **Delete Message** | Removes message from queue | Red |

**Leave unchecked** = No action, stays in queue

---

## 💡 Add Prefix Feature

**Purpose**: Add the same opening line to ALL approved messages

**Example**:
- Type: "Hope you had a great break!"
- Result: Added to beginning of every approved message

**When to use**:
- Post-holiday greetings
- Seasonal messages
- Standard opening lines

---

## ⚡ Speed Tips

1. **Visual Scanning**: Scroll quickly, look for quality issues
2. **Batch Similar**: All good? Check all approve at once
3. **Skip Marginal**: Unsure? Leave unchecked, review later in traditional queue
4. **Use Prefix**: Save time vs. editing each message individually

---

## ⚠️ Important

- ✓ Changes ONLY happen when you click "Submit Batch"
- ✓ Confirmation dialog shows exact counts
- ✓ **Cannot undo** - be sure before submitting
- ✓ Admin only - BDRs can't access this page
- ✓ Unchecked messages are never touched

---

## 📊 Typical Workflow

**Morning Queue Processing**:
```
Load 50 messages
Scan in 5 minutes
Check: 45 approve, 3 exclude, 2 delete
Add prefix: "Hope your week is going great!"
Submit batch
Load next 50, repeat
```

**Time Savings**: 60-80% faster than one-by-one review

---

## 🎯 When to Use Fast Batch vs Traditional Review

### Use Fast Batch When:
- ✓ Queue has 20+ messages
- ✓ Most messages are likely good quality
- ✓ Need to add same prefix to many messages
- ✓ Want to quickly clear the queue

### Use Traditional Review When:
- ✓ Need to carefully edit specific messages
- ✓ Want to see full message history
- ✓ Reviewing complex or sensitive messages
- ✓ Only a few messages to process

---

## 🔢 Recommended Batch Sizes

| Queue Size | Batch Size | Approach |
|------------|-----------|----------|
| < 20 | Use traditional review | More control |
| 20-50 | 25-30 | Manageable scanning |
| 50-100 | 40-50 | Efficient processing |
| 100+ | 50-75 | Multiple batches |

Max: 100 messages per batch

---

## 🎨 Visual Indicators

```
No Selection:    [ ] White background, no border
Approved:        [✓] Green left border + light green bg
Excluded:        [✓] Yellow left border + light yellow bg
Deleted:         [✓] Red left border + light red bg
```

---

## 🔑 Keyboard Workflow (Manual)

While there aren't keyboard shortcuts built-in yet, here's an efficient workflow:

1. Use **Tab** to navigate between checkboxes
2. Use **Space** to check/uncheck
3. Use **Scroll** to quickly scan messages
4. Use **Mouse** for final submission

---

## 📈 Success Metrics

After submitting, you'll see:
- ✅ **X messages processed successfully**
- ⚠️ **Y messages failed** (rare - check console)
- Auto-loads next batch ready to go

---

## 🆘 Troubleshooting

**No messages loading?**
- Check if BDR is selected
- Verify BDR has messages in Queue 1
- Try different BDR

**Can't submit batch?**
- Must check at least one message
- Confirmation dialog required

**Error processing messages?**
- Check browser console (F12)
- Note which messages failed
- Contact developer with details

---

## 📞 Need Help?

- **Documentation**: `FEATURE_FAST_BATCH_REVIEW.md` (detailed guide)
- **Traditional Review**: Use `connect_review.html` for complex cases
- **Support**: Contact development team

---

**Location**: Admin → Fast Batch Review  
**Icon**: ⚡ Lightning bolt  
**Access**: Admin only




