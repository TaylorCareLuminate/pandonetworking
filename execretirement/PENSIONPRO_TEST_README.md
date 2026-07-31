# PensionPro Test Interface

## 📍 Location
`execretirement/pensionpro_test.html`

## 🎯 Purpose
This page provides a visual interface to test and interact with the PensionPro API integration. It allows you to:

- Test API connection
- Fetch client data from PensionPro
- View employee/lives counts
- Filter and search clients
- Export data to JSON
- Monitor Railway logs in real-time

## 🚀 Quick Start

### Access the Page

**Production:**
```
https://healthluminatesite-production.up.railway.app/execretirement/pensionpro_test.html
```

**Local Development:**
```
http://localhost:3000/execretirement/pensionpro_test.html
```

### First Steps

1. Click **"Test Connection"** to verify Railway backend is configured
2. Click **"Fetch All Clients"** to pull basic client data
3. Click **"Fetch with Employer Data"** to get detailed data including employee counts
4. Use the filter options to refine your search
5. Click **"Export Data"** to download results as JSON

## 🎨 Features

### 1. Connection Status Dashboard
- **API Status**: Shows if connected to PensionPro
- **Total Clients**: Number of clients loaded
- **Total Employees**: Aggregate employee count across all clients
- **Last Updated**: Timestamp of last data fetch

### 2. Test Controls
- **🔍 Test Connection**: Validates Railway backend and PensionPro credentials
- **📥 Fetch All Clients**: Retrieves basic client information
- **👥 Fetch with Employer Data**: Retrieves clients with expanded employer data (includes employee counts)
- **🗑️ Clear Logs**: Clears the Railway logs display
- **💾 Export Data**: Downloads current data as JSON file

### 3. Filter Options
- **Top N Results**: Limit number of records (max 1000)
- **Filter by Company Name**: Use OData filter syntax to search

### 4. Data Table
Displays client information in a sortable table:
- Client ID
- Company Name
- Internal ID
- Status (Active/Inactive)
- Location
- EIN
- **Employees/Lives** (👈 Key metric)
- Account Balance
- Actions (View details)

### 5. Railway Logs
Real-time log viewer showing:
- API requests and responses
- Success/error messages
- Performance metrics
- Timestamped entries

## 🔍 Finding Employee/Lives Data

The employee/lives count can be found in several possible fields:

```javascript
client.CurrentEmployerData.EmployeeCount
client.CurrentEmployerData.Lives
client.CurrentEmployerData.NumberOfEmployees
client.CurrentEmployerData.ParticipantCount
```

The test interface checks all of these fields and displays the first one found.

## 💡 Usage Tips

### Get Specific Clients
Use the filter box with OData syntax:

```
contains(CompanyName/DisplayName, 'Acme')
```

### Get Large Datasets
Use the "Top N Results" field:
- Default: 100
- Maximum: 1000
- For more than 1000, you'll need pagination (not yet implemented)

### Check Specific Metrics
1. Fetch with Employer Data to ensure all fields are available
2. Click "View" button on any client to see full details in console
3. Press F12 to open browser console for detailed data

### Export for Analysis
1. Fetch the data you want
2. Click "Export Data"
3. File downloads as `pensionpro_clients_YYYY-MM-DD.json`
4. Open in Excel, Google Sheets, or your preferred tool

## 🛠️ Technical Details

### API Calls
All requests go through the Railway backend:
```
Frontend → Railway (/api/pensionpro/*) → PensionPro API
```

### Authentication
Handled automatically by Railway backend using environment variables:
- `pensionproapi` - API Key
- `pensionpro_name` - Username

Format: `Authorization: {API_KEY}|{USERNAME}`

### Error Handling
- Connection errors show in red alerts
- API errors display with status codes
- All errors logged to the Railway logs section

## 🚨 Troubleshooting

### "Not Connected" Status
- Check Railway environment variables are set
- Verify Railway backend is deployed and running
- Check Railway URL in the page matches your deployment

### "Failed to fetch" Errors
- Check CORS is enabled on Railway
- Verify Railway backend is accessible
- Check browser console for specific errors

### No Employee Data Showing
- Make sure to click "Fetch with Employer Data"
- Not all clients may have employer data populated
- Check individual client details (View button) to see raw data

### Data Not Loading
- Check Railway logs for backend errors
- Verify PensionPro API credentials are valid
- Try "Test Connection" first to isolate the issue

## 📊 Example Queries

### Get All Active Clients
Filter: `IsDeactivated eq false`
Top: 100

### Get Clients with High Balances
Filter: `AccountBalance gt 100000`
Top: 50

### Search by Name
Filter: `contains(CompanyName/DisplayName, 'Corp')`
Top: 100

### Get Recent Clients
Filter: `CreatedOn gt 2024-01-01T00:00:00Z`
Top: 100

## 📈 Performance

- **Average Response Time**: 2-5 seconds for 100 clients
- **Maximum Records**: 1000 per request (API limit)
- **Recommended Batch Size**: 100-500 records
- **Export File Size**: ~50KB per 100 clients

## 🔄 Future Enhancements

Potential improvements:
- [ ] Pagination support for >1000 records
- [ ] Advanced filtering UI
- [ ] Sorting by column
- [ ] Graphs and charts
- [ ] Save filter presets
- [ ] Schedule automatic data pulls
- [ ] Compare data over time
- [ ] Export to Excel format
- [ ] Email reports

## 📞 Support

For issues or questions:
1. Check Railway logs for error details
2. Review the main setup guide: `/PENSIONPRO_SETUP.md`
3. Check PensionPro API documentation: https://api.pensionpro.com/swagger/index.html

## 📝 Notes

- Data is fetched in real-time (not cached)
- Large queries may take longer to process
- Export includes all currently loaded data
- Logs are cleared when page is refreshed

---

**Created**: November 5, 2025  
**Version**: 1.0.0  
**Dependencies**: Railway backend (`server.js`)





