# Mentavi Client Portal

This directory contains the client-facing portal for Mentavi clients to view and manage their accounts.

## Features

### 🔐 Secure Access
- **Authentication Required**: Users must be logged in with Firebase authentication
- **Domain-Based Authorization**: Only users from authorized client domains can access their accounts
- **Customer Isolation**: Clients can only see and edit their own organization's accounts

### 📧 Email Account Management
- View all email accounts for the client's organization
- See account status (Active/Inactive)
- Monitor usage statistics (daily/hourly sends, total emails)
- Edit account settings:
  - Account name
  - Daily email limits
  - BCC email addresses

### 💼 LinkedIn Account Management
- View LinkedIn accounts configured for outreach
- Monitor connection and messaging limits
- Edit account settings:
  - Account name
  - Daily connection limits
  - Daily message limits

### 📞 Phone Account Management
- View phone accounts for calling/SMS campaigns
- Monitor usage and limits
- Edit account settings:
  - Account name
  - Daily call limits
  - Daily SMS limits

## Security Features

### Client Isolation
The portal ensures strict data isolation between clients:

1. **Domain-Based Identification**: The system identifies the client's organization based on their email domain
2. **Customer Record Matching**: Users are matched to their customer record in the database
3. **Account Filtering**: Only accounts belonging to the user's customer ID are displayed
4. **Edit Restrictions**: Users can only modify accounts that belong to their organization

### Authentication Flow
1. User logs in via Firebase authentication
2. System validates the user's email domain
3. System finds the matching customer record
4. Only accounts for that customer are loaded and displayed

## File Structure

```
mentavi/
├── client-portal.html    # Main client portal page
└── README.md            # This documentation file
```

## Usage

1. **Access**: Navigate to `/mentavi/client-portal.html`
2. **Login**: Use your organization's email address to authenticate
3. **View Accounts**: Browse your email, LinkedIn, and phone accounts
4. **Edit Settings**: Click "Edit Settings" on any account to modify limits and configurations

## Technical Details

### Firebase Integration
- Uses the centralized HealthLuminate authentication system
- Connects to the CLEmail Firebase project for account data
- Implements real-time data loading and updates

### Data Sources
- **Authentication**: `healthcareitdatabase` Firebase project
- **Account Data**: `clemail` Firebase project
- **Collections**: `customerList`, `emailAccounts`, `linkedinAccounts`, `phoneAccounts`

### Client Identification Logic
The system identifies clients through multiple methods:
1. Direct domain matching (customer.domain)
2. Contact email domain matching
3. Known Mentavi client domain patterns
4. Customer name pattern matching for Mentavi

## Customization

To add support for additional client organizations:

1. **Add Domain Patterns**: Update the `mentaviClientDomains` array in the JavaScript
2. **Customer Records**: Ensure proper customer records exist in the `customerList` collection
3. **Domain Mapping**: Update the `findClientCustomer` function if needed

## Support

For technical support or to add new client domains, contact the HealthLuminate development team.
